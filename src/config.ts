// Configuration for the bot
export interface AppConfig {
  verbose: boolean;
  recordingsDir: string;
  recordingSegmentMs: number;
  decoderRotateMs: number;
  decoderCooldownMs: number;
  webserverPort: number;
  voiceConnectionTimeoutMs: number;
  reconnectTimeoutMs: number;
  audioStreamSilenceDurationMs: number;
  packetFilterMinSize: number;
  opusFrameSize: number;
  audioSampleRate: number;
  audioChannels: number;
  avatarSize: number;
}

export function parseBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function parsePositiveNumber(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    verbose: parseBoolean(env.VERBOSE, false),
    recordingsDir: env.RECORDINGS_DIR ?? "./recordings",
    recordingSegmentMs: parsePositiveNumber(env.RECORDING_SEGMENT_MS, 5_000),
    decoderRotateMs: parsePositiveNumber(env.DECODER_ROTATE_MS, 5_000),
    decoderCooldownMs: parsePositiveNumber(env.DECODER_COOLDOWN_MS, 30_000),
    webserverPort: parsePositiveNumber(env.WEBSERVER_PORT, 3000),
    voiceConnectionTimeoutMs: parsePositiveNumber(
      env.VOICE_CONNECTION_TIMEOUT_MS,
      15_000,
    ),
    reconnectTimeoutMs: parsePositiveNumber(env.RECONNECT_TIMEOUT_MS, 5_000),
    audioStreamSilenceDurationMs: parsePositiveNumber(
      env.AUDIO_STREAM_SILENCE_DURATION_MS,
      3000,
    ),
    packetFilterMinSize: parsePositiveNumber(env.PACKET_FILTER_MIN_SIZE, 8),
    opusFrameSize: parsePositiveNumber(env.OPUS_FRAME_SIZE, 960),
    audioSampleRate: parsePositiveNumber(env.AUDIO_SAMPLE_RATE, 48000),
    audioChannels: parsePositiveNumber(env.AUDIO_CHANNELS, 2),
    avatarSize: parsePositiveNumber(env.AVATAR_SIZE, 64),
  };
}

export const config = loadConfig();
