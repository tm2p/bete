import fs from "node:fs";
import path from "node:path";
import {
  EndBehaviorType,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Client, VoiceChannel } from "discord.js-selfbot-v13";
import prism from "prism-media";
import { config } from "./config";
import { PacketFilter } from "./packetFilter";
import { subscribeToAudioStream } from "./recorder/audioStream";
import { OpusDecoder } from "./recorder/decoder";
import {
  collectUserMetadata,
  createSegmentMetadata,
} from "./recorder/metadata";
import { SegmentManager } from "./recorder/segment";
import type { PcmBroadcaster } from "./types";

const recordingsDir = config.recordingsDir;

// Pastikan folder recordings ada
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

/**
 * Join ke voice channel dan mulai merekam semua user yang bicara.
 */
export async function startRecording(
  client: Client,
  channel: VoiceChannel,
): Promise<void> {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator as any,
    selfDeaf: false,
    selfMute: false,
    debug: true,
  });

  if (config.verbose) {
    console.log(`[recorder] Joining voice channel: #${channel.name}`);
  }

  connection.on("debug", (msg) => {
    if (config.verbose) {
      console.log(`[voice-debug] ${msg}`);
    }
  });

  connection.on("error", (err) => {
    console.error(`[voice-error]`, err);
  });

  // Tunggu sampai benar-benar terhubung
  try {
    await entersState(
      connection,
      VoiceConnectionStatus.Ready,
      config.voiceConnectionTimeoutMs,
    );
    if (config.verbose) {
      console.log("[recorder] Connected to voice channel. Recording started.");
    }
  } catch (err) {
    console.error("[recorder] Failed to connect:", err);
    connection.destroy();
    return;
  }

  const receiver = connection.receiver;
  const broadcaster = globalThis as typeof globalThis & PcmBroadcaster;

  // Dengarkan siapapun yang mulai bicara
  receiver.speaking.on("start", async (userId) => {
    const userMetadata = await collectUserMetadata(client, userId, channel);
    console.log(`${userMetadata.username} [voice activity]`);

    // Notify webserver
    broadcaster.updateActiveUser?.(userId, {
      username: userMetadata.username,
      avatar: userMetadata.avatarUrl,
      speaking: true,
    });

    // Jangan record kalau sudah ada stream aktif untuk user ini
    if (receiver.subscriptions.has(userId)) return;

    const timestamp = Date.now();
    const sessionStartTime = timestamp;
    const sessionId = `${userId}-${sessionStartTime}`;
    const userDir = path.join(recordingsDir, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    try {
      // --- OGG file recording with segment rotation ---
      const packetFilterForOgg = new PacketFilter(config.packetFilterMinSize);
      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 3000,
        },
      });
      const oggPacketStream = audioStream.pipe(packetFilterForOgg);
      const segmentManager = new SegmentManager(
        userDir,
        config.recordingSegmentMs,
      );

      // --- Web broadcast: prism decoder with safe restart and cooldown ---
      const decoder = new OpusDecoder({
        cooldownMs: config.decoderCooldownMs,
        rotateMs: config.decoderRotateMs,
        onData: (pcm) => {
          if (!broadcaster.broadcastPcmToWeb) return;
          // Downsample 48kHz stereo → 24kHz mono (left channel, every 2nd sample)
          const outBuf = Buffer.alloc(pcm.length / 4);
          for (let i = 0; i < outBuf.length / 2; i++) {
            outBuf.writeInt16LE(pcm.readInt16LE(i * 8), i * 2);
          }
          broadcaster.broadcastPcmToWeb(outBuf, userId);
        },
      });

      let currentSegment = segmentManager.open(oggPacketStream);
      currentSegment.out.on("finish", () => {
        if (config.verbose) {
          console.log(`[recorder] Saved: ${currentSegment.filename}`);
        }
        const metadata = createSegmentMetadata(
          userMetadata,
          currentSegment,
          sessionId,
          sessionStartTime,
          config.recordingSegmentMs,
        );
        fs.writeFileSync(
          currentSegment.jsonFilename,
          JSON.stringify(metadata, null, 2),
        );
        if (config.verbose) {
          console.log(
            `[recorder] Saved metadata: ${currentSegment.jsonFilename}`,
          );
        }
      });

      currentSegment.out.on("error", (err) => {
        console.error(`[recorder] File write error ${userId}:`, err.message);
      });

      // Feed Opus packets one-by-one
      subscribeToAudioStream(receiver, userId, {
        onPacket: (chunk) => {
          if (chunk.length < 8) return;
          segmentManager.rotateIfNeeded(oggPacketStream);
          if (!broadcaster.broadcastPcmToWeb) return;
          decoder.rotateIfNeeded();
          decoder.write(chunk);
        },
        onEnd: () => {
          const segment = segmentManager.close(oggPacketStream);
          decoder.destroy();
          broadcaster.updateActiveUser?.(userId, {
            username: userMetadata.username,
            avatar: userMetadata.avatarUrl,
            speaking: false,
          });
        },
        onError: (error) => {
          segmentManager.close(oggPacketStream);
          decoder.destroy();
          console.error(
            `[recorder] Audio Stream error ${userId}:`,
            error.message,
          );
        },
      });

      packetFilterForOgg.on("error", (err) => {
        segmentManager.close(oggPacketStream);
        console.error(
          `[recorder] PacketFilter(ogg) error ${userId}:`,
          err.message,
        );
      });
    } catch (e) {
      console.error(`[recorder] Failed to create stream for ${userId}:`, e);
    }
  });

  // Handle disconnect yang tidak disengaja
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    if (config.verbose) {
      console.warn(
        "[recorder] Disconnected from voice channel. Reconnecting...",
      );
    }
    try {
      await Promise.race([
        entersState(
          connection,
          VoiceConnectionStatus.Signalling,
          config.reconnectTimeoutMs,
        ),
        entersState(
          connection,
          VoiceConnectionStatus.Connecting,
          config.reconnectTimeoutMs,
        ),
      ]);
      // Berhasil reconnect
    } catch {
      console.error("[recorder] Could not reconnect. Destroying connection.");
      connection.destroy();
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    if (config.verbose) {
      console.log("[recorder] Voice connection destroyed.");
    }
  });
}

/**
 * Hentikan recording dan disconnect dari voice channel.
 */
export function stopRecording(guildId: string): void {
  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    if (config.verbose) {
      console.log("[recorder] Recording stopped and disconnected.");
    }
  } else {
    console.warn("[recorder] No active connection to stop.");
  }
}
