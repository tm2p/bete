# Aggressive Codebase Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current webserver/bootstrap monolith into focused modules, preserve runtime behavior, then clean dependencies using evidence.

**Architecture:** `src/index.ts` becomes a thin entrypoint that delegates startup to `src/app/bootstrap.ts`. HTTP app creation, WebSocket lifecycle, browser audio bridge, broadcast globals, UI state, media settings, and PCM utilities become separate modules with stable interfaces. Dependency cleanup happens only after the structural refactor passes typecheck/tests.

**Tech Stack:** Node.js, TypeScript ESM, Express 5, ws, discord.js-selfbot-v13, @discordjs/voice, prism-media, Winston, Vitest, Biome, pnpm.

---

## File Structure

Create:

- `src/app/bootstrap.ts` — app startup, Discord client creation, ready/error/debug handlers, server startup.
- `src/app/shutdown.ts` — graceful shutdown handler factory.
- `src/audio/pcm.ts` — pure PCM helpers extracted from `src/webserver.ts`.
- `src/state/uiState.ts` — persisted shared UI state helpers.
- `src/state/mediaSettings.ts` — persisted media settings helpers.
- `src/ws/broadcastGlobals.ts` — all temporary `globalThis` compatibility wiring.
- `src/ws/voiceAudioBridge.ts` — browser PCM buffer, Opus encoder, Discord player bridge.
- `src/ws/server.ts` — WebSocket connection lifecycle.
- `src/http/health.ts` — health, metrics, and auth router.
- `src/http/app.ts` — Express app setup, middleware, static files, route mounting, error handler.
- `src/http/server.ts` — HTTP server orchestration and dependency assembly.
- `tests/audio/pcm.test.ts` — unit tests for PCM helpers.
- `tests/state/uiState.test.ts` — unit tests for UI state normalization.

Modify:

- `src/index.ts` — replace inline startup logic with `initializeApp()` call.
- `src/webserver.ts` — reduce to compatibility facade exporting `startWebserver` from `src/http/server.ts`, or delete after all imports are updated.
- `tests/validation.test.ts` or relevant smoke tests only if imports reference moved symbols.
- `package.json` — dependency cleanup only after audit proves changes safe.
- `pnpm-lock.yaml` — update only if `package.json` changes.

Do not modify:

- REST endpoint paths.
- WebSocket payload shapes.
- Discord audio frame constants or timing.
- Database schema or migrations.
- Dashboard behavior.

---

### Task 1: Extract PCM Utilities

**Files:**
- Create: `src/audio/pcm.ts`
- Create: `tests/audio/pcm.test.ts`
- Modify: `src/webserver.ts`

- [ ] **Step 1: Write failing PCM tests**

Create `tests/audio/pcm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rmsDb, upsample24kMonoTo48kStereo } from "../../src/audio/pcm";

describe("PCM helpers", () => {
  it("upsamples 24kHz mono s16le to 48kHz stereo s16le", () => {
    const input = Buffer.alloc(4);
    input.writeInt16LE(1000, 0);
    input.writeInt16LE(-1000, 2);

    const output = upsample24kMonoTo48kStereo(input);

    expect(output.length).toBe(16);
    expect(output.readInt16LE(0)).toBe(1000);
    expect(output.readInt16LE(2)).toBe(1000);
    expect(output.readInt16LE(4)).toBe(1000);
    expect(output.readInt16LE(6)).toBe(1000);
    expect(output.readInt16LE(8)).toBe(-1000);
    expect(output.readInt16LE(10)).toBe(-1000);
    expect(output.readInt16LE(12)).toBe(-1000);
    expect(output.readInt16LE(14)).toBe(-1000);
  });

  it("calculates RMS dB for non-silent PCM", () => {
    const input = Buffer.alloc(4);
    input.writeInt16LE(32767, 0);
    input.writeInt16LE(32767, 2);

    expect(rmsDb(input)).toBeCloseTo(0, 1);
  });
});
```

- [ ] **Step 2: Run failing PCM tests**

Run:

```bash
pnpm vitest run tests/audio/pcm.test.ts
```

Expected: FAIL because `src/audio/pcm.ts` does not exist.

- [ ] **Step 3: Create PCM helper implementation**

Create `src/audio/pcm.ts`:

```ts
export function upsample24kMonoTo48kStereo(mono24k: Buffer): Buffer {
  const numSamples = mono24k.length / 2;
  const out = Buffer.alloc(numSamples * 8);

  for (let i = 0; i < numSamples; i++) {
    const sample = mono24k.readInt16LE(i * 2);
    const base = i * 8;
    out.writeInt16LE(sample, base);
    out.writeInt16LE(sample, base + 2);
    out.writeInt16LE(sample, base + 4);
    out.writeInt16LE(sample, base + 6);
  }

  return out;
}

export function rmsDb(pcm: Buffer): number {
  let sum = 0;
  const samples = pcm.length / 2;

  for (let i = 0; i < samples; i++) {
    const sample = pcm.readInt16LE(i * 2) / 32768;
    sum += sample * sample;
  }

  const rms = Math.sqrt(sum / samples);
  return 20 * Math.log10(rms);
}
```

- [ ] **Step 4: Replace local helpers in `src/webserver.ts`**

Add import near existing imports:

```ts
import { rmsDb, upsample24kMonoTo48kStereo } from "./audio/pcm";
```

Delete local `upsample` and `rmsDb` functions from `src/webserver.ts`.

Replace:

```ts
const upsampled = upsample(data);
```

with:

```ts
const upsampled = upsample24kMonoTo48kStereo(data);
```

