# Aggressive Codebase Restructure Design

## Goal

Restructure the codebase aggressively enough to make ownership clear, while preserving runtime behavior and public contracts. The first target is the oversized webserver/bootstrap area, then dependency cleanup after the new boundaries compile and pass tests.

## Scope

In scope:

- Split `src/webserver.ts` responsibilities into focused modules.
- Move bootstrap and shutdown lifecycle out of `src/index.ts`.
- Keep existing REST endpoints, WebSocket payloads, dashboard behavior, and Discord audio behavior unchanged.
- Add small tests for extracted pure logic.
- Audit dependencies after structure stabilizes, then remove, move, or replace only dependencies proven unused or misplaced.

Out of scope:

- Changing Discord moderation, voice recording, media playback, or dashboard features.
- Replacing the selfbot library.
- Reworking database schema or migrations.
- Removing the temporary `globalThis` broadcast compatibility layer in this pass.

## Target Structure

```text
src/
  app/
    bootstrap.ts
    shutdown.ts
  http/
    app.ts
    server.ts
    health.ts
  ws/
    server.ts
    voiceAudioBridge.ts
    broadcastGlobals.ts
  state/
    uiState.ts
    mediaSettings.ts
  audio/
    pcm.ts
  routes/
    ...existing
```

### `src/app/bootstrap.ts`

Owns application startup:

1. Initialize database.
2. Create Discord client and `VoiceController`.
3. Register Discord debug/error handlers.
4. On ready, register moderation capture, start AI worker, start backlog sync, and start HTTP/WebSocket server.
5. Start Discord login.

### `src/app/shutdown.ts`

Owns graceful shutdown:

- Close database.
- Disconnect voice controller.
- Pause player.
- Destroy Discord client.
- Exit with correct status.

The shutdown module receives dependencies instead of importing mutable singletons where practical.

### `src/http/app.ts`

Creates and configures Express:

- Helmet with existing CSP setting.
- API no-store middleware.
- HTTP error logging.
- JSON body parser.
- Static dashboard serving.
- Route mounting.
- Express error handler.

### `src/http/health.ts`

Contains health, metrics, and auth routes currently inline in `webserver.ts`.

### `src/http/server.ts`

Creates HTTP server, WebSocket server, broadcaster, media controller, stream controller, and route dependencies. Starts listening on `0.0.0.0` using existing port behavior.

### `src/ws/server.ts`

Owns WebSocket lifecycle:

- Accept connections.
- Register clients with broadcaster.
- Send initial `user_state`, `ui_state`, and `media_state` messages.
- Route binary PCM messages to voice audio bridge.
- Remove clients on close/error.

### `src/ws/voiceAudioBridge.ts`

Owns browser PCM to Discord audio:

- Upsample 24kHz mono PCM to 48kHz stereo PCM.
- Keep existing 20ms pull loop.
- Preserve silence tail, max buffer, owner checks, pause/unpause behavior, and logging.
- Use extracted pure helpers from `src/audio/pcm.ts`.

### `src/ws/broadcastGlobals.ts`

Contains the temporary compatibility layer for existing recorder/moderation code:

- `moderationBroadcaster`
- `broadcastPcmToWeb`
- `broadcastVideoToWeb`
- `updateActiveUser`
- `ADMIN_PASSWORD`

This isolates `globalThis` usage so later work can replace it with explicit dependency injection.

### `src/state/uiState.ts`

Owns persisted UI state:

- Defaults.
- `normalizeSharedUIState`.
- Initialize, get, and patch helpers.

### `src/state/mediaSettings.ts`

Owns persisted media settings:

- Defaults.
- Initialize helper.
- Update helper for music volume.

### `src/audio/pcm.ts`

Owns pure PCM utilities:

- `upsample24kMonoTo48kStereo`.
- `rmsDb`.

## Data Flow

```text
index.ts
  -> bootstrap app
    -> initializeDatabase()
    -> create Discord client + VoiceController
    -> on ready:
       -> register moderation capture
       -> start AI worker + backlog sync
       -> startHttpServer()

startHttpServer()
  -> create Express app
  -> create HTTP server
  -> create WebSocket server
  -> create broadcaster
  -> create Streamer + ScreenShareController + MediaController
  -> mount API routes
  -> expose temporary global hooks
```

## Behavior Preservation

Do not change:

- REST endpoint paths or JSON shapes.
- WebSocket outbound JSON message types.
- WebSocket binary voice/video packet format.
- Browser PCM assumptions: 24kHz mono signed 16-bit little-endian.
- Discord outbound audio assumptions: 48kHz stereo Opus frames.
- Static dashboard fallback behavior.
- Existing logging messages unless moving them requires minor context changes.

## Dependency Cleanup

Dependency cleanup happens after structural refactor passes validation.

Process:

1. Build an import map from source, tests, scripts, frontend, and config files.
2. Identify unused dependencies and devDependencies.
3. Move packages used only by tooling/tests/frontend into correct dependency class if currently misplaced.
4. Remove package entries only when no import, config usage, script usage, or runtime side-effect import exists.
5. Prefer not adding libraries unless they replace custom fragile code or fill a concrete missing capability.

Potential new tool dependency: `depcheck` may be used as a one-off via `pnpm dlx depcheck`, not necessarily added to `package.json`.

## Testing Plan

Add or update tests for extracted pure logic:

- UI state normalization keeps legacy `selectedGuild` behavior.
- PCM upsample doubles sample rate and duplicates mono into stereo channels.
- RMS dB handles normal PCM input consistently.

Run validation after each major step:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

## Risks

- Aggressive file movement can break imports. Mitigation: move one responsibility at a time and run typecheck frequently.
- `globalThis` compatibility can hide coupling. Mitigation: isolate it in `broadcastGlobals.ts` and avoid expanding it.
- Dependency cleanup can remove runtime side-effect packages. Mitigation: treat side-effect imports in `src/index.ts` as used.
- Frontend and backend share one package manifest. Mitigation: audit source areas separately before moving dependencies.

## Acceptance Criteria

- `src/webserver.ts` is removed or reduced to a thin compatibility facade.
- `src/index.ts` delegates startup to `src/app/bootstrap.ts`.
- HTTP, WebSocket, UI state, media settings, audio bridge, and broadcast globals have separate modules.
- Existing tests pass.
- Typecheck, lint, and build pass.
- Dependency changes are justified by import/config/script evidence.
