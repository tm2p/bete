import { getPersistedValue, setPersistedValue } from "../muxer-queue";

export interface MediaSettings {
  musicVolume: number;
}

export const defaultMediaSettings: MediaSettings = {
  musicVolume: 1,
};

export async function initializeMediaSettings(): Promise<MediaSettings> {
  const stored = await getPersistedValue(
    "media-settings",
    defaultMediaSettings,
  );
  return {
    ...defaultMediaSettings,
    ...(stored as MediaSettings),
  };
}

export async function persistMediaSettings(
  settings: MediaSettings,
): Promise<void> {
  await setPersistedValue("media-settings", settings);
}