- [ ] **Step 5: Verify PCM extraction**

Run:

```bash
pnpm vitest run tests/audio/pcm.test.ts
pnpm run typecheck
```

Expected: tests PASS and typecheck PASS.

- [ ] **Step 6: Commit PCM extraction**

```bash
git add src/audio/pcm.ts src/webserver.ts tests/audio/pcm.test.ts
git commit -m "refactor: extract pcm audio helpers"
```

---

### Task 2: Extract UI State

**Files:**
- Create: `src/state/uiState.ts`
- Create: `tests/state/uiState.test.ts`
- Modify: `src/webserver.ts`

- [ ] **Step 1: Write failing UI state tests**

Create `tests/state/uiState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeSharedUIState } from "../../src/state/uiState";

describe("normalizeSharedUIState", () => {
  it("maps legacy selectedGuild into voice and text guilds", () => {
    expect(normalizeSharedUIState({ selectedGuild: "guild-1" })).toEqual({
      selectedVoiceGuild: "guild-1",
      selectedVoiceChannel: "",
      selectedTextGuild: "guild-1",
      selectedTextChannel: "",
      activeTab: "voice",
      isListening: false,
      isStreaming: false,
    });
  });

  it("keeps valid explicit values", () => {
    expect(
      normalizeSharedUIState({
        selectedVoiceGuild: "voice-guild",
        selectedVoiceChannel: "voice-channel",
        selectedTextGuild: "text-guild",
        selectedTextChannel: "text-channel",
        activeTab: "media",
        isListening: true,
        isStreaming: true,
      }),
    ).toEqual({
      selectedVoiceGuild: "voice-guild",
      selectedVoiceChannel: "voice-channel",
      selectedTextGuild: "text-guild",
      selectedTextChannel: "text-channel",
      activeTab: "media",
      isListening: true,
      isStreaming: true,
    });
  });

  it("falls back to voice tab for invalid activeTab", () => {
    expect(normalizeSharedUIState({ activeTab: "bad" })).toMatchObject({
      activeTab: "voice",
    });
  });
});
```

- [ ] **Step 2: Run failing UI state tests**

Run:

```bash
pnpm vitest run tests/state/uiState.test.ts
```

Expected: FAIL because `src/state/uiState.ts` does not exist.

- [ ] **Step 3: Create UI state module**

Create `src/state/uiState.ts`:

```ts
import { getPersistedValue, setPersistedValue } from "../muxer-queue";

export type ActiveTab = "voice" | "messages" | "media" | "review" | "recordings";

export interface SharedUIState {
  selectedVoiceGuild: string;
  selectedVoiceChannel: string;
  selectedTextGuild: string;
  selectedTextChannel: string;
  activeTab: ActiveTab;
  isListening: boolean;
  isStreaming: boolean;
}

export type SharedUIStatePatch = Partial<SharedUIState> & {
  selectedGuild?: string;
};

const activeTabs: ActiveTab[] = [
  "voice",
  "messages",
  "media",
  "review",
  "recordings",
];

export const defaultSharedUIState: SharedUIState = {
  selectedVoiceGuild: "",
  selectedVoiceChannel: "",
  selectedTextGuild: "",
  selectedTextChannel: "",
  activeTab: "voice",
  isListening: false,
  isStreaming: false,
};

export function normalizeSharedUIState(value: SharedUIStatePatch): SharedUIState {
  const guild = value.selectedGuild ?? "";
  return {
    selectedVoiceGuild: value.selectedVoiceGuild ?? guild,
    selectedVoiceChannel: value.selectedVoiceChannel ?? "",
    selectedTextGuild: value.selectedTextGuild ?? guild,
    selectedTextChannel: value.selectedTextChannel ?? "",
    activeTab: activeTabs.includes(value.activeTab ?? "")
      ? (value.activeTab as ActiveTab)
      : "voice",
    isListening: value.isListening ?? false,
    isStreaming: value.isStreaming ?? false,
  };
}

export async function createSharedUIStateStore() {
  let sharedUIState = normalizeSharedUIState(
    await getPersistedValue("web-ui-state", defaultSharedUIState),
  );

  function getSharedUIState(): SharedUIState {
    return { ...sharedUIState };
  }

  async function patchSharedUIState(
    patch: SharedUIStatePatch,
  ): Promise<SharedUIState> {
    if (typeof patch.selectedGuild === "string") {
      sharedUIState.selectedVoiceGuild = patch.selectedGuild;
      sharedUIState.selectedTextGuild = patch.selectedGuild;
    }
    if (typeof patch.selectedVoiceGuild === "string") {
      sharedUIState.selectedVoiceGuild = patch.selectedVoiceGuild;
    }
    if (typeof patch.selectedVoiceChannel === "string") {
      sharedUIState.selectedVoiceChannel = patch.selectedVoiceChannel;
    }
    if (typeof patch.selectedTextGuild === "string") {
      sharedUIState.selectedTextGuild = patch.selectedTextGuild;
    }
    if (typeof patch.selectedTextChannel === "string") {
      sharedUIState.selectedTextChannel = patch.selectedTextChannel;
    }
    if (activeTabs.includes(patch.activeTab ?? "")) {
      sharedUIState.activeTab = patch.activeTab as ActiveTab;
    }
    if (typeof patch.isListening === "boolean") {
      sharedUIState.isListening = patch.isListening;
    }
    if (typeof patch.isStreaming === "boolean") {
      sharedUIState.isStreaming = patch.isStreaming;
    }

    await setPersistedValue("web-ui-state", sharedUIState);
    return getSharedUIState();
  }

  return { getSharedUIState, patchSharedUIState };
}
```

