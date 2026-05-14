import type { MessageRecord } from "./types";

export interface ConversationContextInput {
  contextBefore: MessageRecord[];
  targets: MessageRecord[];
  maxTokens: number;
}

/**
 * Formats a timestamp to ISO 8601 string
 */
function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Estimates token count for a string (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Builds conversation prompt messages with context and targets
 * - Marks target messages with [target], prior context with [context]
 * - Uses edited_content when present, otherwise content
 * - Maintains chronological order
 * - Respects maxTokens budget, prioritizing targets and most recent context
 */
export function buildConversationPromptMessages(
  input: ConversationContextInput,
): string[] {
  const { contextBefore, targets, maxTokens } = input;

  // Format all messages
  const formatMessage = (msg: MessageRecord, label: string): string => {
    const content = msg.edited_content ?? msg.content;
    const timestamp = formatTimestamp(msg.created_at);
    return `[${label}] id=${msg.id} time=${timestamp} user=${msg.username}: ${content}`;
  };

  const targetLines = targets.map((msg) => formatMessage(msg, "target"));
  const contextLines = contextBefore.map((msg) =>
    formatMessage(msg, "context"),
  );

  // Calculate tokens for targets (always include)
  let usedTokens = targetLines.reduce(
    (sum, line) => sum + estimateTokens(line),
    0,
  );

  // Add context lines in reverse chronological order (most recent first)
  // until we hit the token budget
  const selectedContextLines: string[] = [];
  for (let i = contextLines.length - 1; i >= 0; i--) {
    const line = contextLines[i];
    const lineTokens = estimateTokens(line);
    if (usedTokens + lineTokens <= maxTokens) {
      selectedContextLines.unshift(line); // prepend to maintain chronological order
      usedTokens += lineTokens;
    }
  }

  // Combine: context (chronological) + targets (chronological)
  const allMessages = [...selectedContextLines, ...targetLines];

  // Sort by timestamp to ensure chronological order
  allMessages.sort((a, b) => {
    const timeA = a.match(/time=([^\s]+)/)?.[1] ?? "";
    const timeB = b.match(/time=([^\s]+)/)?.[1] ?? "";
    return timeA.localeCompare(timeB);
  });

  return allMessages;
}
