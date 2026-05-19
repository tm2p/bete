import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js-selfbot-v13";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { WebSocketServer } from "ws";
import { config } from "./config";
import { AppError } from "./errors";
import { createChildLogger, logger } from "./logger";
import { MediaController } from "./media/mediaController";
import { createScreenShareController } from "./media/screenShareController";
import { getMetrics, uptimeGauge } from "./metrics";
import { createBroadcaster } from "./moderation/broadcaster";
import { createSharedUIStateStore } from "./state/uiState";
import { Streamer } from "./streaming";
import type { VoiceController } from "./voiceController";
import {
  initializeMediaSettings,
  persistMediaSettings,
} from "./state/mediaSettings";
import { createAnalysisRoutes } from "./routes/analysisRoutes";
import { createMediaRoutes } from "./routes/mediaRoutes";
import { createMessageRoutes } from "./routes/messageRoutes";
import { createRecordingsRoutes } from "./routes/recordingsRoutes";
import { createSyncRoutes } from "./routes/syncRoutes";
import { createUIStateRoutes } from "./routes/uiStateRoutes";
import { createVoiceRoutes } from "./routes/voiceRoutes";
import {
  exposeActiveUserGlobal,
  exposeModerationGlobals,
  exposePcmBroadcastGlobal,
  exposeVideoBroadcastGlobal,
} from "./ws/broadcastGlobals";
import { createVoiceAudioBridge } from "./ws/voiceAudioBridge";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wsLogger = createChildLogger("webserver");

const activeUsers = new Map<
  string,
  { username: string; avatar: string; speaking: boolean }
>();

export async function startWebserver(
  port: number = 3000,
  _client: Client,
  voiceController: VoiceController,
) {
  const { getSharedUIState, patchSharedUIState } = await createSharedUIStateStore();
  let mediaSettings = await initializeMediaSettings();

  const app = express();
  const server = http.createServer(app);

  const wsPath = "/ws";
  const wss = new WebSocketServer({ server, path: wsPath });
  wsLogger.info({ port, wsPath }, "WebSocket server listening");

  // Create broadcaster instance
  const broadcaster = createBroadcaster();
  exposeModerationGlobals(broadcaster, config.ADMIN_PASSWORD);

  const streamer = new Streamer(_client);
  const screenController = createScreenShareController({
    getVoiceStatus: () => voiceController.getStatus(),
    streamer,
    useTranscoder: true,
    onBeforeStreamStart: async (guildId: string, channelId: string) => {
      await voiceController.disconnect();
      // Wait for Discord gateway to fully process the disconnect
      await new Promise((resolve) => setTimeout(resolve, 1500));
    },
    onAfterStreamEnd: async (guildId: string, channelId: string) => {
      const current = voiceController.getStatus();
      if (current.connected && current.activeGuildId === guildId) return;
      await voiceController.connect(guildId, channelId);
    },
  });

  const mediaController = new MediaController({
    isVoiceConnected: () => voiceController.getStatus().connected,
    isBrowserStreaming: () => getSharedUIState().isStreaming,
    screenController,
    onStateChange: (state) => broadcaster.mediaState(state),
    initialMusicVolume: mediaSettings.musicVolume,
    onMusicVolumeChange: async (volume) => {
      mediaSettings = { ...mediaSettings, musicVolume: volume };
      await persistMediaSettings(mediaSettings);
    },
  });

  // Security headers. CSP disabled because the current static UI uses inline scripts/styles.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store");
    }
    res.on("finish", () => {
      if (req.originalUrl.startsWith("/.well-known/appspecific/")) return;
      if (req.originalUrl === "/favicon.ico") return;
      if (res.statusCode >= 400) {
        logger.error(
          {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
          },
          "HTTP request failed",
        );
      }
    });
    next();
  });
  app.use(express.json());

  app.use(express.static(path.join(__dirname, "../public")));
  app.use(express.static(path.join(__dirname, "../public/app")));

  app.get("/", (_req: Request, res: Response) => {
    const reactIndex = path.join(__dirname, "../public/app/index.html");
    if (fs.existsSync(reactIndex)) {
      res.sendFile(reactIndex);
      return;
    }
    res
      .status(503)
      .send("React dashboard is not built. Run pnpm run build:web.");
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      activeUsers: activeUsers.size,
      wsClients: broadcaster.clientCount(),
    });
  });

  // Metrics endpoint
  app.get("/metrics", async (_req: Request, res: Response) => {
    res.set("Content-Type", "text/plain");
    uptimeGauge.set(process.uptime());
    res.send(await getMetrics());
  });

  // Simple password-based auth
  app.post("/api/auth/login", (req: Request, res: Response) => {
    const { password } = req.body;
    if (password === config.ADMIN_PASSWORD) {
      res.json({ ok: true });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  });

  // Register route modules
  app.use(
    "/api",
    createUIStateRoutes({ getSharedUIState, patchSharedUIState }),
  );
  app.use(
    "/api",
    createVoiceRoutes({
      voiceController,
      patchSharedUIState,
      broadcaster,
      adminPassword: config.ADMIN_PASSWORD,
    }),
  );
  app.use("/api", createMessageRoutes());
  app.use("/api", createAnalysisRoutes());
  app.use("/api", createSyncRoutes(_client));
  app.use("/api", createRecordingsRoutes());
  app.use(
    "/api",
    createMediaRoutes(mediaController, {
      adminPassword: config.ADMIN_PASSWORD,
    }),
  );

  function broadcastUserState() {
    const users = Array.from(activeUsers.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));
    broadcaster.userState(users);
  }

  exposePcmBroadcastGlobal(broadcaster);
  exposeVideoBroadcastGlobal(() => broadcaster.getClients(), wsLogger);
  exposeActiveUserGlobal(activeUsers, broadcastUserState);

  const voiceAudioBridge = createVoiceAudioBridge(wsLogger);

  wss.on("connection", (ws) => {
    wsLogger.info({ port, wsPath }, "New WebSocket connection");
    broadcaster.addClient(ws);

    ws.send(
      JSON.stringify({
        type: "user_state",
        users: Array.from(activeUsers.entries()).map(([id, data]) => ({
          id,
          ...data,
        })),
      }),
    );
    ws.send(JSON.stringify({ type: "ui_state", state: getSharedUIState() }));
    ws.send(
      JSON.stringify({
        type: "media_state",
        state: mediaController.getState(),
      }),
    );

    ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (!Buffer.isBuffer(data)) return;
      voiceAudioBridge.handleBrowserAudio(data);
    });

    ws.on("close", () => {
      broadcaster.removeClient(ws);
    });
    ws.on("error", () => {
      broadcaster.removeClient(ws);
    });
  });

  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
        });
        return;
      }

      wsLogger.error({ error }, "Unhandled webserver error");
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      });
    },
  );

  server.listen(port, "0.0.0.0", () => {
    wsLogger.info({ port }, "Web interface listening");
  });
}