- [ ] **Step 4: Replace UI state logic in `src/webserver.ts`**

Add imports:

```ts
import {
  createSharedUIStateStore,
  type SharedUIStatePatch,
} from "./state/uiState";
```

Delete these from `src/webserver.ts`:

```ts
interface SharedUIState { ... }

type SharedUIStatePatch = Partial<SharedUIState> & { selectedGuild?: string };

const defaultSharedUIState = { ... };

let sharedUIState = { ...defaultSharedUIState };

export function normalizeSharedUIState(...) { ... }

async function initializeSharedUIState() { ... }

function getSharedUIState() { ... }

function patchSharedUIState(...) { ... }
```

Inside `startWebserver`, replace:

```ts
await initializeSharedUIState();
let mediaSettings = await initializeMediaSettings();
```

with:

```ts
const { getSharedUIState, patchSharedUIState } = await createSharedUIStateStore();
let mediaSettings = await initializeMediaSettings();
```

- [ ] **Step 5: Verify UI state extraction**

Run:

```bash
pnpm vitest run tests/state/uiState.test.ts
pnpm run typecheck
```

Expected: tests PASS and typecheck PASS.

- [ ] **Step 6: Commit UI state extraction**

```bash
git add src/state/uiState.ts src/webserver.ts tests/state/uiState.test.ts
git commit -m "refactor: extract persisted ui state"
```

---

### Task 3: Extract Media Settings

**Files:**
- Create: `src/state/mediaSettings.ts`
- Modify: `src/webserver.ts`

- [ ] **Step 1: Create media settings module**

Create `src/state/mediaSettings.ts`:

```ts
import { getPersistedValue, setPersistedValue } from "../muxer-queue";

export interface MediaSettings {
  musicVolume: number;
}

export const defaultMediaSettings: MediaSettings = {
  musicVolume: 1,
};

export async function initializeMediaSettings(): Promise<MediaSettings> {
  const stored = await getPersistedValue("media-settings", defaultMediaSettings);
  return {
    ...defaultMediaSettings,
    ...(stored as MediaSettings),
  };
}

export async function persistMediaSettings(
  settings: MediaSettings,
): Promise<void> {
  await setPersistedValue("media-settings", settings);
}
```

- [ ] **Step 2: Replace inline media settings in `src/webserver.ts`**

Add imports:

```ts
import {
  initializeMediaSettings,
  persistMediaSettings,
} from "./state/mediaSettings";
```

Delete inline `MediaSettings`, `defaultMediaSettings`, and `initializeMediaSettings` from `src/webserver.ts`.

Replace:

```ts
await setPersistedValue("media-settings", mediaSettings);
```

with:

```ts
await persistMediaSettings(mediaSettings);
```

Remove `getPersistedValue` and `setPersistedValue` import from `src/webserver.ts` if no longer used.

- [ ] **Step 3: Verify media settings extraction**

Run:

```bash
pnpm run typecheck
pnpm run test
```

Expected: typecheck PASS and tests PASS.

- [ ] **Step 4: Commit media settings extraction**

```bash
git add src/state/mediaSettings.ts src/webserver.ts
git commit -m "refactor: extract media settings state"
```

---

### Task 4: Extract Broadcast Globals

**Files:**
- Create: `src/ws/broadcastGlobals.ts`
- Modify: `src/webserver.ts`

- [ ] **Step 1: Create broadcast globals module**

Create `src/ws/broadcastGlobals.ts`:

```ts
import type { WebSocket } from "ws";
import type { ModerationBroadcaster } from "../moderation/types";
import type { createChildLogger } from "../logger";

type Logger = ReturnType<typeof createChildLogger>;

type ActiveUsers = Map<
  string,
  { username: string; avatar: string; speaking: boolean }
>;

type VoiceGlobals = typeof globalThis & {
  ADMIN_PASSWORD?: string;
  moderationBroadcaster?: ModerationBroadcaster;
  broadcastPcmToWeb?: (chunk: Buffer, userId: string) => void;
  broadcastVideoToWeb?: (chunk: Buffer) => void;
  updateActiveUser?: (
    userId: string,
    data: { username: string; avatar: string; speaking: boolean },
  ) => void;
};

export function exposeModerationGlobals(
  broadcaster: ModerationBroadcaster,
  adminPassword: string,
): void {
  (globalThis as VoiceGlobals).moderationBroadcaster = broadcaster;
  (globalThis as VoiceGlobals).ADMIN_PASSWORD = adminPassword;
}

export function exposePcmBroadcastGlobal(
  broadcaster: ModerationBroadcaster,
): void {
  (globalThis as VoiceGlobals).broadcastPcmToWeb = (
    chunk: Buffer,
    userId: string,
  ) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i);
      hash |= 0;
    }

    const header = Buffer.alloc(4);
    header.writeInt32LE(hash, 0);
    const packet = Buffer.concat([header, chunk]);

    for (const client of broadcaster.getClients()) {
      if (client.readyState === 1) client.send(packet);
    }
  };
}

export function exposeVideoBroadcastGlobal(
  clients: () => Set<WebSocket>,
  logger: Logger,
): void {
  (globalThis as VoiceGlobals).broadcastVideoToWeb = (chunk: Buffer) => {
    for (const client of clients()) {
      if (client.readyState === 1) {
        try {
          client.send(chunk);
        } catch (err) {
          logger.warn({ err }, "Failed to send video chunk");
        }
      }
    }
  };
}

export function exposeActiveUserGlobal(
  activeUsers: ActiveUsers,
  broadcastUserState: () => void,
): void {
  (globalThis as VoiceGlobals).updateActiveUser = (
    userId: string,
    data: { username: string; avatar: string; speaking: boolean },
  ) => {
    activeUsers.set(userId, data);
    broadcastUserState();
  };
}
```

