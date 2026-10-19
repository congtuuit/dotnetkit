import test from "node:test";
import assert from "node:assert/strict";
import { isSdkInstalled } from "../installer.js";
import { getSdkPath } from "../utils/paths.js";

test("isSdkInstalled returns false for uninstalled dummy version", async () => {
  const installed = await isSdkInstalled("0.0.0-dummy");
  assert.equal(installed, false);
});

test("getSdkPath creates expected format", () => {
  const p = getSdkPath("8.0.100");
  assert.ok(p.endsWith("8.0.100"));
});
