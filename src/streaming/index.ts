import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";
import type { Client } from "discord.js-selfbot-v13";

type VoiceConnectionLike = {
  channel: {
    id: string;
  };
  createStreamConnection: () => Promise<StreamConnectionLike>;
  disconnect?: () => void;
};

type StreamConnectionLike = {
  playVideo: (resource: string | Readable, options?: Record<string, unknown>) => DispatcherLike;
  playAudio: (resource: string | Readable, options?: Record<string, unknown>) => DispatcherLike;
  disconnect?: () => void;
};

type DispatcherLike = EventEmitter & {
  stop?: () => void;
  pause?: () => void;
  resume?: () => void;
};

export interface StreamPlayOptions {
  fps?: number;
  bitrate?: number | string;
  includeAudio?: boolean;
  presetH26x?: string;
}

export interface StreamSession {
  connection: VoiceConnectionLike;
  stream: StreamConnectionLike;
  play(source: string | Readable, options?: StreamPlayOptions): Promise<void>;
  stop(): void;
}

export const Encoders = {
  software: (opts: any) => opts,
};

export const Utils = {
  normalizeVideoCodec: (c: string) => c.toUpperCase?.() ?? c,
};

export class Streamer {
  client: Client;
  constructor(client: Client) {
    this.client = client;
  }

  async joinVoice(guildId: string, channelId: string): Promise<VoiceConnectionLike> {
    const channel = (this.client.channels.resolve(channelId) ?? this.client.channels.cache.get(channelId)) as any;
    if (!channel || channel.guild?.id !== guildId) {
      throw new Error("VOICE_CHANNEL_NOT_FOUND");
    }

    const voiceConnection = (await this.client.voice.joinChannel(channel as any, {
      selfMute: true,
      selfDeaf: true,
      selfVideo: false,
      videoCodec: "H264",
    })) as unknown as VoiceConnectionLike;

    return voiceConnection;
  }

  async createSession(guildId: string, channelId: string): Promise<StreamSession> {
    const connection = await this.joinVoice(guildId, channelId);
    const stream = await connection.createStreamConnection();

    let activeVideo: DispatcherLike | null = null;
    let activeAudio: DispatcherLike | null = null;
    let finished = false;

    const stop = () => {
      activeVideo?.stop?.();
      activeAudio?.stop?.();
      stream.disconnect?.();
      connection.disconnect?.();
    };

    const waitForFinish = () =>
      new Promise<void>((resolve, reject) => {
        const maybeResolve = () => {
          if (finished) return;
          finished = true;
          resolve();
        };

        const handleError = (error: unknown) => {
          if (finished) return;
          finished = true;
          stop();
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        activeVideo?.on("finish", maybeResolve);
        activeAudio?.on("finish", maybeResolve);
        activeVideo?.on("error", handleError);
        activeAudio?.on("error", handleError);
      });

    return {
      connection,
      stream,
      async play(source: string | Readable, options: StreamPlayOptions = {}) {
        const videoOptions = {
          fps: options.fps ?? 30,
          bitrate: options.bitrate ?? 2500,
          presetH26x: options.presetH26x ?? "superfast",
        };

        activeVideo = stream.playVideo(source, videoOptions);
        if (options.includeAudio !== false) {
          activeAudio = stream.playAudio(source, { volume: false });
        }

        try {
          await waitForFinish();
        } finally {
          stop();
        }
      },
      stop,
    };
  }
}

export function prepareStream(source: string, _options: any): {
  command: ReturnType<typeof spawn> | { kill?: (signal: NodeJS.Signals) => unknown };
  output: Readable;
} {
  // Spawn ffmpeg to transcode the source into a simple container with
  // H264 video + Opus audio and pipe to stdout. Options are simplified and
  // intentionally conservative to keep parity with prior behavior.
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-i",
    source,
    "-c:v",
    "libx264",
    "-preset",
    "superfast",
    "-r",
    "30",
    "-s",
    "1280x720",
    "-b:v",
    "2500k",
    "-maxrate",
    "4000k",
    "-c:a",
    "libopus",
    "-f",
    "matroska",
    "-",
  ];

  const command = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  const output = command.stdout ?? new PassThrough();

  return { command, output };
}

export async function playStream(
  output: Readable,
  _streamer: Streamer,
  _options?: object,
): Promise<void> {
  // Simple implementation: consume the stream until end. In production
  // this should attach the stream to a WebRTC connection for Discord.
  return new Promise<void>((resolve, reject) => {
    output.on("end", resolve);
    output.on("close", resolve);
    output.on("error", (err) => reject(err));
    // Ensure data flows
    if (output.readable) output.resume();
  });
}

export async function createStreamSession(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<StreamSession> {
  return new Streamer(client).createSession(guildId, channelId);
}

export async function playPreparedStream(
  source: string | Readable,
  session: StreamSession,
  options: StreamPlayOptions = {},
): Promise<void> {
  await session.play(source, options);
}