- [ ] **Step 2: Replace globals setup in `src/webserver.ts`**

Add imports:

```ts
import {
  exposeActiveUserGlobal,
  exposeModerationGlobals,
  exposePcmBroadcastGlobal,
  exposeVideoBroadcastGlobal,
} from "./ws/broadcastGlobals";
```

Delete `VoiceGlobals` type from `src/webserver.ts`.

Replace:

```ts
(globalThis as VoiceGlobals).moderationBroadcaster = broadcaster;
(globalThis as any).ADMIN_PASSWORD = config.ADMIN_PASSWORD;
```

with:

```ts
exposeModerationGlobals(broadcaster, config.ADMIN_PASSWORD);
```

Replace inline assignments to `broadcastPcmToWeb`, `broadcastVideoToWeb`, and `updateActiveUser` with:

```ts
exposePcmBroadcastGlobal(broadcaster);
exposeVideoBroadcastGlobal(() => broadcaster.getClients(), wsLogger);
exposeActiveUserGlobal(activeUsers, broadcastUserState);
```

Keep `broadcastUserState` local for now.

- [ ] **Step 3: Verify broadcast globals extraction**

Run:

```bash
pnpm run typecheck
pnpm run test
```

Expected: typecheck PASS and tests PASS.

- [ ] **Step 4: Commit broadcast globals extraction**

```bash
git add src/ws/broadcastGlobals.ts src/webserver.ts
git commit -m "refactor: isolate websocket globals"
```

---

### Task 5: Extract Browser Voice Audio Bridge

**Files:**
- Create: `src/ws/voiceAudioBridge.ts`
- Modify: `src/webserver.ts`

- [ ] **Step 1: Create voice audio bridge module**

Create `src/ws/voiceAudioBridge.ts`:

```ts
import { AudioPlayerStatus } from "@discordjs/voice";
import * as prism from "prism-media";
import { rmsDb, upsample24kMonoTo48kStereo } from "../audio/pcm";
import type { createChildLogger } from "../logger";
import { discordPlayer } from "../player";

type Logger = ReturnType<typeof createChildLogger>;

const RATE = 48000;
const CHANNELS = 2;
const FRAME_SIZE = 960;
const BYTES_PER_FRAME = FRAME_SIZE * CHANNELS * 2;
const SILENCE_TAIL_MS = 300;
const MAX_BUF_BYTES = BYTES_PER_FRAME * 50;
const SILENCE_FRAME = Buffer.alloc(BYTES_PER_FRAME, 0);

export interface VoiceAudioBridge {
  handleBrowserAudio(data: Buffer): void;
}

export function createVoiceAudioBridge(logger: Logger): VoiceAudioBridge {
  let opusEncoder: prism.opus.Encoder | null = null;
  let bridgePlayerPaused = true;
  let pcmBuffer = Buffer.alloc(0);
  let lastBrowserAudioTime = 0;
  let dbAccum = 0;
  let dbCount = 0;

  function startBrowserAudioBridge(): void {
    if (opusEncoder) return;

    opusEncoder = new prism.opus.Encoder({
      rate: RATE,
      channels: CHANNELS,
      frameSize: FRAME_SIZE,
    });
    const oggBitstream = new prism.opus.OggLogicalBitstream({
      opusHead: new prism.opus.OpusHead({
        channelCount: CHANNELS,
        sampleRate: RATE,
      }),
      pageSizeControl: { maxPackets: 1 },
      crc: true,
    });

    opusEncoder.on("error", () => {});
    opusEncoder.pipe(oggBitstream);
    opusEncoder.write(Buffer.alloc(BYTES_PER_FRAME, 0));
    discordPlayer.playStream(oggBitstream, "browser-bridge");
    discordPlayer.pause("browser-bridge");
    bridgePlayerPaused = true;
  }

  function ensureBrowserAudioBridge(): boolean {
    const owner = discordPlayer.getOwner();
    if (owner !== "none" && owner !== "browser-bridge") return false;
    if (
      owner === "none" ||
      discordPlayer.getStatus() === AudioPlayerStatus.Idle
    ) {
      startBrowserAudioBridge();
    }
    return true;
  }

  setInterval(() => {
    if (dbCount > 0) {
      const avg = dbAccum / dbCount;
      logger.info({ level: avg.toFixed(1), frames: dbCount }, "Audio level");
      dbAccum = 0;
      dbCount = 0;
    }
  }, 2000);

  setInterval(() => {
    const msSinceAudio = Date.now() - lastBrowserAudioTime;
    let frame: Buffer | null = null;

    if (pcmBuffer.length >= BYTES_PER_FRAME) {
      frame = pcmBuffer.subarray(0, BYTES_PER_FRAME);
      pcmBuffer = pcmBuffer.subarray(BYTES_PER_FRAME);
      dbAccum += rmsDb(frame);
      dbCount++;

      if (!ensureBrowserAudioBridge()) {
        pcmBuffer = Buffer.alloc(0);
        return;
      }
      if (bridgePlayerPaused) {
        const unpaused = discordPlayer.unpause("browser-bridge");
        bridgePlayerPaused = false;
        logger.info({ unpaused }, "Transmitting — Discord indicator ON");
      }
    } else if (msSinceAudio < SILENCE_TAIL_MS && msSinceAudio > 0) {
      frame = SILENCE_FRAME;
    } else if (!bridgePlayerPaused && msSinceAudio >= SILENCE_TAIL_MS) {
      discordPlayer.pause("browser-bridge");
      bridgePlayerPaused = true;
      logger.info("Stopped — Discord indicator OFF");
      return;
    } else {
      return;
    }

    if (!opusEncoder) return;
    const ok = opusEncoder.write(frame);
    if (!ok) {
      opusEncoder.once("drain", () => {});
    }
  }, 20);

  return {
    handleBrowserAudio(data: Buffer): void {
      lastBrowserAudioTime = Date.now();
      const upsampled = upsample24kMonoTo48kStereo(data);
      if (pcmBuffer.length < MAX_BUF_BYTES) {
        pcmBuffer = Buffer.concat([pcmBuffer, upsampled]);
      }
    },
  };
}
```

