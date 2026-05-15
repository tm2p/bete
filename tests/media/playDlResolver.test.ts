import { describe, expect, it, vi } from "vitest";
import { createPlayDlResolver } from "../../src/media/playDlResolver";

describe("createPlayDlResolver", () => {
  it("returns the first YouTube search result", async () => {
    const resolver = createPlayDlResolver({
      search: vi.fn(async () => [
        { title: "Song Result", url: "https://youtube.com/watch?v=abc" },
      ]),
      spotify: vi.fn(),
    });

    await expect(resolver.searchYouTube("artist song")).resolves.toEqual({
      title: "Song Result",
      url: "https://youtube.com/watch?v=abc",
    });
  });

  it("turns Spotify track metadata into a YouTube search query", async () => {
    const resolver = createPlayDlResolver({
      search: vi.fn(async () => [
        { title: "Artist - Track", url: "https://youtube.com/watch?v=track" },
      ]),
      spotify: vi.fn(async () => ({
        type: "track",
        name: "Track",
        artists: [{ name: "Artist" }],
      })),
    });

    await expect(
      resolver.resolveSpotifyTrack("https://open.spotify.com/track/123"),
    ).resolves.toEqual({
      title: "Artist - Track",
      url: "https://youtube.com/watch?v=track",
    });
  });

  it("rejects Spotify playlists in this phase", async () => {
    const resolver = createPlayDlResolver({
      search: vi.fn(),
      spotify: vi.fn(async () => ({ type: "playlist", name: "Playlist" })),
    });

    await expect(
      resolver.resolveSpotifyTrack("https://open.spotify.com/playlist/123"),
    ).rejects.toThrow("Only Spotify track URLs are supported");
  });
});
