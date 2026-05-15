import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecentBacklogSyncs,
  createSyncRoutes,
  shouldSkipRecentBacklogSync,
} from "../../src/routes/syncRoutes";

const syncSelectedChannelBacklog = vi.hoisted(() => vi.fn());

vi.mock("../../src/moderation/backlogSync", () => ({
  syncSelectedChannelBacklog,
}));

describe("createSyncRoutes", () => {
  beforeEach(() => {
    syncSelectedChannelBacklog.mockReset();
    clearRecentBacklogSyncs();
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
      skipped: false,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("skips repeated sync requests during the cooldown window", async () => {
    expect(shouldSkipRecentBacklogSync("guild", "channel", 1000)).toBe(false);
    expect(shouldSkipRecentBacklogSync("guild", "channel", 1001)).toBe(true);
  });

  it("allows repeated sync requests after the cooldown window", async () => {
    expect(shouldSkipRecentBacklogSync("guild", "channel", 1000)).toBe(false);
    expect(shouldSkipRecentBacklogSync("guild", "channel", 301001)).toBe(false);
  });

  it("does not call Discord backlog sync for repeated requests", async () => {
    syncSelectedChannelBacklog.mockResolvedValue(3);
    const router = createSyncRoutes({} as never);
    const route = router.stack.find(
      (layer) => layer.route?.path === "/backlog-sync",
    );
    const handler = route?.route?.stack[0]?.handle;

    await handler?.(
      {
        body: { guildId: "selected-guild", channelId: "selected-channel" },
      } as Request,
      { json: vi.fn() } as unknown as Response,
      vi.fn(),
    );

    const json = vi.fn();
    await handler?.(
      {
        body: { guildId: "selected-guild", channelId: "selected-channel" },
      } as Request,
      { json } as unknown as Response,
      vi.fn(),
    );

    expect(syncSelectedChannelBacklog).toHaveBeenCalledTimes(1);
    expect(json).toHaveBeenCalledWith({
      success: true,
      channelId: "selected-channel",
      messagesSync: 0,
      skipped: true,
    });
  });
});
