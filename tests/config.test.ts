import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

afterEach(() => {
  process.env = originalEnv;
  vi.resetModules();
});

describe("loadConfig", () => {
  it("loads required values and coerces optional values", async () => {
    process.env = {
      ...originalEnv,
      DISCORD_TOKEN: "token",
      VERBOSE: "true",
      WEBSERVER_PORT: "4000",
      NODE_ENV: "test",
    };

    const { loadConfig } = await import("../src/config");
    const config = loadConfig(process.env);

    expect(config.DISCORD_TOKEN).toBe("token");
    expect(config.GUILD_ID).toBeUndefined();
    expect(config.VOICE_CHANNEL_ID).toBeUndefined();
    expect(config.VERBOSE).toBe(true);
    expect(config.WEBSERVER_PORT).toBe(4000);
    expect(config.RECORDINGS_DIR).toBe("./recordings");
    expect(config.NODE_ENV).toBe("test");
  });

  it("derives split text and voice guild defaults from legacy config", async () => {
    process.env = {
      ...originalEnv,
      DISCORD_TOKEN: "token",
      MONITOR_GUILD_ID: "legacy-text-guild",
      GUILD_ID: "legacy-voice-guild",
      VOICE_CHANNEL_ID: "voice-channel",
      NODE_ENV: "test",
    };

    const { loadConfig } = await import("../src/config");
    const config = loadConfig(process.env);

    expect(config.TEXT_GUILD_ID).toBeUndefined();
    expect(config.EFFECTIVE_TEXT_GUILD_ID).toBe("legacy-text-guild");
    expect(config.EFFECTIVE_VOICE_GUILD_ID).toBe("legacy-voice-guild");
    expect(config.VOICE_CHANNEL_ID).toBe("voice-channel");
  });

  it("uses explicit split text and voice config before legacy values", async () => {
    process.env = {
      ...originalEnv,
      DISCORD_TOKEN: "token",
      MONITOR_GUILD_ID: "legacy-text-guild",
      GUILD_ID: "legacy-voice-guild",
      TEXT_GUILD_ID: "text-guild",
      TEXT_CHANNEL_ID: "text-channel",
      VOICE_GUILD_ID: "voice-guild",
      VOICE_CHANNEL_ID: "voice-channel",
      NODE_ENV: "test",
    };

    const { loadConfig } = await import("../src/config");
    const config = loadConfig(process.env);

    expect(config.EFFECTIVE_TEXT_GUILD_ID).toBe("text-guild");
    expect(config.TEXT_CHANNEL_ID).toBe("text-channel");
    expect(config.EFFECTIVE_VOICE_GUILD_ID).toBe("voice-guild");
  });
});
