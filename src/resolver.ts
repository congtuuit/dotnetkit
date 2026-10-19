import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCacheDir, getRuntimeIdentifier } from "./utils/paths.js";
import { fileExists } from "./manifest.js";
import type { ChannelReleases, ReleasesIndex, ReleaseIndexChannel, ResolvedSdk, SdkFile } from "./types.js";

const RELEASES_INDEX_URL = "https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchWithCache(url: string, cacheFileName: string, forceRefresh = false): Promise<string> {
  const cacheDir = getCacheDir();
  await mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, cacheFileName);

  if (!forceRefresh && (await fileExists(cachePath))) {
    try {
      const stats = await import("node:fs/promises").then((fs) => fs.stat(cachePath));
      if (Date.now() - stats.mtimeMs < CACHE_TTL_MS) {
        return await readFile(cachePath, "utf8");
      }
    } catch {
      // Fallback fetch
    }
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "dotnetkit/0.1.0 (https://github.com/dotnetkit/dotnetkit)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch from ${url}: HTTP ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  await writeFile(cachePath, text, "utf8").catch(() => {});
  return text;
}

export async function getReleasesIndex(forceRefresh = false): Promise<ReleasesIndex> {
  const content = await fetchWithCache(RELEASES_INDEX_URL, "releases-index.json", forceRefresh);
  return JSON.parse(content) as ReleasesIndex;
}

export async function getChannelReleases(channelReleasesUrl: string, channelVersion: string, forceRefresh = false): Promise<ChannelReleases> {
  const safeName = `releases-${channelVersion.replace(/[^a-zA-Z0-9.-]/g, "_")}.json`;
  const content = await fetchWithCache(channelReleasesUrl, safeName, forceRefresh);
  return JSON.parse(content) as ChannelReleases;
}

/**
 * Phân giải input (lts, sts, latest, 8.0, 9.0, hoặc exact 8.0.100) thành thông tin download chính xác
 */
export async function resolveSdk(queryVersion: string, rid: string = getRuntimeIdentifier()): Promise<ResolvedSdk> {
  const index = await getReleasesIndex();
  const channels = index["releases-index"];

  let targetChannel: ReleaseIndexChannel | undefined;
  const normalized = queryVersion.trim().toLowerCase();

  if (normalized === "lts") {
    targetChannel = channels.find((c) => c["release-type"] === "lts" && (c["support-phase"] === "active" || c["support-phase"] === "maintenance"));
  } else if (normalized === "sts") {
    targetChannel = channels.find((c) => c["release-type"] === "sts" && c["support-phase"] === "active");
  } else if (normalized === "latest") {
    targetChannel = channels[0];
  } else if (normalized === "preview") {
    targetChannel = channels.find((c) => c["support-phase"] === "preview") || channels[0];
  } else {
    // Kiểm tra xem có khớp channel version như "8.0", "9.0", "10.0"
    targetChannel = channels.find((c) => c["channel-version"] === normalized);
    if (!targetChannel) {
      // Có thể là full version như "8.0.100" -> lấy tiền tố "8.0"
      const parts = normalized.split(".");
      if (parts.length >= 2) {
        const majorMinor = `${parts[0]}.${parts[1]}`;
        targetChannel = channels.find((c) => c["channel-version"] === majorMinor);
      }
    }
  }

  if (!targetChannel) {
    throw new Error(`Unable to find a valid .NET release channel for '${queryVersion}'.`);
  }

  const channelReleases = await getChannelReleases(targetChannel["releases.json"], targetChannel["channel-version"]);
  
  // Tìm release và SDK cụ thể
  let foundSdk: { version: string; files: SdkFile[] } | undefined;

  const isExact = /^\d+\.\d+\.\d+/.test(normalized);
  if (isExact) {
    // Duyệt qua các release để tìm đúng version
    for (const rel of channelReleases.releases) {
      if (rel.sdk?.version === queryVersion) {
        foundSdk = rel.sdk;
        break;
      }
      if (rel.sdks) {
        const matched = rel.sdks.find((s) => s.version === queryVersion);
        if (matched) {
          foundSdk = matched;
          break;
        }
      }
    }
  }

  // Nếu không chỉ định exact version hoặc không tìm thấy exact version, lấy bản mới nhất của channel
  if (!foundSdk) {
    const latestRel = channelReleases.releases[0];
    if (latestRel?.sdk) {
      foundSdk = latestRel.sdk;
    } else if (latestRel?.sdks && latestRel.sdks.length > 0) {
      foundSdk = latestRel.sdks[0];
    }
  }

  if (!foundSdk) {
    throw new Error(`Could not find an SDK release for '${queryVersion}' in channel ${targetChannel["channel-version"]}.`);
  }

  // Tìm file download cho RID
  // Ví dụ RID: win-x64, linux-x64, osx-arm64
  // Package formats: zip cho win, tar.gz cho linux/osx
  const preferredExt = rid.startsWith("win") ? ".zip" : ".tar.gz";
  let targetFile = foundSdk.files.find((f) => f.rid === rid && f.name.endsWith(preferredExt));
  if (!targetFile) {
    targetFile = foundSdk.files.find((f) => f.rid === rid);
  }

  return {
    channelVersion: targetChannel["channel-version"],
    version: foundSdk.version,
    releaseType: targetChannel["release-type"],
    supportPhase: targetChannel["support-phase"],
    downloadUrl: targetFile?.url,
    hash: targetFile?.hash,
    rid
  };
}
