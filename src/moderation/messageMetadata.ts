import type { Message, TextChannel, ThreadChannel } from "discord.js-selfbot-v13";

export interface MessageLocation {
  channelId: string;
  threadId: string | null;
  threadName: string | null;
  channelName: string | null;
}

export interface RichMessageMetadata {
  stickers: Array<{ id: string; name: string; url: string; format: string | null }>;
  embeds: Array<{
    title: string | null;
    description: string | null;
    url: string | null;
    color: number | null;
    image: string | null;
    thumbnail: string | null;
    author: { name: string | null; url: string | null; iconURL: string | null } | null;
    footer: { text: string | null; iconURL: string | null } | null;
    fields: Array<{ name: string; value: string; inline: boolean }>;
  }>;
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    contentType: string | null;
    size: number;
  }>;
  author: {
    id: string;
    username: string;
    tag: string | null;
    avatarURL: string | null;
    bot: boolean;
  };
  member: {
    displayName: string | null;
    roles: Array<{ id: string; name: string }>;
    joinedTimestamp: number | null;
  } | null;
  channel: MessageLocation;
  reference: {
    messageId: string | null;
    channelId: string | null;
    guildId: string | null;
  } | null;
}

export function getMessageLocation(message: Message): MessageLocation {
  const channel = message.channel as TextChannel | ThreadChannel;
  if (!channel.isThread?.()) {
    return {
      channelId: message.channelId,
      threadId: null,
      threadName: null,
      channelName: "name" in channel ? channel.name : null,
    };
  }

  return {
    channelId: channel.parentId ?? message.channelId,
    threadId: channel.id,
    threadName: channel.name,
    channelName: channel.parent?.name ?? null,
  };
}

export function getStickerMetadata(message: Message): RichMessageMetadata["stickers"] {
  return Array.from(message.stickers.values()).map((sticker) => ({
    id: sticker.id,
    name: sticker.name,
    url: sticker.url,
    format: sticker.format ?? null,
  }));
}

export function getAttachmentMetadata(message: Message): RichMessageMetadata["attachments"] {
  return Array.from(message.attachments.values()).map((attachment) => ({
    id: attachment.id,
    name: attachment.name || "unknown",
    url: attachment.url,
    contentType: attachment.contentType ?? null,
    size: attachment.size,
  }));
}

export function getEmbedMetadata(message: Message): RichMessageMetadata["embeds"] {
  return message.embeds.map((embed) => ({
    title: embed.title ?? null,
    description: embed.description ?? null,
    url: embed.url ?? null,
    color: embed.color ?? null,
    image: embed.image?.url ?? null,
    thumbnail: embed.thumbnail?.url ?? null,
    author: embed.author
      ? {
          name: embed.author.name ?? null,
          url: embed.author.url ?? null,
          iconURL: embed.author.iconURL ?? null,
        }
      : null,
    footer: embed.footer
      ? {
          text: embed.footer.text ?? null,
          iconURL: embed.footer.iconURL ?? null,
        }
      : null,
    fields: embed.fields.map((field) => ({
      name: field.name,
      value: field.value,
      inline: Boolean(field.inline),
    })),
  }));
}

export function getMessageMetadata(message: Message): RichMessageMetadata {
  const member = message.member;
  return {
    stickers: getStickerMetadata(message),
    embeds: getEmbedMetadata(message),
    attachments: getAttachmentMetadata(message),
    author: {
      id: message.author.id,
      username: message.author.username,
      tag: "tag" in message.author ? message.author.tag : null,
      avatarURL: message.author.avatarURL() ?? null,
      bot: Boolean(message.author.bot),
    },
    member: member
      ? {
          displayName: member.displayName ?? null,
          roles: member.roles.cache.map((role) => ({ id: role.id, name: role.name })),
          joinedTimestamp: member.joinedTimestamp ?? null,
        }
      : null,
    channel: getMessageLocation(message),
    reference: message.reference
      ? {
          messageId: message.reference.messageId ?? null,
          channelId: message.reference.channelId ?? null,
          guildId: message.reference.guildId ?? null,
        }
      : null,
  };
}

export function getDisplayContent(message: Message): string {
  if (message.content.trim().length > 0) return message.content;

  const stickers = getStickerMetadata(message);
  if (stickers.length > 0) {
    return stickers.map((sticker) => `[Sticker: ${sticker.name}]`).join(" ");
  }

  const attachments = getAttachmentMetadata(message);
  if (attachments.length > 0) {
    return attachments.map((attachment) => `[Attachment: ${attachment.name}]`).join(" ");
  }

  const embeds = getEmbedMetadata(message);
  if (embeds.length > 0) {
    return embeds.map((embed) => embed.title || embed.description || "[Embed]").join(" ");
  }

  return "";
}
