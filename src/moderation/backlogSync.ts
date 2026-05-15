import type { Channel, Client, Message } from "discord.js-selfbot-v13";
import { config } from "../config";
import { createChildLogger } from "../logger";
import { captureMessage } from "./messageCapture";

const logger = createChildLogger("backlog-sync");

type BacklogChannel = Channel & {
  messages: {
    fetch(options: { limit: number; before?: string }): Promise<{
      size: number;
      values(): IterableIterator<Message>;
    }>;
  };
};

function hasMessageBacklog(channel: Channel): channel is BacklogChannel {
  return "messages" in channel;
}

async function syncChannelMessages(
  channel: BacklogChannel,
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

      await captureMessage(message, "text", { source: "backlog" });
      synced++;
    }

    before = messages[messages.length - 1]?.id;
    if (!before || batch.size < config.BACKLOG_SYNC_BATCH_SIZE) break;
  }

  return synced;
}

export async function syncBacklogMessages(client: Client): Promise<void> {
  const textGuildId = config.EFFECTIVE_TEXT_GUILD_ID;
  if (!textGuildId) {
    logger.warn("TEXT_GUILD_ID not configured, skipping backlog sync");
    return;
  }

  const guild = client.guilds.cache.get(textGuildId);
  if (!guild) {
    logger.warn(
      { guildId: textGuildId },
      "Text guild not found, skipping backlog sync",
    );
    return;
  }

  if (config.TEXT_CHANNEL_ID) {
    await syncSelectedChannelBacklog(client, guild.id, config.TEXT_CHANNEL_ID);
    return;
  }

  logger.info(
    { guildId: guild.id },
    "Backlog sync ready (will sync on-demand per selected channel)",
  );
}

export async function syncSelectedChannelBacklog(
  client: Client,
  guildId: string,
  channelId: string,
): Promise<number> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    logger.warn({ guildId }, "Guild not found for backlog sync");
    return 0;
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    logger.warn({ guildId, channelId }, "Channel not found for backlog sync");
    return 0;
  }
  if (!hasMessageBacklog(channel)) {
    logger.warn({ guildId, channelId }, "Channel cannot fetch message backlog");
    return 0;
  }

  const cutoffTime = Date.now() - config.BACKLOG_SYNC_HOURS * 60 * 60 * 1000;
  logger.info(
    { guildId, channelId, hours: config.BACKLOG_SYNC_HOURS },
    "Starting backlog sync for selected channel",
  );

  try {
    const count = await syncChannelMessages(channel, cutoffTime);
    logger.info(
      { channelId, count },
      "Backlog sync completed for selected channel",
    );
    return count;
  } catch (error) {
    logger.warn(
      {
        channelId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Backlog sync failed for selected channel",
    );
    return 0;
  }
}
