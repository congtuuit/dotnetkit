#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import {
  defaultManifest,
  fileExists,
  loadLockfile,
  loadManifest,
  MANIFEST_FILENAME,
  saveLockfile,
  saveManifest
} from "./manifest.js";
import { getReleasesIndex, resolveSdk } from "./resolver.js";
import { installSdk, isSdkInstalled } from "./installer.js";
import { getSdkEnvironment } from "./environment.js";
import { getDotnetExecutable, getDotnetkitHome, getRuntimeIdentifier, getSdksDir } from "./utils/paths.js";
import type { Lockfile, Manifest } from "./types.js";

function usage(): void {
  console.log(`dotnetkit - reproducible .NET toolchain manager

Usage:
  dotnetkit init [--force]
  dotnetkit doctor [--json]
  dotnetkit list [--channels]
  dotnetkit which
  dotnetkit use <channel|version>
  dotnetkit install [channel|version] [--dry-run] [--locked] [--force]
  dotnetkit lock
  dotnetkit run <task> [-- args...]
  dotnetkit exec <command> [args...]
  dotnetkit export [--json]
`);
}

async function init(force: boolean): Promise<void> {
  const exists = await fileExists(MANIFEST_FILENAME);
  if (exists && !force) {
    throw new Error(`${MANIFEST_FILENAME} already exists; use --force to overwrite.`);
  }
  await saveManifest(defaultManifest);
  console.log(`Created ${MANIFEST_FILENAME}. Review the SDK version before installing.`);
}