- [ ] **Step 2: Replace audio bridge logic in `src/webserver.ts`**

Add import:

```ts
import { createVoiceAudioBridge } from "./ws/voiceAudioBridge";
```

Inside `startWebserver`, before `wss.on("connection", ...)`, add:

```ts
const voiceAudioBridge = createVoiceAudioBridge(wsLogger);
```

Delete local constants and variables from `RATE` through the two `setInterval` loops.

Replace WebSocket message handler body:

```ts
if (!Buffer.isBuffer(data)) return;
lastBrowserAudioTime = Date.now();
const upsampled = upsample(data);
if (pcmBuffer.length < MAX_BUF_BYTES) {
  pcmBuffer = Buffer.concat([pcmBuffer, upsampled]);
}
```

with:

```ts
if (!Buffer.isBuffer(data)) return;
voiceAudioBridge.handleBrowserAudio(data);
```

Remove imports from `src/webserver.ts` that are now unused: `AudioPlayerStatus`, `prism`, `discordPlayer`, `rmsDb`, `upsample24kMonoTo48kStereo`.

- [ ] **Step 3: Verify voice audio bridge extraction**

Run:

```bash
pnpm run typecheck
pnpm run test
```

Expected: typecheck PASS and tests PASS.

- [ ] **Step 4: Commit voice bridge extraction**

```bash
git add src/ws/voiceAudioBridge.ts src/webserver.ts
git commit -m "refactor: extract browser audio bridge"
```

---

### Task 6: Extract WebSocket Server

**Files:**
- Create: `src/ws/server.ts`
- Modify: `src/webserver.ts`

- [ ] **Step 1: Create WebSocket server module**

Create `src/ws/server.ts`:

```ts
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
```

- [ ] **Step 2: Replace WebSocket setup in `src/webserver.ts`**

Add import:

```ts
import { startWebSocketServer } from "./ws/server";
```

Delete `WebSocketServer` import from `src/webserver.ts`.

Delete:

```ts
const wss = new WebSocketServer({ server, path: wsPath });
wsLogger.info({ port, wsPath }, "WebSocket server listening");
```

Delete entire `wss.on("connection", ...)` block.

After `mediaController` is created and globals are exposed, add:

```ts
startWebSocketServer({
  server,
  port,
  wsPath,
  broadcaster,
  activeUsers,
  getSharedUIState,
  mediaController,
  logger: wsLogger,
});
```

- [ ] **Step 3: Verify WebSocket extraction**

Run:

```bash
pnpm run typecheck
pnpm run test
```

Expected: typecheck PASS and tests PASS.

- [ ] **Step 4: Commit WebSocket extraction**

```bash
git add src/ws/server.ts src/webserver.ts
git commit -m "refactor: extract websocket server"
```

---

### Task 7: Extract HTTP App and Health Routes

**Files:**
- Create: `src/http/health.ts`
- Create: `src/http/app.ts`
- Modify: `src/webserver.ts`

- [ ] **Step 1: Create health router**

Create `src/http/health.ts`:

```ts
import { Router } from "express";
import { getMetrics, uptimeGauge } from "../metrics";

export interface HealthRoutesOptions {
  adminPassword: string;
  activeUserCount: () => number;
  wsClientCount: () => number;
}

export function createHealthRoutes(options: HealthRoutesOptions) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      activeUsers: options.activeUserCount(),
      wsClients: options.wsClientCount(),
    });
  });

  router.get("/metrics", async (_req, res) => {
    res.set("Content-Type", "text/plain");
    uptimeGauge.set(process.uptime());
    res.send(await getMetrics());
  });

  router.post("/api/auth/login", (req, res) => {
    const { password } = req.body;
    if (password === options.adminPassword) {
      res.json({ ok: true });
      return;
    }
    res.status(401).json({ error: "Invalid password" });
  });

  return router;
}
```

- [ ] **Step 2: Create Express app module**

