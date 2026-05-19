import type { Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import type { createChildLogger } from "../logger";
import type { MediaController } from "../media/mediaController";
import type { ModerationBroadcaster } from "../moderation/types";
import { createVoiceAudioBridge } from "./voiceAudioBridge";

type Logger = ReturnType<typeof createChildLogger>;

type ActiveUsers = Map<
  string,
  { username: string; avatar: string; speaking: boolean }
>;

export interface WebSocketServerOptions {
  server: HttpServer;
  port: number;
  wsPath: string;
  broadcaster: ModerationBroadcaster;
  activeUsers: ActiveUsers;
  getSharedUIState: () => unknown;
  mediaController: MediaController;
  logger: Logger;
}

export function startWebSocketServer(options: WebSocketServerOptions) {
  const wss = new WebSocketServer({
    server: options.server,
    path: options.wsPath,
  });
  const voiceAudioBridge = createVoiceAudioBridge(options.logger);

  options.logger.info(
    { port: options.port, wsPath: options.wsPath },
    "WebSocket server listening",
  );

  wss.on("connection", (ws) => {
    options.logger.info(
      { port: options.port, wsPath: options.wsPath },
      "New WebSocket connection",
    );
    options.broadcaster.addClient(ws);

    ws.send(
      JSON.stringify({
        type: "user_state",
        users: Array.from(options.activeUsers.entries()).map(([id, data]) => ({
          id,
          ...data,
        })),
      }),
    );
    ws.send(
      JSON.stringify({ type: "ui_state", state: options.getSharedUIState() }),
    );
    ws.send(
      JSON.stringify({
        type: "media_state",
        state: options.mediaController.getState(),
      }),
    );

    ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (!Buffer.isBuffer(data)) return;
      voiceAudioBridge.handleBrowserAudio(data);
    });

    ws.on("close", () => {
      options.broadcaster.removeClient(ws);
    });
    ws.on("error", () => {
      options.broadcaster.removeClient(ws);
    });
  });

  return wss;
}
