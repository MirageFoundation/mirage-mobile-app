// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { AccountDeletionCompletionCoordinator } from "../src/services/account-deletion-completion";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function dependencies(overrides = {}) {
  return {
    requestDeletion: async () => {},
    logout: async () => {},
    ensureLoggedOut: () => {},
    onCompleted: () => {},
    ...overrides,
  };
}

describe("account deletion completion coordinator", () => {
  test("awaits request, success delay, logout, and navigation in order", async () => {
    const coordinator = new AccountDeletionCompletionCoordinator();
    const calls: string[] = [];

    const result = await coordinator.run(
      dependencies({
        requestDeletion: async () => calls.push("request"),
        successDelayMs: 1,
        logout: async () => calls.push("logout"),
        onCompleted: () => calls.push("navigate"),
      }),
    );

    expect(result).toEqual({ status: "completed" });
    expect(calls).toEqual(["request", "logout", "navigate"]);
  });

  test("cancels the tracked delay on unmount without logging out or navigating", async () => {
    const coordinator = new AccountDeletionCompletionCoordinator();
    const calls: string[] = [];
    const completion = coordinator.run(
      dependencies({
        requestDeletion: async () => calls.push("request"),
        successDelayMs: 60_000,
        logout: async () => calls.push("logout"),
        onCompleted: () => calls.push("navigate"),
      }),
    );
    await Promise.resolve();

    coordinator.cancel();

    expect(await completion).toEqual({ status: "cancelled" });
    expect(calls).toEqual(["request"]);
  });

  test("deduplicates submissions while the deletion request is active", async () => {
    const coordinator = new AccountDeletionCompletionCoordinator();
    const request = deferred<void>();
    let requestCount = 0;
    const deps = dependencies({
      requestDeletion: async () => {
        requestCount += 1;
        await request.promise;
      },
    });

    const first = coordinator.run(deps);
    const second = coordinator.run(deps);
    expect(second).toBe(first);
    expect(requestCount).toBe(1);

    request.resolve();
    expect(await first).toEqual({ status: "completed" });
  });

  test("forces deterministic local logout and suppresses navigation on logout failure", async () => {
    const coordinator = new AccountDeletionCompletionCoordinator();
    const cleanupError = new Error("keychain unavailable");
    const calls: string[] = [];

    const result = await coordinator.run(
      dependencies({
        requestDeletion: async () => calls.push("request"),
        logout: async () => {
          calls.push("logout");
          throw cleanupError;
        },
        ensureLoggedOut: () => calls.push("fallback"),
        onCompleted: () => calls.push("navigate"),
      }),
    );

    expect(result).toEqual({ status: "logout_failed", error: cleanupError });
    expect(calls).toEqual(["request", "logout", "fallback"]);
  });

  test("does not navigate when completion becomes stale during logout", async () => {
    const coordinator = new AccountDeletionCompletionCoordinator();
    const logout = deferred<void>();
    const calls: string[] = [];
    const completion = coordinator.run(
      dependencies({
        requestDeletion: async () => calls.push("request"),
        logout: async () => {
          calls.push("logout");
          await logout.promise;
        },
        onCompleted: () => calls.push("navigate"),
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    coordinator.cancel();
    logout.resolve();

    expect(await completion).toEqual({ status: "cancelled" });
    expect(calls).toEqual(["request", "logout"]);
  });
});
