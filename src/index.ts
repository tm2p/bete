import "./mock-crc";
import "libsodium-wrappers";
import "@snazzah/davey";
import "dotenv/config";
import { getVoiceConnection } from "@discordjs/voice";
import { Client } from "discord.js-selfbot-v13";
import { config } from "./config";
import { createChildLogger } from "./logger";
import { discordPlayer } from "./player";
import { startRecording, stopRecording } from "./recorder";
import { startWebserver } from "./webserver";

const logger = createChildLogger("bot");

const token = config.DISCORD_TOKEN;
const voiceChannelId = config.VOICE_CHANNEL_ID;
const guildId = config.GUILD_ID;

// Inisialisasi selfbot client
const client = new Client();

// Track shutdown state
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn(`Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, "Graceful shutdown initiated");

  try {
    // Step 1: Stop recording
    if (guildId) {
      logger.info("Stopping recording...");
      stopRecording(guildId);
    }

    // Step 2: Pause player
    logger.info("Pausing player...");
    discordPlayer.pause();

    // Step 3: Destroy voice connection
    if (guildId) {
      const connection = getVoiceConnection(guildId);
      if (connection) {
        logger.info("Destroying voice connection...");
        try {
          connection.destroy();
        } catch (err) {
          logger.warn({ error: err }, "Error destroying voice connection");
        }
      }
    }

    // Step 4: Destroy client
    logger.info("Destroying Discord client...");
    try {
      client.destroy();
    } catch (err) {
      logger.warn({ error: err }, "Error destroying client");
    }

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (err) {
    logger.error({ error: err }, "Error during graceful shutdown");
    process.exit(1);
  }
}

client.on("ready", async () => {
  if (config.VERBOSE) {
    logger.info({ user: client.user?.tag }, "Bot logged in");
  }

  // Ambil guild
  const guild = client.guilds.cache.get(guildId!);
  if (!guild) {
    logger.error({ guildId }, "Guild not found");
    process.exit(1);
  }

  // Fetch channels jika belum ada di cache
  const channel =
    guild.channels.cache.get(voiceChannelId!) ??
    (await guild.channels.fetch(voiceChannelId!).catch(() => null));

  if (!channel || channel.type !== "GUILD_VOICE") {
    logger.error({ voiceChannelId }, "Voice channel not found or wrong type");
    process.exit(1);
  }

  if (config.VERBOSE) {
    logger.info(
      { channelName: channel.name, channelId: channel.id },
      "Joining voice channel",
    );
  }

  await startRecording(client, channel as any);

  // Set up player connection
  const connection = getVoiceConnection(guildId!);
  if (connection) {
    discordPlayer.setConnection(connection);
    logger.info("Player connected to voice channel");
  }

  // Start Webserver
  startWebserver(config.WEBSERVER_PORT);
});

client.on("error", (err) => {
  logger.error({ error: err }, "Client error");
});

// Graceful shutdown handlers
process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error({ error: err }, "Uncaught exception");
  gracefulShutdown("uncaughtException");
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled rejection");
  gracefulShutdown("unhandledRejection");
});

client.login(token);
