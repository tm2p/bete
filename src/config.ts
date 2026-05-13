import { z } from "zod";
import { ConfigError } from "./errors";

const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  VOICE_CHANNEL_ID: z.string().min(1).optional(),
  GUILD_ID: z.string().min(1).optional(),
  VERBOSE: z
    .string()
    .optional()
    .transform((v) => v === "true")
    .default(false),
  RECORDINGS_DIR: z.string().default("./recordings"),
  RECORDING_SEGMENT_MS: z.coerce.number().positive().default(5000),
  DECODER_ROTATE_MS: z.coerce.number().positive().default(5000),
  DECODER_COOLDOWN_MS: z.coerce.number().positive().default(30000),
  WEBSERVER_PORT: z.coerce.number().positive().default(3000),
  VOICE_CONNECTION_TIMEOUT_MS: z.coerce.number().positive().default(15000),
  RECONNECT_TIMEOUT_MS: z.coerce.number().positive().default(5000),
  AUDIO_STREAM_SILENCE_DURATION_MS: z.coerce.number().positive().default(3000),
  PACKET_FILTER_MIN_SIZE: z.coerce.number().positive().default(8),
  OPUS_FRAME_SIZE: z.coerce.number().positive().default(960),
  AUDIO_SAMPLE_RATE: z.coerce.number().positive().default(48000),
  AUDIO_CHANNELS: z.coerce.number().positive().default(2),
  AVATAR_SIZE: z.coerce.number().positive().default(64),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  MONITOR_GUILD_ID: z.string().min(1).optional(),
  PICSER_UPLOAD_URL: z.string().url().default("https://picser.asepharyana.tech/api/upload"),
  ATTACHMENT_UPLOAD_TIMEOUT_MS: z.coerce.number().positive().default(30000),
  ATTACHMENT_MAX_SIZE_MB: z.coerce.number().positive().default(100),
  ATTACHMENT_RETRY_ATTEMPTS: z.coerce.number().positive().default(3),
  BACKLOG_SYNC_HOURS: z.coerce.number().positive().default(24),
  BACKLOG_SYNC_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(100),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  try {
    return configSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("\n");
      throw new ConfigError(`Configuration validation failed:\n${messages}`);
    }
    throw error;
  }
}

export const config = loadConfig();
