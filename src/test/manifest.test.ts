import test from "node:test";
import assert from "node:assert/strict";
import { findUp, loadManifest, MANIFEST_FILENAME } from "../manifest.js";
import { getRuntimeIdentifier, getSdksDir } from "../utils/paths.js";

test("getRuntimeIdentifier returns valid RID format", () => {
  const rid = getRuntimeIdentifier();
  assert.match(rid, /^(win|linux|osx)-(x64|arm64|x86|arm)$/);
});

test("getSdksDir returns valid path", () => {
  const dir = getSdksDir();
  assert.ok(dir.includes(".dotnetkit"));
  assert.ok(dir.includes("sdks"));
});

test("findUp locates dotnetkit.json in project root", async () => {
  const found = await findUp(MANIFEST_FILENAME);
  assert.ok(found !== null);
  assert.ok(found.endsWith("dotnetkit.json"));
});

test("loadManifest successfully loads dotnetkit.json", async () => {
  const { manifest, sourceFile } = await loadManifest();
  assert.equal(manifest.schemaVersion, 1);
  assert.ok(sourceFile.endsWith("dotnetkit.json"));
  assert.ok(manifest.tasks?.build !== undefined);
});
