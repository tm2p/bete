import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const videoStreamPackage = JSON.parse(
  readFileSync("vendor/Discord-video-stream/package.json", "utf8"),
) as {
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

describe("Discord video stream workspace dependencies", () => {
  it("uses the local selfbot workspace package for development", () => {
    expect(videoStreamPackage.devDependencies?.["discord.js-selfbot-v13"]).toBe(
      "workspace:*",
    );
    expect(
      videoStreamPackage.peerDependencies?.["discord.js-selfbot-v13"],
    ).toBe("^3.6.0");
  });
});
