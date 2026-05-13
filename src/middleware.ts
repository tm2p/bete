import { NextFunction, Request, Response } from "express";
import { AppError } from "./errors";
import { createChildLogger } from "./logger";

const logger = createChildLogger("middleware");

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    logger.error(
      { code: err.code, statusCode: err.statusCode, message: err.message },
      "Application error",
    );
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
  }

  logger.error({ error: err.message, stack: err.stack }, "Unexpected error");
  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "Endpoint not found",
  });
}
