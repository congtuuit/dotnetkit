import test from "node:test";
import assert from "node:assert/strict";
import { getSdkEnvironment, resolveCurrentSdk } from "../environment.js";

test("resolveCurrentSdk resolves a valid version", async () => {
  const current = await resolveCurrentSdk();
  assert.ok(current.version.length > 0);
});

test("getSdkEnvironment produces DOTNET_ROOT and modified PATH", async () => {
  const envInfo = await getSdkEnvironment("8.0.100");
  assert.equal(envInfo.sdkVersion, "8.0.100");
  assert.ok(envInfo.env.DOTNET_ROOT !== undefined);
  assert.ok(envInfo.env.DOTNET_ROOT.includes("8.0.100"));
  assert.equal(envInfo.env.DOTNET_MULTILEVEL_LOOKUP, "0");
  assert.ok(envInfo.env.PATH.startsWith(envInfo.sdkPath));
});
