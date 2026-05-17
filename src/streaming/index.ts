import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { prepareTranscoder, TranscoderOptions } from "./transcoder";
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
    const guild = this.client.guilds.cache.get(guildId);
    const channel = (guild?.channels.cache.get(channelId) ??
      (await guild?.channels.fetch(channelId).catch(() => null))) as any;
    if (!channel || channel.guild?.id !== guildId) {
      throw new Error("VOICE_CHANNEL_NOT_FOUND");
    }

    const existingConnection = (this.client.voice as any).connection as
      | VoiceConnectionLike
      | undefined;
    if (existingConnection?.channel?.id === channelId) {
      (existingConnection as any).setVideoCodec?.("H264");
      return existingConnection;
    }

    const voiceConnection = (await this.client.voice.joinChannel(channel as any, {
      selfMute: true,
      selfDeaf: true,
      selfVideo: false,
      videoCodec: "H264",
    })) as unknown as VoiceConnectionLike;

    (voiceConnection as any).setVideoCodec?.("H264");

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
        const videoOptions: Record<string, any> = {
          fps: options.fps ?? 30,
          bitrate: options.bitrate ?? 2500,
          presetH26x: options.presetH26x ?? "superfast",
        };

        const audioOptions: Record<string, any> = {
          volume: false,
        };

        let videoSource: string | Readable;
        let audioSource: string | Readable;

        if (typeof source === "string" && source.includes("\n")) {
          // yt-dlp returns multiple URLs (e.g., video\n audio\n)
          const urls = source.split("\n").filter((u) => u.trim());
          videoSource = urls[0] ?? source;
          audioSource = urls[1] ?? urls[0] ?? source;
        } else if (typeof source !== "string") {
          // If source is a Readable (e.g. ffmpeg stdout) and audio+video
          // need to be played separately, tee the stream into two PassThroughs.
          if (options.includeAudio !== false) {
            const videoTee = new PassThrough();
            const audioTee = new PassThrough();
            // Pipe to both tees; allow consumers to read independently.
            (source as Readable).pipe(videoTee);
            (source as Readable).pipe(audioTee);
            videoSource = videoTee;
            audioSource = audioTee;
          } else {
            // audio excluded — single video stream
            const videoTee = new PassThrough();
            (source as Readable).pipe(videoTee);
            videoSource = videoTee;
            audioSource = videoTee;
          }
        } else {
          videoSource = source;
          audioSource = source;
        }

        const inputFFmpegArgs = [
          "-headers",
          "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.3\r\nConnection: keep-alive\r\n",
        ];

        if (typeof videoSource === "string" && videoSource.startsWith("http")) {
          videoOptions.inputFFmpegArgs = inputFFmpegArgs;
        }
        if (typeof audioSource === "string" && audioSource.startsWith("http")) {
          audioOptions.inputFFmpegArgs = inputFFmpegArgs;
        }

        activeVideo = stream.playVideo(videoSource, videoOptions);
        if (options.includeAudio !== false) {
          activeAudio = stream.playAudio(audioSource, audioOptions);
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
  command: ChildProcess | { kill?: (signal: NodeJS.Signals) => unknown };
  output: Readable;
} {
  const opts: TranscoderOptions = {
    fps: _options?.fps ?? 30,
    bitrate: _options?.bitrate ?? "2500k",
    preset: _options?.presetH26x ?? _options?.preset ?? "superfast",
  };
  const { command, output } = prepareTranscoder(source, opts);
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
  // Default behavior: forward resource (string or Readable) to session.play.
  await session.play(source, options);
}

export async function playTranscodedPreparedStream(
  source: string | Readable,
  session: StreamSession,
  options: StreamPlayOptions = {},
): Promise<void> {
  if (typeof source === "string" && /^(https?:)?\/\//.test(source)) {
    const { command, output } = prepareStream(source, options);
    const globalAny: any = globalThis;
    const onData = (chunk: Buffer) => {
      try {
        globalAny.broadcastVideoToWeb?.(chunk);
      } catch {
        // ignore errors broadcasting
      }
    };
    output.on("data", onData);
    try {
      await session.play(output, options);
    } finally {
      output.off("data", onData);
      try {
        command.kill?.("SIGKILL");
      } catch (e) {
        // ignore
      }
    }
    return;
  }

  await session.play(source, options);
}
