import type { Router } from "express";
import express from "express";
import { createChildLogger } from "../logger";

const logger = createChildLogger("ui-state-routes");

export interface SharedUIState {
  selectedVoiceGuild: string;
  selectedVoiceChannel: string;
  selectedTextGuild: string;
  selectedTextChannel: string;
  activeTab: "voice" | "text";
  isListening: boolean;
  isStreaming: boolean;
}

export type SharedUIStatePatch = Partial<SharedUIState> & {
  selectedGuild?: string;
};

export interface UIStateRouteOptions {
  getSharedUIState: () => SharedUIState;
  patchSharedUIState: (patch: SharedUIStatePatch) => SharedUIState;
}

export function createUIStateRoutes(options: UIStateRouteOptions): Router {
  const router = express.Router();
  const { getSharedUIState, patchSharedUIState } = options;

  // GET /api/ui-state - Get current UI state
  router.get("/ui-state", (_req, res, next) => {
    try {
      const state = getSharedUIState();
      res.json(state);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/ui-state - Update UI state
  router.post("/ui-state", (req, res, next) => {
    try {
      const patch = req.body as SharedUIStatePatch;
      const updated = patchSharedUIState(patch);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
