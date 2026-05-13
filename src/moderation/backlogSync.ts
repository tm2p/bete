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

  // Fast pass: collect text channels from cache only
  for (const channel of guild.channels.cache.values()) {
    if (isWatchableChannel(channel)) {
      channels.push(channel);
    }
  }

  // Slow pass: discover threads with timeout per channel (non-blocking to message sync)
  const threadPromises: Promise<void>[] = [];
  for (const channel of guild.channels.cache.values()) {
    if (!channel.threads?.fetch) continue;

    threadPromises.push(
      (async () => {
        for (const archived of [false, true]) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const fetched = await Promise.race([
              channel.threads.fetch({ archived, limit: 100 }),
              new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout')))),
            ]).catch(() => null);
            clearTimeout(timeout);

            if (!fetched?.threads) continue;
            for (const thread of fetched.threads.values()) {
              if (isWatchableChannel(thread)) channels.push(thread);
            }
          } catch {
            // Skip this channel's threads on timeout/error
          }
        }
      })()
    );
  }

  // Wait for all thread discoveries with overall timeout
  await Promise.race([
    Promise.all(threadPromises),
    new Promise((resolve) => setTimeout(resolve, 30000)),
  ]).catch(() => {
    logger.warn("Thread discovery timeout, proceeding with cached channels");
  });

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
  logger.info(
    { guildId: guild.id, hours: config.BACKLOG_SYNC_HOURS },
    "Starting message backlog sync",
  );

  logger.info({ guildId: guild.id }, "Fetching guild channels for backlog sync");
  await guild.channels.fetch().catch((error) => {
    logger.warn(
      { guildId: guild.id, error: error instanceof Error ? error.message : String(error) },
      "Failed to fetch guild channels before backlog sync",
    );
    return null;
  });

  logger.info({ guildId: guild.id }, "Collecting watchable channels for backlog sync");
  const channels = await collectWatchableChannels(guild);

  let total = 0;
  logger.info(
    { guildId: guild.id, channels: channels.length, hours: config.BACKLOG_SYNC_HOURS },
    "Watchable channels collected for backlog sync",
  );

  // Sync channels in parallel with concurrency limit of 3
  const concurrency = 3;
  const queue = [...channels];
  const active: Promise<number>[] = [];

  while (queue.length > 0 || active.length > 0) {
    while (active.length < concurrency && queue.length > 0) {
      const channel = queue.shift()!;
      const promise = (async () => {
        try {
          const count = await syncChannelMessages(db, channel as any, cutoffTime);
          logger.info({ channelId: channel.id, count }, "Backlog channel sync completed");
          return count;
        } catch (error) {
          logger.warn(
            {
              channelId: channel.id,
              error: error instanceof Error ? error.message : String(error),
            },
            "Backlog channel sync failed",
          );
          return 0;
        }
      })();
      active.push(promise);
    }

    if (active.length > 0) {
      const result = await Promise.race(active);
      total += result;
      active.splice(active.findIndex((p) => p === Promise.resolve(result)), 1);
    }
  }

  logger.info({ total }, "Message backlog sync completed");
}
