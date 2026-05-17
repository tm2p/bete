import { spawn, ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import type { Readable } from "node:stream";
import { retryWithBackoff } from "../retry";
import { createChildLogger } from "../logger";

const logger = createChildLogger("transcoder");

export interface TranscoderOptions {
  fps?: number;
  bitrate?: string | number;
  preset?: string;
}

export class Transcoder {
  proc: ChildProcess | null = null;
  output: Readable | null = null;

  constructor(private source: string, private opts: TranscoderOptions = {}) {}

  start(): { command: ChildProcess; output: Readable } {
    const fps = this.opts.fps ?? 30;
    const bitrate = String(this.opts.bitrate ?? "2500k");
    const preset = this.opts.preset ?? "superfast";

    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-i",
      this.source,
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-r",
      String(fps),
      "-s",
      "1280x720",
      "-b:v",
      String(bitrate),
      "-maxrate",
      "4000k",
      "-c:a",
      "libopus",
      "-f",
      "matroska",
      "-",
    ];

    const cmd = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = cmd.stdout ?? new PassThrough();

    this.proc = cmd;
    this.output = out;

    cmd.on("error", (err) => {
      logger.error({ err }, "transcoder process error");
    });
    cmd.on("exit", (code, signal) => {
      logger.info({ code, signal }, "transcoder exited");
    });

    return { command: cmd, output: out };
  }

  stop(): void {
    try {
      if (this.proc && !this.proc.killed) this.proc.kill("SIGKILL");
    } catch (e) {
      logger.warn({ e }, "failed to kill transcoder");
    }
    this.proc = null;
    this.output = null;
  }

  async startWithRetry(retries = 2) {
    return retryWithBackoff(() => Promise.resolve(this.start()), {
      retries,
      logger,
    });
  }
}

export function prepareTranscoder(source: string, options: TranscoderOptions = {}) {
  const t = new Transcoder(source, options);
  const { command, output } = t.start();
  return { transcoder: t, command, output };
}
