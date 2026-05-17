import type { Router } from "express";
import express from "express";
import { AppError } from "../errors";
import {
  getAnalysisQueueStatus,
  queueMessageAnalysis,
} from "../moderation/aiAnalyzer";
import {
  getMessageById,
  updateMessageAIAnalysis,
} from "../moderation/messageStore";

export function createAnalysisRoutes(): Router {
  const router = express.Router();

  // GET /api/analysis/status - Get current analysis queue status
  router.get("/analysis/status", (_req, res, next) => {
    try {
      const status = getAnalysisQueueStatus();
      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/messages/:id/reanalyze - Queue a message for re-analysis
  router.post("/messages/:id/reanalyze", async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new AppError("Message ID is required", "MISSING_MESSAGE_ID", 400);
      }

      // Verify message exists
      const message = await getMessageById(id);
      if (!message) {
        throw new AppError("Message not found", "MESSAGE_NOT_FOUND", 404);
      }

      // Reset analysis status to pending so it gets picked up by the analyzer
      await updateMessageAIAnalysis(id, {
        status: "pending",
        flags: null,
        score: null,
        raw: null,
        analysis: null,
        analyzedAt: null,
        error: null,
      });

      // Queue for analysis
      await queueMessageAnalysis(id);

      res.json({
        success: true,
        messageId: id,
        queued: true,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
