import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createYtDlp } from "../../src/media/ytdlp";

class FakeProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
}

describe("createYtDlp", () => {
  it("reads YouTube metadata as JSON", async () => {
    const proc = new FakeProcess();
    const spawn = vi.fn(() => proc) as any;
    const ytdlp = createYtDlp({ spawn });

    const result = ytdlp.getMetadata("https://youtu.be/video");
    proc.stdout.write(
      JSON.stringify({
        title: "Song Title",
        webpage_url: "https://youtube.com/watch?v=video",
      }),
    );
    proc.stdout.end();
    proc.emit("close", 0);

    await expect(result).resolves.toEqual({
      title: "Song Title",
      webpageUrl: "https://youtube.com/watch?v=video",
    });
    expect(spawn).toHaveBeenCalledWith(
      "yt-dlp",
      [
        "https://youtu.be/video",
        "--dump-single-json",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  });

  it("reads direct audio URL", async () => {
    const proc = new FakeProcess();
    const spawn = vi.fn(() => proc) as any;
    const ytdlp = createYtDlp({ spawn });

    const result = ytdlp.getDirectAudioUrl("https://youtu.be/video");
    proc.stdout.write("https://audio.example.com/stream\n");
    proc.stdout.end();
    proc.emit("close", 0);

    await expect(result).resolves.toBe("https://audio.example.com/stream");
    expect(spawn).toHaveBeenCalledWith(
      "yt-dlp",
      [
        "https://youtu.be/video",
        "--get-url",
        "--format",
        "bestaudio[protocol^=http]/bestaudio/best",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  });

  it("reads direct video URL", async () => {
    const proc = new FakeProcess();
    const spawn = vi.fn(() => proc) as any;
    const ytdlp = createYtDlp({ spawn });

    const result = ytdlp.getDirectVideoUrl("https://youtu.be/video");
    proc.stdout.write("https://video.example.com/stream\n");
    proc.stdout.end();
    proc.emit("close", 0);

    await expect(result).resolves.toBe("https://video.example.com/stream");
    expect(spawn).toHaveBeenCalledWith(
      "yt-dlp",
      [
        "https://youtu.be/video",
        "--get-url",
        "--format",
        "best[protocol^=http]/best",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  });

  it("rejects when yt-dlp exits non-zero", async () => {
    const proc = new FakeProcess();
    const ytdlp = createYtDlp({ spawn: vi.fn(() => proc) as any });

    const result = ytdlp.getMetadata("https://youtu.be/video");
    proc.stderr.write("failed");
    proc.stderr.end();
    proc.emit("close", 1);

    await expect(result).rejects.toThrow("yt-dlp failed with code 1");
  });
});
