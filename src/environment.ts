import path from "node:path";
import { isSdkInstalled } from "./installer.js";
import { loadLockfile, loadManifest } from "./manifest.js";
import { resolveSdk } from "./resolver.js";
import { getDotnetExecutable, getRuntimeIdentifier, getSdkPath } from "./utils/paths.js";

export interface SdkEnvironment {
  sdkVersion: string;
  sdkPath: string;
  dotnetExecutable: string;
  isInstalled: boolean;
  env: Record<string, string>;
}

export async function resolveCurrentSdk(): Promise<{ version: string; isFromLockfile: boolean }> {
  try {
    const { lockfile } = await loadLockfile();
    if (lockfile.sdk?.resolvedVersion) {
      return { version: lockfile.sdk.resolvedVersion, isFromLockfile: true };
    }
  } catch {
    // Không có lockfile -> dùng manifest
  }

  const { manifest } = await loadManifest();
  const requested = manifest.sdk?.version || "lts";
  const rid = getRuntimeIdentifier();
  const resolved = await resolveSdk(requested, rid);
  return { version: resolved.version, isFromLockfile: false };
}

export async function getSdkEnvironment(targetVersion?: string): Promise<SdkEnvironment> {
  let version = targetVersion;
  if (!version) {
    const current = await resolveCurrentSdk();
    version = current.version;
  }

  const sdkPath = getSdkPath(version);
  const dotnetExecutable = getDotnetExecutable(version);
  const installed = await isSdkInstalled(version);

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    DOTNET_ROOT: sdkPath,
    DOTNET_MULTILEVEL_LOOKUP: "0",
    PATH: `${sdkPath}${path.delimiter}${process.env.PATH || ""}`
  };

  return {
    sdkVersion: version,
    sdkPath,
    dotnetExecutable,
    isInstalled: installed,
    env
  };
}