Create `src/http/app.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js-selfbot-v13";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AppError } from "../errors";
import type { createChildLogger } from "../logger";
import type { MediaController } from "../media/mediaController";
import type { ModerationBroadcaster } from "../moderation/types";
import { createAnalysisRoutes } from "../routes/analysisRoutes";
import { createMediaRoutes } from "../routes/mediaRoutes";
import { createMessageRoutes } from "../routes/messageRoutes";
import { createRecordingsRoutes } from "../routes/recordingsRoutes";
import { createSyncRoutes } from "../routes/syncRoutes";
import { createUIStateRoutes } from "../routes/uiStateRoutes";
import { createVoiceRoutes } from "../routes/voiceRoutes";
import type { SharedUIStatePatch } from "../state/uiState";
import type { VoiceController } from "../voiceController";
import { createHealthRoutes } from "./health";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Logger = ReturnType<typeof createChildLogger>;

export interface CreateHttpAppOptions {
  client: Client;
  voiceController: VoiceController;
  mediaController: MediaController;
  broadcaster: ModerationBroadcaster;
  adminPassword: string;
  getSharedUIState: () => unknown;
  patchSharedUIState: (patch: SharedUIStatePatch) => unknown;
  activeUserCount: () => number;
  wsClientCount: () => number;
  logger: Logger;
}

export function createHttpApp(options: CreateHttpAppOptions) {
  const app = express();

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
        options.logger.error(
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
  app.use(express.static(path.join(__dirname, "../../public")));
  app.use(express.static(path.join(__dirname, "../../public/app")));

  app.get("/", (_req: Request, res: Response) => {
    const reactIndex = path.join(__dirname, "../../public/app/index.html");
    if (fs.existsSync(reactIndex)) {
      res.sendFile(reactIndex);
      return;
    }
    res.status(503).send("React dashboard is not built. Run pnpm run build:web.");
  });

  app.use(
    createHealthRoutes({
      adminPassword: options.adminPassword,
      activeUserCount: options.activeUserCount,
      wsClientCount: options.wsClientCount,
    }),
  );

  app.use(
    "/api",
    createUIStateRoutes({
      getSharedUIState: options.getSharedUIState,
      patchSharedUIState: options.patchSharedUIState,
    }),
  );
  app.use(
    "/api",
    createVoiceRoutes({
      voiceController: options.voiceController,
      patchSharedUIState: options.patchSharedUIState,
      broadcaster: options.broadcaster,
      adminPassword: options.adminPassword,
    }),
  );
  app.use("/api", createMessageRoutes());
  app.use("/api", createAnalysisRoutes());
  app.use("/api", createSyncRoutes(options.client));
  app.use("/api", createRecordingsRoutes());
  app.use(
    "/api",
    createMediaRoutes(options.mediaController, {
      adminPassword: options.adminPassword,
    }),
  );

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

      options.logger.error({ error }, "Unhandled webserver error");
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      });
    },
  );

  return app;
}
```

- [ ] **Step 3: Replace Express app setup in `src/webserver.ts`**

Add import:

```ts
import { createHttpApp } from "./http/app";
```

Delete imports now owned by `src/http/app.ts`: `fs`, `path`, `fileURLToPath`, `express`, `helmet`, `AppError`, route factory imports, metrics imports, and base `logger` import if only used for HTTP error logging.

Delete `__filename` and `__dirname` declarations.

Delete all inline Express middleware, static routes, health/metrics/auth routes, route mounting, and error handler.

After `mediaController` is created, add:

```ts
const app = createHttpApp({
  client: _client,
  voiceController,
  mediaController,
  broadcaster,
  adminPassword: config.ADMIN_PASSWORD,
  getSharedUIState,
  patchSharedUIState,
  activeUserCount: () => activeUsers.size,
  wsClientCount: () => broadcaster.clientCount(),
  logger: wsLogger,
});
```

Ensure `const server = http.createServer(app);` runs after `app` is created.

- [ ] **Step 4: Verify HTTP extraction**

Run:

```bash
pnpm run typecheck
pnpm run test
```

Expected: typecheck PASS and tests PASS.

- [ ] **Step 5: Commit HTTP extraction**

```bash
git add src/http/health.ts src/http/app.ts src/webserver.ts
git commit -m "refactor: extract http app setup"
```

---

### Task 8: Replace `webserver.ts` With HTTP Server Facade

**Files:**
- Create: `src/http/server.ts`
- Modify: `src/webserver.ts`

- [ ] **Step 1: Create HTTP server orchestrator**

Create `src/http/server.ts` by moving remaining `startWebserver` logic from `src/webserver.ts`. Use this complete shape:

```ts
import http from "node:http";
import type { Client } from "discord.js-selfbot-v13";
import { config } from "../config";
import { createChildLogger } from "../logger";
import { MediaController } from "../media/mediaController";
import { createScreenShareController } from "../media/screenShareController";
import { createBroadcaster } from "../moderation/broadcaster";
import { createSharedUIStateStore } from "../state/uiState";
import {
  initializeMediaSettings,
  persistMediaSettings,
} from "../state/mediaSettings";
import { Streamer } from "../streaming";
import type { VoiceController } from "../voiceController";
import { createHttpApp } from "./app";
import {
  exposeActiveUserGlobal,
  exposeModerationGlobals,
  exposePcmBroadcastGlobal,
  exposeVideoBroadcastGlobal,
} from "../ws/broadcastGlobals";
import { startWebSocketServer } from "../ws/server";

const serverLogger = createChildLogger("webserver");

const activeUsers = new Map<
  string,
  { username: string; avatar: string; speaking: boolean }
>();

export async function startWebserver(
  port: number = 3000,
  client: Client,
  voiceController: VoiceController,
) {
  const { getSharedUIState, patchSharedUIState } = await createSharedUIStateStore();
  let mediaSettings = await initializeMediaSettings();
  const wsPath = "/ws";
  const broadcaster = createBroadcaster();

  exposeModerationGlobals(broadcaster, config.ADMIN_PASSWORD);
  exposePcmBroadcastGlobal(broadcaster);

  const streamer = new Streamer(client);
  const screenController = createScreenShareController({
    getVoiceStatus: () => voiceController.getStatus(),
    streamer,
    useTranscoder: true,
    onBeforeStreamStart: async () => {
      await voiceController.disconnect();
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

  function broadcastUserState() {
    const users = Array.from(activeUsers.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));
    broadcaster.userState(users);
  }

  exposeVideoBroadcastGlobal(() => broadcaster.getClients(), serverLogger);
  exposeActiveUserGlobal(activeUsers, broadcastUserState);

  const app = createHttpApp({
    client,
    voiceController,
    mediaController,
    broadcaster,
    adminPassword: config.ADMIN_PASSWORD,
    getSharedUIState,
    patchSharedUIState,
    activeUserCount: () => activeUsers.size,
    wsClientCount: () => broadcaster.clientCount(),
    logger: serverLogger,
  });

  const server = http.createServer(app);

  startWebSocketServer({
    server,
    port,
    wsPath,
    broadcaster,
    activeUsers,
    getSharedUIState,
    mediaController,
    logger: serverLogger,
  });

  server.listen(port, "0.0.0.0", () => {
    serverLogger.info({ port }, "Web interface listening");
  });
}
```

