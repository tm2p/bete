import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  serializers: {
    error: pino.stdSerializers.err,
    err: pino.stdSerializers.err,
    reason: (value) => value instanceof Error ? pino.stdSerializers.err(value) : value,
  },
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const createChildLogger = (context: string) => {
  return logger.child({ context });
};
