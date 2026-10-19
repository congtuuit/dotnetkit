import test from "node:test";
import assert from "node:assert/strict";
import { resolveSdk } from "../resolver.js";

test("resolveSdk resolves 'lts' to a valid .NET LTS version", async () => {
  const result = await resolveSdk("lts", "win-x64");
  assert.equal(result.releaseType, "lts");
  assert.ok(result.version.length > 0);
  assert.ok(result.downloadUrl !== undefined);
  assert.ok(result.downloadUrl?.includes("dotnet"));
  assert.ok(result.hash !== undefined);
});

test("resolveSdk resolves '8.0' major channel", async () => {
  const result = await resolveSdk("8.0", "win-x64");
  assert.equal(result.channelVersion, "8.0");
  assert.ok(result.version.startsWith("8.0."));
  assert.ok(result.downloadUrl !== undefined);
});
