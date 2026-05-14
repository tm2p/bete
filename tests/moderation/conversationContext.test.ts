import { describe, expect, it } from "vitest";
import { buildConversationPromptMessages } from "../../src/moderation/conversationContext";
import type { MessageRecord } from "../../src/moderation/types";

function message(
  id: string,
  content: string,
  created_at: number,
): MessageRecord {
  return {
    id,
    guild_id: "g1",
    channel_id: "c1",
    thread_id: null,
    user_id: `u-${id}`,
    username: `user-${id}`,
    avatar_url: null,
    content,
    edited_content: null,
    created_at,
    edited_at: null,
    deleted_at: null,
    type: "text",
    metadata: null,
    ai_status: "pending",
  };
}

describe("buildConversationPromptMessages", () => {
  it("marks target messages and keeps chronological order", () => {
    const lines = buildConversationPromptMessages({
      contextBefore: [message("a", "hello", 1)],
      targets: [message("b", "bad?", 2)],
      maxTokens: 1000,
    });

    expect(lines).toContain(
      "[context] id=a time=1970-01-01T00:00:00.001Z user=user-a: hello",
    );
    expect(lines).toContain(
      "[target] id=b time=1970-01-01T00:00:00.002Z user=user-b: bad?",
    );

    const indexA = lines.findIndex((line) => line.includes("id=a"));
    const indexB = lines.findIndex((line) => line.includes("id=b"));
    expect(indexA).toBeLessThan(indexB);
  });

  it("uses edited content when present", () => {
    const target = message("b", "original", 2);
    target.edited_content = "edited";

    const lines = buildConversationPromptMessages({
      contextBefore: [],
      targets: [target],
      maxTokens: 1000,
    });

    expect(lines.some((line) => line.includes("edited"))).toBe(true);
    expect(lines.some((line) => line.includes("original"))).toBe(false);
  });
});