async function dotnetInfo(): Promise<{ installed: boolean; version?: string; error?: string }> {
  return new Promise((done) => {
    const child = spawn("dotnet", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.once("error", (error) => done({ installed: false, error: error.message }));
    child.once("close", (code) =>
      code === 0
        ? done({ installed: true, version: stdout.trim() })
        : done({ installed: false, error: stderr.trim() || `dotnet exited with code ${code}` })
    );
  });
}

async function doctor(json: boolean): Promise<void> {
  const { manifest, sourceFile } = await loadManifest();
  const info = await dotnetInfo();
  const rid = getRuntimeIdentifier();

  let resolvedSdkInfo: any = null;
  const targetVersion = manifest.sdk?.version ?? "lts";
  try {
    resolvedSdkInfo = await resolveSdk(targetVersion, rid);
  } catch (err) {
    resolvedSdkInfo = { error: err instanceof Error ? err.message : String(err) };
  }

  const result = {
    source: sourceFile,
    platform: { os: process.platform, architecture: process.arch, rid },
    dotnetkitHome: getDotnetkitHome(),
    systemSdk: info.installed ? { version: info.version } : { error: info.error },
    manifestSdk: {
      requested: targetVersion,
      resolvedVersion: resolvedSdkInfo?.version,
      releaseType: resolvedSdkInfo?.releaseType,
      supportPhase: resolvedSdkInfo?.supportPhase,
      installedInDotnetkit: resolvedSdkInfo?.version ? await isSdkInstalled(resolvedSdkInfo.version) : false
    },
    status: info.installed ? "ok" : "warning"
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Configuration: ${result.source}`);
    console.log(`Platform:      ${result.platform.os}/${result.platform.architecture} (${result.platform.rid})`);
    console.log(`Dotnetkit dir: ${result.dotnetkitHome}`);
    console.log(`System .NET:   ${info.installed ? result.systemSdk.version : `Not detected (${info.error})`}`);
    console.log(`Requested SDK: ${result.manifestSdk.requested}`);
    if (resolvedSdkInfo?.version) {
      const statusText = result.manifestSdk.installedInDotnetkit ? "[installed in dotnetkit]" : "[not installed in dotnetkit]";
      console.log(`Resolved SDK:  ${resolvedSdkInfo.version} (${resolvedSdkInfo.releaseType?.toUpperCase()}) ${statusText}`);
    } else if (resolvedSdkInfo?.error) {
      console.log(`Resolver:      ${resolvedSdkInfo.error}`);
    }
  }
}

async function which(): Promise<void> {
  const sdkEnv = await getSdkEnvironment();
  console.log(`Target SDK:  ${sdkEnv.sdkVersion}`);
  if (sdkEnv.isInstalled) {
    console.log(`Executable:  ${sdkEnv.dotnetExecutable}`);
    console.log(`Status:      Active in dotnetkit`);
  } else {
    console.log(`Executable:  ${sdkEnv.dotnetExecutable} (Not downloaded yet)`);
    console.log(`Status:      Run 'dotnetkit install' to download this version.`);
  }
}

async function use(versionOrChannel?: string): Promise<void> {
  if (!versionOrChannel) {
    throw new Error("Usage: dotnetkit use <channel|version>");
  }
  const { manifest, sourceFile } = await loadManifest();
  const rid = getRuntimeIdentifier();
  const resolved = await resolveSdk(versionOrChannel, rid);

  if (!manifest.sdk) manifest.sdk = {};
  manifest.sdk.version = resolved.version;

  await saveManifest(manifest, sourceFile);
  console.log(`Updated SDK requirement to '${resolved.version}' in ${sourceFile}.`);
  const isInstalled = await isSdkInstalled(resolved.version);
  if (!isInstalled) {
    console.log(`Run 'dotnetkit install' to install ${resolved.version} locally.`);
  } else {
    console.log(`SDK ${resolved.version} is already installed and ready.`);
  }
}

async function listInstalledSdks(): Promise<string[]> {
  try {
    const sdksDir = getSdksDir();
    const entries = await readdir(sdksDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function list(showChannels = false): Promise<void> {
  console.log("Installed .NET SDKs in dotnetkit:");
  const installed = await listInstalledSdks();
  if (installed.length === 0) {
    console.log("  (None installed yet. Run 'dotnetkit install <version>')");
  } else {
    for (const sdk of installed) {
      console.log(`  - ${sdk}`);
    }
  }

  console.log("\nAvailable Official .NET Channels (via Microsoft API):");
  try {
    const index = await getReleasesIndex();
    for (const ch of index["releases-index"]) {
      const isLts = ch["release-type"] === "lts" ? "[LTS]" : "[STS]";
      console.log(`  - ${ch["channel-version"].padEnd(6)} ${isLts.padEnd(6)} Latest SDK: ${ch["latest-sdk"].padEnd(12)} (Status: ${ch["support-phase"]})`);
    }
  } catch (err) {
    console.log(`  (Could not query remote channels: ${err instanceof Error ? err.message : String(err)})`);
  }
}

async function lock(): Promise<void> {
  const { manifest } = await loadManifest();
  const rid = getRuntimeIdentifier();
  const requested = manifest.sdk?.version ?? "lts";

  console.log(`Resolving SDK metadata for '${requested}'...`);
  const resolved = await resolveSdk(requested, rid);

  const lockContent: Lockfile = {
    lockfileVersion: 1,
    generatedBy: "dotnetkit@0.1.0",
    platform: { os: process.platform, architecture: process.arch },
    sdk: {
      version: manifest.sdk?.version,
      rollForward: manifest.sdk?.rollForward,
      allowPrerelease: manifest.sdk?.allowPrerelease,
      resolvedVersion: resolved.version,
      downloadUrl: resolved.downloadUrl,
      sha512: resolved.hash
    },
    runtimes: manifest.runtimes ?? [],
    workloads: manifest.workloads ?? [],
    tools: manifest.tools ?? []
  };

  await saveLockfile(lockContent);
  console.log(`Created dotnetkit.lock.json (Resolved SDK: ${resolved.version}, Checksum: ${resolved.hash ? resolved.hash.substring(0, 16) + "..." : "n/a"}).`);
}

async function install(versionArg?: string, dryRun = false, locked = false, force = false): Promise<void> {
  await installSdk({
    versionOrChannel: versionArg,
    dryRun,
    locked,
    force
  });
}

async function runTask(task: string, args: string[]): Promise<void> {
  const { manifest } = await loadManifest();
  const command = manifest.tasks?.[task];
  if (!command) throw new Error(`Unknown task '${task}'.`);
  const [executable, ...commandArgs] = command.split(/\s+/);

  const sdkEnv = await getSdkEnvironment();
  if (!sdkEnv.isInstalled) {
    console.warn(`[dotnetkit] Note: SDK ${sdkEnv.sdkVersion} is not installed locally. Using system fallback if available.`);
  }

  // Nếu executable là 'dotnet' và SDK đã cài, dùng binary của dotnetkit
  const runExecutable = (executable === "dotnet" && sdkEnv.isInstalled)
    ? sdkEnv.dotnetExecutable
    : executable;

  const child = spawn(runExecutable, [...commandArgs, ...args], {
    stdio: "inherit",
    shell: false,
    env: sdkEnv.env
  });
  child.once("close", (code) => { process.exitCode = code ?? 1; });
}

async function execCommand(executable: string, commandArgs: string[]): Promise<void> {
  const sdkEnv = await getSdkEnvironment();
  const runExecutable = (executable === "dotnet" && sdkEnv.isInstalled)
    ? sdkEnv.dotnetExecutable
    : executable;

  const child = spawn(runExecutable, commandArgs, {
    stdio: "inherit",
    shell: false,
    env: sdkEnv.env
  });
  child.once("close", (code) => { process.exitCode = code ?? 1; });
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;
  switch (command) {
    case "init":
      return init(args.includes("--force"));
    case "doctor":
      return doctor(args.includes("--json"));
    case "which":
      return which();
    case "use":
      return use(args[0]);
    case "list":
      return list(args.includes("--channels"));
    case "install": {
      const dryRun = args.includes("--dry-run");
      const locked = args.includes("--locked");
      const force = args.includes("--force");
      const versionArg = args.find((a) => !a.startsWith("--"));
      return install(versionArg, dryRun, locked, force);
    }
    case "lock":
      return lock();
    case "run": {
      const task = args[0];
      if (!task) throw new Error("Usage: dotnetkit run <task> [-- args...]");
      return runTask(task, args.slice(1).filter((arg) => arg !== "--"));
    }
    case "exec": {
      const [executable, ...commandArgs] = args;
      if (!executable) throw new Error("Usage: dotnetkit exec <command> [args...]");
      return execCommand(executable, commandArgs);
    }
    case "export":
      return doctor(args.includes("--json"));
    case "--help":
    case "-h":
    case undefined:
      return usage();
    default:
      throw new Error(`Unknown command '${command}'.`);
  }
}

main().catch((error: unknown) => {
  console.error(`dotnetkit: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
