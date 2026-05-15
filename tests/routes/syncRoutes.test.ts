import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncRoutes } from "../../src/routes/syncRoutes";

const syncSelectedChannelBacklog = vi.hoisted(() => vi.fn());

vi.mock("../../src/moderation/backlogSync", () => ({
  syncSelectedChannelBacklog,
}));

describe("createSyncRoutes", () => {
  beforeEach(() => {
    syncSelectedChannelBacklog.mockReset();
  });

  it("syncs the selected guild and channel from the request", async () => {
    syncSelectedChannelBacklog.mockResolvedValue(3);
    const router = createSyncRoutes({} as never);
    const route = router.stack.find(
      (layer) => layer.route?.path === "/backlog-sync",
    );
    const handler = route?.route?.stack[0]?.handle;

    const json = vi.fn();
    const next = vi.fn();

    await handler?.(
      {
        body: { guildId: "selected-guild", channelId: "selected-channel" },
      } as Request,
      { json } as unknown as Response,
      next,
    );

    expect(syncSelectedChannelBacklog).toHaveBeenCalledWith(
      {},
      "selected-guild",
      "selected-channel",
    );
    expect(json).toHaveBeenCalledWith({
      success: true,
      channelId: "selected-channel",
      messagesSync: 3,
    });
    expect(next).not.toHaveBeenCalled();
  });
});
