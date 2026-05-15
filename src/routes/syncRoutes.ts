import type { Client } from "discord.js-selfbot-v13";
import type { Router } from "express";
import express from "express";
import { AppError } from "../errors";
import { createChildLogger } from "../logger";
import { syncSelectedChannelBacklog } from "../moderation/backlogSync";

const logger = createChildLogger("sync-routes");
const BACKLOG_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const recentBacklogSyncs = new Map<string, number>();

export function shouldSkipRecentBacklogSync(
  guildId: string,
  channelId: string,
  now = Date.now(),
): boolean {
  const key = `${guildId}:${channelId}`;
  const lastSync = recentBacklogSyncs.get(key);
  if (lastSync && now - lastSync < BACKLOG_SYNC_COOLDOWN_MS) return true;
  recentBacklogSyncs.set(key, now);
  return false;
}

export function clearRecentBacklogSyncs(): void {
  recentBacklogSyncs.clear();
}

export function createSyncRoutes(client: Client): Router {
  const router = express.Router();

  // POST /api/backlog-sync - Sync message backlog for a channel
  router.post("/backlog-sync", async (req, res, next) => {
    try {
      const { guildId, channelId } = req.body as {
        guildId?: string;
        channelId?: string;
      };

      if (!guildId || !channelId) {
        throw new AppError(
          "guildId and channelId are required",
          "MISSING_BACKLOG_PARAMS",
          400,
        );
      }

      if (shouldSkipRecentBacklogSync(guildId, channelId)) {
        logger.debug({ guildId, channelId }, "Skipping recent backlog sync");
        res.json({
          success: true,
          channelId,
          messagesSync: 0,
          skipped: true,
        });
        return;
      }

      logger.info({ guildId, channelId }, "Starting backlog sync");

      const count = await syncSelectedChannelBacklog(
        client,
        guildId,
        channelId,
      );

      logger.info(
        { guildId, channelId, messagesSync: count },
        "Backlog sync complete",
      );

      res.json({
        success: true,
        channelId,
        messagesSync: count,
        skipped: false,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