- [ ] **Step 2: Reduce `src/webserver.ts` to facade**

Replace entire `src/webserver.ts` with:

```ts
export { startWebserver } from "./http/server";
```

Keep this facade for now so imports in `src/index.ts` do not change in same commit.

- [ ] **Step 3: Verify webserver facade**

Run:

```bash
pnpm run typecheck
pnpm run test
```

Expected: typecheck PASS and tests PASS.

- [ ] **Step 4: Commit HTTP server facade**

```bash
git add src/http/server.ts src/webserver.ts
git commit -m "refactor: move webserver orchestration"
```

---

### Task 9: Extract Bootstrap and Shutdown

**Files:**
- Create: `src/app/shutdown.ts`
- Create: `src/app/bootstrap.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create shutdown module**

Create `src/app/shutdown.ts`:

```ts
import type { Client } from "discord.js-selfbot-v13";
import type { closeDatabase } from "../database/drizzle";
import type { createChildLogger } from "../logger";
import type { discordPlayer } from "../player";
import type { VoiceController } from "../voiceController";

type Logger = ReturnType<typeof createChildLogger>;
type CloseDatabase = typeof closeDatabase;
type DiscordPlayer = typeof discordPlayer;

export interface GracefulShutdownOptions {
  logger: Logger;
  closeDatabase: CloseDatabase;
  voiceController: VoiceController;
  discordPlayer: DiscordPlayer;
  client: Client;
}

export function createGracefulShutdown(options: GracefulShutdownOptions) {
  let isShuttingDown = false;

  return async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
      options.logger.warn(`Already shutting down, ignoring ${signal}`);
      return;
    }

    isShuttingDown = true;
    options.logger.info({ signal }, "Graceful shutdown initiated");

    try {
      options.logger.info("Closing database...");
      await options.closeDatabase();
      options.logger.info("Database closed");

      options.logger.info("Stopping voice connection...");
      await options.voiceController.disconnect();

      options.logger.info("Pausing player...");
      options.discordPlayer.pause();

      options.logger.info("Destroying Discord client...");
      try {
        options.client.destroy();
      } catch (err) {
        options.logger.warn({ error: err }, "Error destroying client");
      }

      options.logger.info("Graceful shutdown completed");
      process.exit(0);
    } catch (err) {
      options.logger.error({ error: err }, "Error during graceful shutdown");
      process.exit(1);
    }
  };
}
```

- [ ] **Step 2: Create bootstrap module**

Create `src/app/bootstrap.ts`:

```ts
import { Client } from "discord.js-selfbot-v13";
import { config } from "../config";
import { closeDatabase, initializeDatabase } from "../database/drizzle";
import { createDiscordClientOptions } from "../discordClientOptions";
import { createChildLogger } from "../logger";
import { startPendingAIAnalysisWorker } from "../moderation/aiAnalyzer";
import { syncBacklogMessages } from "../moderation/backlogSync";
import { registerMessageCapture } from "../moderation/messageCapture";
import { discordPlayer } from "../player";
import { VoiceController } from "../voiceController";
import { startWebserver } from "../webserver";
import { createGracefulShutdown } from "./shutdown";

const logger = createChildLogger("bot");

export async function initializeApp() {
  const token = config.DISCORD_TOKEN;
  logger.info(
    { hasToken: token.length > 0, tokenLength: token.length },
    "Config loaded",
  );

  logger.info("Creating Discord client");
  const client = new Client(createDiscordClientOptions());
  const voiceController = new VoiceController(client);
  const gracefulShutdown = createGracefulShutdown({
    logger,
    closeDatabase,
    voiceController,
    discordPlayer,
    client,
  });

  try {
    logger.info("Initializing database");
    await initializeDatabase();
    logger.info({ type: config.DATABASE_TYPE }, "Database initialized");
  } catch (err) {
    logger.error({ error: err }, "Failed to initialize database");
    process.exit(1);
  }

  client.on("debug", (msg) => {
    if (
      msg.includes("[VOICE") ||
      msg.includes("[ffmpeg") ||
      msg.toLowerCase().includes("error") ||
      msg.toLowerCase().includes("stream")
    ) {
      logger.info({ debugMsg: msg }, "Discord Client Debug");
    } else if (config.VERBOSE) {
      logger.debug({ debugMsg: msg }, "Discord Client Debug");
    }
  });

  client.on("ready", async () => {
    logger.info({ user: client.user?.tag }, "Bot logged in");
    registerMessageCapture(client);
    startPendingAIAnalysisWorker();
    syncBacklogMessages(client).catch((error) => {
      logger.warn({ error }, "Backlog sync failed");
    });
    await startWebserver(config.WEBSERVER_PORT, client, voiceController);
  });

  client.on("error", (err) => {
    logger.error({ error: err }, "Client error");
  });

  process.on("SIGINT", () => {
    gracefulShutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    gracefulShutdown("SIGTERM");
  });

  process.on("uncaughtException", (err) => {
    logger.error({ error: err }, "Uncaught exception");
    gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error({ reason, promise }, "Unhandled rejection");
    gracefulShutdown("unhandledRejection");
  });

  logger.info("Calling Discord client.login");
  client
    .login(token)
    .then(() => {
      logger.info("Discord client.login resolved");
    })
    .catch((error) => {
      logger.error({ error }, "Discord client.login failed");
    });
}
```

- [ ] **Step 3: Replace `src/index.ts` with thin entrypoint**

Keep side-effect imports at top, then initialize app:

```ts
import "./mock-crc";
import "libsodium-wrappers";
import "@snazzah/davey";
import "dotenv/config";
import { initializeApp } from "./app/bootstrap";
import { createChildLogger } from "./logger";

