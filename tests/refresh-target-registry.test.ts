// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { RefreshTargetRegistry } from "../src/providers/refresh-target-registry";

describe("refresh target registry", () => {
  test("keeps simultaneously mounted target keys isolated", async () => {
    const registry = new RefreshTargetRegistry();
    const calls: string[] = [];
    registry.register("home", () => calls.push("home"));
    registry.register("following", () => calls.push("following"));

    await registry.invoke("following");
    await registry.invoke("home");

    expect(calls).toEqual(["following", "home"]);
  });

  test("uses the latest registration for a key", async () => {
    const registry = new RefreshTargetRegistry();
    const calls: string[] = [];
    registry.register("home", () => calls.push("old"));
    registry.register("home", () => calls.push("latest"));

    await registry.invoke("home");

    expect(calls).toEqual(["latest"]);
  });

  test("old cleanup cannot unregister a replacement", async () => {
    const registry = new RefreshTargetRegistry();
    const calls: string[] = [];
    const cleanupOld = registry.register("profile", () => calls.push("old"));
    registry.register("profile", () => calls.push("latest"));

    cleanupOld();
    await registry.invoke("profile");

    expect(calls).toEqual(["latest"]);
  });

  test("cleanup removes its current registration without stale invocation", async () => {
    const registry = new RefreshTargetRegistry();
    const calls: string[] = [];
    const cleanup = registry.register("home", () => calls.push("home"));

    cleanup();
    await registry.invoke("home");

    expect(calls).toEqual([]);
  });

  test("missing targets are a no-op", async () => {
    const registry = new RefreshTargetRegistry();

    await expect(registry.invoke("following")).resolves.toBeUndefined();
  });

  test("awaits async callbacks and delegates failures", async () => {
    const registry = new RefreshTargetRegistry();
    let completed = false;
    registry.register("home", async () => {
      await Promise.resolve();
      completed = true;
    });

    await registry.invoke("home");
    expect(completed).toBe(true);

    const error = new Error("refresh failed");
    registry.register("home", async () => {
      throw error;
    });
    await expect(registry.invoke("home")).rejects.toBe(error);
  });
});
