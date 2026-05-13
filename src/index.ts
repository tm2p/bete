import "./mock-crc";
import "libsodium-wrappers";
import "@snazzah/davey";
import { getVoiceConnection } from "@discordjs/voice";
import { Client } from "discord.js-selfbot-v13";
import { config } from "./config";
import { discordPlayer } from "./player";
import { startRecording } from "./recorder";
import { startWebserver } from "./webserver";
import { createChildLogger } from "./logger";
import { retryWithBackoff } from "./retry";

const logger = createChildLogger("bot");

// Validasi environment variables
const token = process.env.DISCORD_TOKEN;
const voiceChannelId = process.env.VOICE_CHANNEL_ID;
const guildId = process.env.GUILD_ID;

if (!token) throw new Error("Missing DISCORD_TOKEN in .env");
if (!voiceChannelId) throw new Error("Missing VOICE_CHANNEL_ID in .env");
if (!guildId) throw new Error("Missing GUILD_ID in .env");

// Inisialisasi selfbot client
const client = new Client();

client.on("ready", async () => {
  if (config.verbose) {
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

  if (config.verbose) {
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
  startWebserver(config.webserverPort);
});

client.on("error", (err) => {
  logger.error({ error: err }, "Client error");
});

// Graceful shutdown
process.on("SIGINT", () => {
  if (config.verbose) {
    logger.info("Shutting down gracefully...");
  }
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (config.verbose) {
    logger.info("Terminating...");
  }
  client.destroy();
  process.exit(0);
});

client.login(token);
