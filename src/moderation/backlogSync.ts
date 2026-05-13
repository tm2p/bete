import type { Client, Message } from "discord.js-selfbot-v13";
import { config } from "../config";
import { createChildLogger } from "../logger";
import type { SqliteDatabase } from "../muxer-queue";
import { captureMessage } from "./messageCapture";

const logger = createChildLogger("backlog-sync");

function isWatchableChannel(channel: { type?: string; messages?: unknown }): boolean {
  return Boolean(
    channel.messages &&
      ["GUILD_TEXT", "GUILD_PUBLIC_THREAD", "GUILD_PRIVATE_THREAD"].includes(
        channel.type ?? "",
      ),
  );
}

async function collectWatchableChannels(guild: any): Promise<any[]> {
  const channels: any[] = [];
  for (const channel of guild.channels.cache.values()) {
    if (isWatchableChannel(channel)) {
      channels.push(channel);
    }

    if (channel.threads?.fetch) {
      for (const archived of [false, true]) {
        const fetched = await channel.threads
          .fetch({ archived, limit: 100 })
          .catch(() => null);
        if (!fetched?.threads) continue;
        for (const thread of fetched.threads.values()) {
          if (isWatchableChannel(thread)) channels.push(thread);
        }
      }
    }
  }

  return Array.from(new Map(channels.map((channel) => [channel.id, channel])).values());
}

async function syncChannelMessages(
  db: SqliteDatabase,
  channel: any,
  cutoffTime: number,
): Promise<number> {
  let before: string | undefined;
  let synced = 0;
  let shouldContinue = true;

  while (shouldContinue) {
    const batch = await channel.messages.fetch({
      limit: config.BACKLOG_SYNC_BATCH_SIZE,
      ...(before ? { before } : {}),
    });

    if (batch.size === 0) break;

    const messages = Array.from(batch.values()) as Message[];
    for (const message of messages) {
      if (message.author?.bot) continue;
      if (message.createdTimestamp < cutoffTime) {
        shouldContinue = false;
        continue;
      }

      await captureMessage(db, message, "text");
      synced++;
    }

    before = messages[messages.length - 1]?.id;
    if (!before || batch.size < config.BACKLOG_SYNC_BATCH_SIZE) break;
  }

  return synced;
}

export async function syncBacklogMessages(
  client: Client,
  db: SqliteDatabase,
): Promise<void> {
  if (!config.MONITOR_GUILD_ID) {
    logger.warn("MONITOR_GUILD_ID not configured, skipping backlog sync");
    return;
  }

  const guild = client.guilds.cache.get(config.MONITOR_GUILD_ID);
  if (!guild) {
    logger.warn({ guildId: config.MONITOR_GUILD_ID }, "Monitor guild not found, skipping backlog sync");
    return;
  }

  const cutoffTime = Date.now() - config.BACKLOG_SYNC_HOURS * 60 * 60 * 1000;
  await guild.channels.fetch().catch(() => null);

  const channels = await collectWatchableChannels(guild);

  let total = 0;
  logger.info(
    { guildId: guild.id, channels: channels.length, hours: config.BACKLOG_SYNC_HOURS },
    "Starting message backlog sync",
  );

  for (const channel of channels) {
    try {
      const count = await syncChannelMessages(db, channel as any, cutoffTime);
      total += count;
      logger.info({ channelId: channel.id, count }, "Backlog channel sync completed");
    } catch (error) {
      logger.warn(
        {
          channelId: channel.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Backlog channel sync failed",
      );
    }
  }

  logger.info({ total }, "Message backlog sync completed");
}
