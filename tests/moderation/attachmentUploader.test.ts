import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  process.env = {
    ...process.env,
    DISCORD_TOKEN: "test-token",
    MONITOR_GUILD_ID: "test-guild",
    NODE_ENV: "test",
  };
});

describe("attachmentUploader", () => {
  it("parses picser upload response correctly", async () => {
    const { parseUploadResponse } = await import(
      "../../src/moderation/attachmentUploader"
    );

    const response = {
      success: true,
      filename: "uploads/abc123.jpg",
      urls: {
        raw_commit:
          "https://raw.githubusercontent.com/user/repo/commit/uploads/abc123.jpg",
      },
      size: 102400,
      type: "image/jpeg",
    };

    const result = parseUploadResponse(response);

    expect(result.success).toBe(true);
    expect(result.url).toBe(
      "https://raw.githubusercontent.com/user/repo/commit/uploads/abc123.jpg",
    );
    expect(result.filename).toBe("uploads/abc123.jpg");
  });

  it("handles upload response with missing raw_commit", async () => {
    const { parseUploadResponse } = await import(
      "../../src/moderation/attachmentUploader"
    );

    const response = {
      success: true,
      filename: "uploads/abc123.jpg",
      urls: {},
      size: 102400,
      type: "image/jpeg",
    };

    expect(() => parseUploadResponse(response)).toThrow();
  });
});
