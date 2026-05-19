import { AudioPlayerStatus } from "@discordjs/voice";
import * as prism from "prism-media";
import { rmsDb, upsample24kMonoTo48kStereo } from "../audio/pcm";
import type { createChildLogger } from "../logger";
import { discordPlayer } from "../player";

type Logger = ReturnType<typeof createChildLogger>;

const RATE = 48000;
const CHANNELS = 2;
const FRAME_SIZE = 960;
const BYTES_PER_FRAME = FRAME_SIZE * CHANNELS * 2;
const SILENCE_TAIL_MS = 300;
const MAX_BUF_BYTES = BYTES_PER_FRAME * 50;
const SILENCE_FRAME = Buffer.alloc(BYTES_PER_FRAME, 0);

export interface VoiceAudioBridge {
  handleBrowserAudio(data: Buffer): void;
}

export function createVoiceAudioBridge(logger: Logger): VoiceAudioBridge {
  let opusEncoder: prism.opus.Encoder | null = null;
  let bridgePlayerPaused = true;
  let pcmBuffer = Buffer.alloc(0);
  let lastBrowserAudioTime = 0;
  let dbAccum = 0;
  let dbCount = 0;

  function startBrowserAudioBridge(): void {
    if (opusEncoder) return;

    opusEncoder = new prism.opus.Encoder({
      rate: RATE,
      channels: CHANNELS,
      frameSize: FRAME_SIZE,
    });
    const oggBitstream = new prism.opus.OggLogicalBitstream({
      opusHead: new prism.opus.OpusHead({
        channelCount: CHANNELS,
        sampleRate: RATE,
      }),
      pageSizeControl: { maxPackets: 1 },
      crc: true,
    });

    opusEncoder.on("error", () => {});
    opusEncoder.pipe(oggBitstream);
    opusEncoder.write(Buffer.alloc(BYTES_PER_FRAME, 0));
    discordPlayer.playStream(oggBitstream, "browser-bridge");
    discordPlayer.pause("browser-bridge");
    bridgePlayerPaused = true;
  }

  function ensureBrowserAudioBridge(): boolean {
    const owner = discordPlayer.getOwner();
    if (owner !== "none" && owner !== "browser-bridge") return false;
    if (
      owner === "none" ||
      discordPlayer.getStatus() === AudioPlayerStatus.Idle
    ) {
      startBrowserAudioBridge();
    }
    return true;
  }

  setInterval(() => {
    if (dbCount > 0) {
      const avg = dbAccum / dbCount;
      logger.info({ level: avg.toFixed(1), frames: dbCount }, "Audio level");
      dbAccum = 0;
      dbCount = 0;
    }
  }, 2000);

  setInterval(() => {
    const msSinceAudio = Date.now() - lastBrowserAudioTime;
    let frame: Buffer | null = null;

    if (pcmBuffer.length >= BYTES_PER_FRAME) {
      frame = pcmBuffer.subarray(0, BYTES_PER_FRAME);
      pcmBuffer = pcmBuffer.subarray(BYTES_PER_FRAME);
      dbAccum += rmsDb(frame);
      dbCount++;

      if (!ensureBrowserAudioBridge()) {
        pcmBuffer = Buffer.alloc(0);
        return;
      }
      if (bridgePlayerPaused) {
        const unpaused = discordPlayer.unpause("browser-bridge");
        bridgePlayerPaused = false;
        logger.info({ unpaused }, "Transmitting — Discord indicator ON");
      }
    } else if (msSinceAudio < SILENCE_TAIL_MS && msSinceAudio > 0) {
      frame = SILENCE_FRAME;
    } else if (!bridgePlayerPaused && msSinceAudio >= SILENCE_TAIL_MS) {
      discordPlayer.pause("browser-bridge");
      bridgePlayerPaused = true;
      logger.info("Stopped — Discord indicator OFF");
      return;
    } else {
      return;
    }

    if (!opusEncoder) return;
    const ok = opusEncoder.write(frame);
    if (!ok) {
      opusEncoder.once("drain", () => {});
    }
  }, 20);

  return {
    handleBrowserAudio(data: Buffer): void {
      lastBrowserAudioTime = Date.now();
      const upsampled = upsample24kMonoTo48kStereo(data);
      if (pcmBuffer.length < MAX_BUF_BYTES) {
        pcmBuffer = Buffer.concat([pcmBuffer, upsampled]);
      }
    },
  };
}
