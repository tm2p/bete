import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { AppError } from "../errors";
import type { ResolvedMediaSource } from "./mediaTypes";

export async function resolveMediaSource(
  input: string,
): Promise<ResolvedMediaSource> {
  const source = input.trim();
  if (!source) {
    throw new AppError("Media source is required", "MISSING_MEDIA_SOURCE", 400);
  }

  const urlSource = resolveUrlSource(source);
  if (urlSource) return urlSource;

  const localPath = path.resolve(source);
  if (existsSync(localPath) && statSync(localPath).isFile()) {
    return {
      source: localPath,
      title: path.basename(localPath),
      kind: "local",
    };
  }

  throw new AppError(
    "Media source must be an HTTP(S) URL or existing local file",
    "UNSUPPORTED_MEDIA_SOURCE",
    400,
  );
}

function resolveUrlSource(source: string): ResolvedMediaSource | null {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  return {
    source,
    title: titleFromUrl(url),
    kind: "url",
  };
}

function titleFromUrl(url: URL): string {
  const filename = decodeURIComponent(url.pathname.split("/").pop() || "");
  return path.basename(filename) || url.hostname;
}
