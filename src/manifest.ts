import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { GlobalJson, Lockfile, Manifest } from "./types.js";

export const MANIFEST_FILENAME = "dotnetkit.json";
export const LOCKFILE_FILENAME = "dotnetkit.lock.json";
export const GLOBAL_JSON_FILENAME = "global.json";

export const defaultManifest: Manifest = {
  schemaVersion: 1,
  sdk: {
    version: "8.0.100",
    rollForward: "latestFeature",
    allowPrerelease: false
  },
  runtimes: [],
  workloads: [],
  tools: [],
  nuget: {
    sources: ["https://api.nuget.org/v3/index.json"]
  },
  tasks: {
    build: "dotnet build",
    test: "dotnet test"
  },
  policies: {
    autoInstall: false,
    network: "online",
    confirmation: true
  }
};

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tìm file (như dotnetkit.json, global.json) bắt đầu từ startDir ngược dần lên root
 */
export async function findUp(filename: string, startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = resolve(startDir);
  while (true) {
    const candidate = join(currentDir, filename);
    if (await fileExists(candidate)) {
      return candidate;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}

export async function loadManifest(cwd: string = process.cwd()): Promise<{ manifest: Manifest; sourceFile: string }> {
  const manifestPath = await findUp(MANIFEST_FILENAME, cwd);
  if (manifestPath) {
    const content = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(content) as Manifest;
    if (parsed.schemaVersion !== 1) {
      throw new Error(`Unsupported ${MANIFEST_FILENAME} schemaVersion: ${parsed.schemaVersion}`);
    }
    return { manifest: parsed, sourceFile: manifestPath };
  }

  // Fallback sang global.json nếu có
  const globalJsonPath = await findUp(GLOBAL_JSON_FILENAME, cwd);
  if (globalJsonPath) {
    const content = await readFile(globalJsonPath, "utf8");
    const globalJson = JSON.parse(content) as GlobalJson;
    const syntheticManifest: Manifest = {
      schemaVersion: 1,
      sdk: {
        version: globalJson.sdk?.version,
        rollForward: (globalJson.sdk?.rollForward as any) || "latestFeature",
        allowPrerelease: globalJson.sdk?.allowPrerelease ?? false
      },
      tasks: {
        build: "dotnet build",
        test: "dotnet test"
      }
    };
    return { manifest: syntheticManifest, sourceFile: globalJsonPath };
  }

  throw new Error(`Missing ${MANIFEST_FILENAME} or ${GLOBAL_JSON_FILENAME}. Run 'dotnetkit init' first.`);
}

export async function saveManifest(manifest: Manifest, targetPath: string = resolve(MANIFEST_FILENAME)): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function loadLockfile(cwd: string = process.cwd()): Promise<{ lockfile: Lockfile; filePath: string }> {
  const lockfilePath = await findUp(LOCKFILE_FILENAME, cwd);
  if (!lockfilePath) {
    throw new Error(`Missing ${LOCKFILE_FILENAME}; run 'dotnetkit lock' first.`);
  }
  const content = await readFile(lockfilePath, "utf8");
  return { lockfile: JSON.parse(content) as Lockfile, filePath: lockfilePath };
}

export async function saveLockfile(lockfile: Lockfile, targetPath: string = resolve(LOCKFILE_FILENAME)): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(lockfile, null, 2)}\n`, "utf8");
}
