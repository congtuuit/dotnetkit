import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileExists, loadLockfile, loadManifest } from "./manifest.js";
import { resolveSdk } from "./resolver.js";
import { getDotnetExecutable, getDotnetkitHome, getRuntimeIdentifier, getSdkPath, getSdksDir } from "./utils/paths.js";
import type { ResolvedSdk } from "./types.js";

export async function isSdkInstalled(version: string): Promise<boolean> {
  const binary = getDotnetExecutable(version);
  return await fileExists(binary);
}

export async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  return new Promise((resolvePromise, reject) => {
    // bsdtar (có sẵn trên Win10+, Linux, macOS) giải nén cả .zip và .tar.gz
    const child = spawn("tar", ["-xf", archivePath, "-C", destDir], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (err) => reject(new Error(`Failed to run tar: ${err.message}`)));
    child.once("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Extraction failed (tar exited with code ${code}): ${stderr.trim()}`));
      }
    });
  });
}

export async function downloadWithProgress(
  url: string,
  destPath: string,
  expectedHash?: string
): Promise<void> {
  await mkdir(path.dirname(destPath), { recursive: true });

  const response = await fetch(url, {
    headers: {
      "User-Agent": "dotnetkit/0.1.0"
    }
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download from ${url}: HTTP ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get("content-length")) || 0;
  const hash = createHash("sha512");
  let downloadedBytes = 0;
  let lastReportTime = 0;

  const fileStream = createWriteStream(destPath);
  const nodeReadable = Readable.fromWeb(response.body as any);

  nodeReadable.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    downloadedBytes += chunk.length;

    const now = Date.now();
    if (now - lastReportTime > 200 || downloadedBytes === contentLength) {
      lastReportTime = now;
      const mbDownloaded = (downloadedBytes / (1024 * 1024)).toFixed(1);
      if (contentLength > 0) {
        const mbTotal = (contentLength / (1024 * 1024)).toFixed(1);
        const percent = Math.min(100, Math.round((downloadedBytes / contentLength) * 100));
        process.stdout.write(`\rDownloading: ${mbDownloaded}MB / ${mbTotal}MB (${percent}%)   `);
      } else {
        process.stdout.write(`\rDownloading: ${mbDownloaded}MB   `);
      }
    }
  });

  await pipeline(nodeReadable, fileStream);
  process.stdout.write("\n");

  const calculatedHash = hash.digest("hex");
  if (expectedHash && calculatedHash.toLowerCase() !== expectedHash.toLowerCase()) {
    await rm(destPath, { force: true }).catch(() => {});
    throw new Error(
      `SHA-512 checksum mismatch!\nExpected:   ${expectedHash}\nCalculated: ${calculatedHash}`
    );
  }
}

export interface InstallOptions {
  versionOrChannel?: string;
  dryRun?: boolean;
  locked?: boolean;
  force?: boolean;
}

export interface InstallResult {
  version: string;
  installPath: string;
  wasAlreadyInstalled: boolean;
}

export async function installSdk(options: InstallOptions = {}): Promise<InstallResult> {
  const { manifest } = await loadManifest();
  const rid = getRuntimeIdentifier();

  let targetVersion = options.versionOrChannel || manifest.sdk?.version || "lts";
  let downloadUrl: string | undefined;
  let expectedHash: string | undefined;

  if (options.locked) {
    const { lockfile } = await loadLockfile();
    if (!lockfile.sdk?.resolvedVersion) {
      throw new Error("Lockfile is missing resolved SDK information. Run 'dotnetkit lock' first.");
    }
    targetVersion = lockfile.sdk.resolvedVersion;
    downloadUrl = lockfile.sdk.downloadUrl;
    expectedHash = lockfile.sdk.sha512;
  } else {
    const resolved = await resolveSdk(targetVersion, rid);
    targetVersion = resolved.version;
    downloadUrl = resolved.downloadUrl;
    expectedHash = resolved.hash;
  }

  const installPath = getSdkPath(targetVersion);

  if (options.dryRun) {
    console.log("Install plan (dry-run):");
    console.log(`  - .NET SDK:   ${targetVersion} (${rid})`);
    console.log(`  - Source URL: ${downloadUrl ?? "(pending)"}`);
    console.log(`  - SHA-512:    ${expectedHash ? expectedHash.substring(0, 16) + "..." : "(pending)"}`);
    console.log(`  - Target Dir: ${installPath}`);
    return { version: targetVersion, installPath, wasAlreadyInstalled: false };
  }

  const alreadyInstalled = await isSdkInstalled(targetVersion);
  if (alreadyInstalled && !options.force) {
    console.log(`.NET SDK ${targetVersion} is already installed at: ${installPath}`);
    return { version: targetVersion, installPath, wasAlreadyInstalled: true };
  }

  if (!downloadUrl) {
    throw new Error(`No download URL available for .NET SDK ${targetVersion} on ${rid}.`);
  }

  console.log(`Installing .NET SDK ${targetVersion} (${rid})...`);
  console.log(`Source: ${downloadUrl}`);

  const tempDownloadsDir = path.join(getDotnetkitHome(), "downloads");
  await mkdir(tempDownloadsDir, { recursive: true });
  const archiveExt = downloadUrl.endsWith(".zip") ? ".zip" : ".tar.gz";
  const archivePath = path.join(tempDownloadsDir, `dotnet-sdk-${targetVersion}-${rid}${archiveExt}`);

  const tempExtractDir = path.join(getSdksDir(), `.tmp-${targetVersion}-${Date.now()}`);

  try {
    // 1. Download
    await downloadWithProgress(downloadUrl, archivePath, expectedHash);
    console.log("Checksum verified (SHA-512 matches).");

    // 2. Extract
    console.log(`Extracting to ${installPath}...`);
    await extractArchive(archivePath, tempExtractDir);

    // 3. Atomic finalize
    if (await fileExists(installPath)) {
      await rm(installPath, { recursive: true, force: true });
    }
    await mkdir(getSdksDir(), { recursive: true });
    await rename(tempExtractDir, installPath);

    console.log(`Successfully installed .NET SDK ${targetVersion}!`);
    console.log(`Executable: ${getDotnetExecutable(targetVersion)}`);

    return { version: targetVersion, installPath, wasAlreadyInstalled: false };
  } finally {
    // Dọn dẹp archive và temp dir
    await rm(archivePath, { force: true }).catch(() => {});
    await rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
  }
}