const logger = createChildLogger("bot");

initializeApp().catch((error) => {
  logger.error({ error }, "Failed to initialize app");
  process.exit(1);
});
```

- [ ] **Step 4: Verify bootstrap extraction**

Run:

```bash
pnpm run typecheck
pnpm run test
```

Expected: typecheck PASS and tests PASS.

- [ ] **Step 5: Commit bootstrap extraction**

```bash
git add src/app/bootstrap.ts src/app/shutdown.ts src/index.ts
git commit -m "refactor: extract application bootstrap"
```

---

### Task 10: Dependency Audit and Cleanup

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` if package manifest changes

- [ ] **Step 1: Capture dependency evidence**

Run:

```bash
pnpm dlx depcheck --json > /tmp/bete-depcheck.json
```

Expected: command completes and writes JSON. If `depcheck` reports false positives for side-effect imports or Vite/Tailwind config packages, do not remove those packages.

- [ ] **Step 2: Verify import usage for reported unused packages**

For each package reported unused, run exact grep before editing. Start with:

```bash
grep -R "@dank074/discord-video-stream\|@discordjs/voice\|@radix-ui/react-scroll-area\|@radix-ui/react-select\|@radix-ui/react-slot\|@radix-ui/react-tabs\|@snazzah/davey\|@types/pg\|@vitejs/plugin-react\|better-sqlite3\|clsx\|discord.js-selfbot-v13\|dotenv\|drizzle-orm\|express\|helmet\|libsodium-wrappers\|lucide-react\|p-retry\|pg\|play-dl\|prism-media\|prom-client\|react\|react-dom\|sodium-native\|tailwind-merge\|vite\|winston\|ws\|zod" . --exclude-dir=node_modules --exclude-dir=.git --exclude=pnpm-lock.yaml
```

Expected: packages with no source/config/script references are candidates for removal. Packages referenced by side-effect import in `src/index.ts` count as used.

- [ ] **Step 3: Apply safe package changes**

Edit `package.json` only for packages with evidence:

- Move build/test/tooling-only packages to `devDependencies` if they are not imported at runtime.
- Keep `@vitejs/plugin-react`, `vite`, `tailwindcss`, `postcss`, and `autoprefixer` if frontend build config uses them.
- Keep `libsodium-wrappers` and `@snazzah/davey` because `src/index.ts` imports them for side effects.
- Keep workspace packages if source imports them or runtime requires patched local behavior.
- Remove only packages with no import, config, script, or side-effect usage.

- [ ] **Step 4: Install after manifest changes**

If `package.json` changed, run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updates cleanly.

- [ ] **Step 5: Validate dependency cleanup**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit dependency cleanup**

If package files changed:

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: clean dependency manifest"
```

If no package files changed, skip commit and record in final summary that audit found no safe removals.

---

### Task 11: Final Validation and Manual Smoke Check

**Files:**
- No planned source changes unless validation exposes breakage.

- [ ] **Step 1: Run full validation**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Start dev server for smoke check**

Run:

```bash
pnpm run dev
```

Expected: server starts, logs `Web interface listening`, and no startup exception appears before Discord auth/network behavior blocks or succeeds.

- [ ] **Step 3: Check static dashboard build output**

If dev server is running with valid config, open or curl:

```bash
curl -I http://localhost:3000/
curl -s http://localhost:3000/health
```

Expected: `/` returns HTTP 200 when `public/app/index.html` exists, otherwise HTTP 503 with existing message. `/health` returns JSON with `status: "ok"` if server is running.

- [ ] **Step 4: Stop dev server**

Stop foreground process with Ctrl-C, or stop background task if started by agent tooling.

Expected: graceful shutdown logs appear.

- [ ] **Step 5: Commit final fixes if needed**

If validation required fixes:

```bash
git add <changed-files>
git commit -m "fix: preserve behavior after restructure"
```

Skip if no files changed.

---

## Self-Review

Spec coverage:

- Webserver split: Tasks 1-8.
- Bootstrap/shutdown split: Task 9.
- Temporary `globalThis` isolation: Task 4.
- Pure helper tests: Tasks 1-2.
- Dependency cleanup after structure: Task 10.
- Full validation and smoke check: Task 11.

Placeholder scan: no `TBD`, `TODO`, `implement later`, or unspecified code steps remain.

Type consistency:

- `SharedUIStatePatch` is exported from `src/state/uiState.ts` and consumed by `src/http/app.ts`.
- `createVoiceAudioBridge()` returns `handleBrowserAudio()` and `src/ws/server.ts` calls same method.
- `startWebserver()` remains exported from `src/webserver.ts` facade and consumed by bootstrap.
