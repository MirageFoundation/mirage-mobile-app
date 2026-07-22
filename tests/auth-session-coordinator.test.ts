// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { AuthSessionCoordinator } from "../src/services/auth-session-coordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("auth session generation coordinator", () => {
  test("rejects delayed startup work after logout", async () => {
    const coordinator = new AuthSessionCoordinator();
    const startup = coordinator.begin("wallet-a");
    const response = deferred<string>();
    const writes: string[] = [];
    const work = response.promise.then((value) =>
      coordinator.runIfCurrent(startup, () => writes.push(value)),
    );

    coordinator.begin(null);
    response.resolve("startup-profile");
    await work;

    expect(writes).toEqual([]);
  });

  test("rejects old-wallet bootstrap after replacement", async () => {
    const coordinator = new AuthSessionCoordinator();
    const oldWallet = coordinator.begin(" WALLET-A ");
    const replacement = coordinator.begin("wallet-b");

    expect(coordinator.matches(oldWallet, "wallet-a")).toBe(false);
    expect(coordinator.matches(replacement, " WALLET-B ")).toBe(true);
  });

  test("serializes overlapping imports so the latest invocation wins", async () => {
    const coordinator = new AuthSessionCoordinator();
    const order: string[] = [];
    const firstGate = deferred<void>();

    const firstSession = coordinator.begin(null);
    const first = coordinator.enqueueIdentityMutation(async () => {
      await firstGate.promise;
      order.push("wallet-a");
    });
    const latestSession = coordinator.begin(null);
    const latest = coordinator.enqueueIdentityMutation(async () => {
      order.push("wallet-b");
    });

    firstGate.resolve();
    await Promise.all([first, latest]);

    expect(order).toEqual(["wallet-a", "wallet-b"]);
    expect(coordinator.isCurrent(firstSession)).toBe(false);
    expect(coordinator.isCurrent(latestSession)).toBe(true);
  });

  test("blocks stale profile, tier, and username results", () => {
    const coordinator = new AuthSessionCoordinator();
    const walletA = coordinator.begin("wallet-a");
    const updates: string[] = [];
    coordinator.begin("wallet-b");

    coordinator.runIfCurrent(walletA, () => updates.push("profile"));
    coordinator.runIfCurrent(walletA, () => updates.push("tier"));
    coordinator.runIfCurrent(walletA, () => updates.push("username"));

    expect(updates).toEqual([]);
  });

  test("blocks stale analytics and cache side effects", async () => {
    const coordinator = new AuthSessionCoordinator();
    const importSession = coordinator.begin("wallet-a");
    const result = deferred<void>();
    const effects: string[] = [];
    const work = result.promise.then(() => {
      coordinator.runIfCurrent(importSession, () => effects.push("analytics"));
      coordinator.runIfCurrent(importSession, () => effects.push("cache"));
    });

    coordinator.begin(null);
    result.resolve();
    await work;

    expect(effects).toEqual([]);
  });
});
