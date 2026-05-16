import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/errors";
import type { DiscordPlayerOwner } from "../../src/media/mediaTypes";
import { createScreenShareController } from "../../src/media/screenShareController";

function createDependencies() {
  const session = {
    play: vi.fn(() => new Promise<void>(() => {})),
    stop: vi.fn(),
  };
  return {
    getVoiceStatus: vi.fn(() => ({
      connected: true,
      activeGuildId: "guild-1" as string | null,
      activeChannelId: "channel-1" as string | null,
    })),
    getPlayerOwner: vi.fn((): DiscordPlayerOwner => "none"),
    getDirectVideoUrl: vi.fn(async () => "https://cdn.example.com/video.mp4"),
    streamer: {
      createSession: vi.fn(async () => session),
      client: {},
    },
    session,
  };
}

describe("createScreenShareController", () => {
  it("starts a YouTube Go Live stream", async () => {
    const dependencies = createDependencies();
    const controller = createScreenShareController(dependencies);

    const playback = await controller.start("https://youtu.be/video");

    expect(dependencies.getDirectVideoUrl).toHaveBeenCalledWith(
      "https://youtu.be/video",
    );
    expect(dependencies.streamer.createSession).toHaveBeenCalledWith(
      "guild-1",
      "channel-1",
    );
    expect(dependencies.session.play).toHaveBeenCalledWith(
      "https://cdn.example.com/video.mp4",
      expect.objectContaining({
        includeAudio: true,
        fps: 30,
        bitrate: 2500,
      }),
    );
    expect(controller.isActive()).toBe(true);
    playback.stop();
    expect(controller.isActive()).toBe(false);
  });

  it("rejects when voice is not connected", async () => {
    const dependencies = createDependencies();
    dependencies.getVoiceStatus.mockReturnValue({
      connected: false,
      activeGuildId: null,
      activeChannelId: null,
    });
    const controller = createScreenShareController(dependencies);

    await expect(
      controller.start("https://youtu.be/video"),
    ).rejects.toMatchObject({
      code: "VOICE_NOT_CONNECTED",
      statusCode: 409,
    } satisfies Partial<AppError>);
  });

  it("rejects when music owns the shared player", async () => {
    const dependencies = createDependencies();
    dependencies.getPlayerOwner.mockReturnValue("music");
    const controller = createScreenShareController(dependencies);

    await expect(
      controller.start("https://youtu.be/video"),
    ).rejects.toMatchObject({
      code: "MEDIA_BUSY",
      statusCode: 409,
    } satisfies Partial<AppError>);
  });

  it("wraps stream startup failures", async () => {
    const dependencies = createDependencies();
    dependencies.session.play.mockImplementation(() => {
      throw new Error("go live failed");
    });
    const controller = createScreenShareController(dependencies);

    const playback = await controller.start("https://youtu.be/video");

    await expect(playback.done).rejects.toThrow("go live failed");
  });
});
