import os from "node:os";
import path from "node:path";

export function getDotnetkitHome(): string {
  if (process.env.DOTNETKIT_HOME) {
    return path.resolve(process.env.DOTNETKIT_HOME);
  }
  return path.join(os.homedir(), ".dotnetkit");
}

export function getSdksDir(): string {
  return path.join(getDotnetkitHome(), "sdks");
}

export function getSdkPath(version: string): string {
  return path.join(getSdksDir(), version);
}

export function getDotnetExecutable(sdkVersion: string): string {
  const binary = process.platform === "win32" ? "dotnet.exe" : "dotnet";
  return path.join(getSdkPath(sdkVersion), binary);
}

export function getCacheDir(): string {
  return path.join(getDotnetkitHome(), "cache");
}

export function getRuntimeIdentifier(): string {
  const platform = process.platform;
  const arch = process.arch;

  let osPart = "linux";
  if (platform === "win32") osPart = "win";
  else if (platform === "darwin") osPart = "osx";

  let archPart = "x64";
  if (arch === "arm64") archPart = "arm64";
  else if (arch === "ia32") archPart = "x86";
  else if (arch === "arm") archPart = "arm";

  return `${osPart}-${archPart}`;
}
