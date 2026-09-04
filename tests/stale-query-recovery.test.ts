// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  STALE_QUERY_FOREGROUND_THRESHOLD_MS,
  STALE_QUERY_RECOVERY_DEBOUNCE_MS,
  StaleQueryRecoveryCoordinator,
  isAllowlistedRecoveryQuery,
  recoverStaleActiveQueries,
  shouldRecoverQuery,
} from "../src/api/cache/stale-query-recovery";

const SERVER = "https://mirage.talk";
const OTHER_SERVER = "https://other.example";
const VIEWER = "0xabc";
const OTHER_VIEWER = "0xdef";
const root = ["server", SERVER] as const;
const viewer = ["viewer", VIEWER] as const;

function recoveryQuery(
  queryKey: readonly unknown[],
  overrides: Record<string, unknown> = {},
) {
  return {
    queryKey,
    isActive: true,
    isDisabled: false,
    isStale: true,
    fetchStatus: "idle",
    ...overrides,
  };
}

describe("stale query recovery transitions", () => {
  test("suppresses initial app and connectivity callbacks", () => {
    const passes: string[] = [];
    const coordinator = new StaleQueryRecoveryCoordinator({
      onRecovery: (reason) => passes.push(reason),
    });

    coordinator.handleAppState("active");
    coordinator.handleConnectivity(true);

    expect(passes).toEqual([]);
  });

  test("ignores short backgrounds and recovers after the threshold", () => {
    let now = 0;
    const passes: string[] = [];
    const coordinator = new StaleQueryRecoveryCoordinator({
      now: () => now,
      onRecovery: (reason) => passes.push(reason),
    });

    coordinator.handleAppState("active");
    coordinator.handleAppState("background");
    now = STALE_QUERY_FOREGROUND_THRESHOLD_MS - 1;
    coordinator.handleAppState("active");
    coordinator.handleAppState("background");
    now += STALE_QUERY_FOREGROUND_THRESHOLD_MS;
    coordinator.handleAppState("active");

    expect(passes).toEqual(["foreground"]);
  });

  test("recovers only on genuine disconnected-to-connected transitions", () => {
    const passes: string[] = [];
    const coordinator = new StaleQueryRecoveryCoordinator({
      onRecovery: (reason) => passes.push(reason),
    });

    coordinator.handleConnectivity(true);
    coordinator.handleConnectivity(true);
    coordinator.handleConnectivity(false);
    coordinator.handleConnectivity(false);
    coordinator.handleConnectivity(true);
    coordinator.handleConnectivity(true);

    expect(passes).toEqual(["reconnect"]);
  });

  test("debounces rapid reconnect flaps across transition types", () => {
    let now = 0;
    const passes: string[] = [];
    const coordinator = new StaleQueryRecoveryCoordinator({
      now: () => now,
      foregroundThresholdMs: 10,
      onRecovery: (reason) => passes.push(reason),
    });

    coordinator.handleAppState("active");
    coordinator.handleConnectivity(true);
    coordinator.handleConnectivity(false);
    coordinator.handleConnectivity(true);
    coordinator.handleAppState("background");
    now = 10;
    coordinator.handleAppState("active");
    coordinator.handleConnectivity(false);
    now = STALE_QUERY_RECOVERY_DEBOUNCE_MS;
    coordinator.handleConnectivity(true);

    expect(passes).toEqual(["reconnect", "reconnect"]);
  });

  test("issues one pass for each accepted transition", () => {
    let now = 0;
    const passes: string[] = [];
    const coordinator = new StaleQueryRecoveryCoordinator({
      now: () => now,
      foregroundThresholdMs: 10,
      debounceMs: 0,
      onRecovery: (reason) => passes.push(reason),
    });

    coordinator.handleAppState("active");
    coordinator.handleAppState("background");
    now = 10;
    coordinator.handleAppState("active");
    coordinator.handleAppState("active");
    coordinator.handleConnectivity(false);
    coordinator.handleConnectivity(true);
    coordinator.handleConnectivity(true);

    expect(passes).toEqual(["foreground", "reconnect"]);
  });
});

describe("stale query recovery selection", () => {
  const context = { serverIdentity: SERVER, viewerAddress: VIEWER };

  test("allowlists current-viewer posts, comments, detail, inbox, profile, follows, and search", () => {
    const keys = [
      [...root, "posts", ...viewer, {}],
      [...root, "comments", ...viewer, "post-1"],
      [...root, "inbox", VIEWER, "infinite", {}],
      [...root, "user", "status", VIEWER],
      [...root, "user", "profile", VIEWER],
      [...root, "user", "followed", VIEWER],
      [...root, "user", "blocked", VIEWER],
      [...root, "user", "posts", "0xowner", ...viewer, {}],
      [...root, "search", ...viewer, "mirage", undefined, 20, undefined],
    ];

    expect(keys.every((key) => isAllowlistedRecoveryQuery(key, context))).toBe(true);
  });

  test("excludes non-freshness families", () => {
    const keys = [
      [...root, "parameters", ...viewer],
      [...root, "config"],
      [...root, "topics", ...viewer, 20],
      [...root, "resolve", "address", "alice"],
      [...root, "stats", "network"],
      [...root, "tx", "hash"],
    ];

    expect(keys.every((key) => !isAllowlistedRecoveryQuery(key, context))).toBe(true);
  });

  test("requires active, enabled, stale, idle queries", () => {
    const key = [...root, "posts", ...viewer, {}];

    expect(shouldRecoverQuery(recoveryQuery(key), context)).toBe(true);
    expect(shouldRecoverQuery(recoveryQuery(key, { isActive: false }), context)).toBe(false);
    expect(shouldRecoverQuery(recoveryQuery(key, { isDisabled: true }), context)).toBe(false);
    expect(shouldRecoverQuery(recoveryQuery(key, { isStale: false }), context)).toBe(false);
    expect(shouldRecoverQuery(recoveryQuery(key, { fetchStatus: "fetching" }), context)).toBe(false);
    expect(shouldRecoverQuery(recoveryQuery(key, { fetchStatus: "paused" }), context)).toBe(false);
  });

  test("isolates server and outgoing viewer query keys", () => {
    expect(isAllowlistedRecoveryQuery(
      ["server", OTHER_SERVER, "posts", ...viewer, {}],
      context,
    )).toBe(false);
    expect(isAllowlistedRecoveryQuery(
      [...root, "posts", "viewer", OTHER_VIEWER, {}],
      context,
    )).toBe(false);
    expect(isAllowlistedRecoveryQuery(
      [...root, "inbox", OTHER_VIEWER, "infinite", {}],
      context,
    )).toBe(false);
    expect(isAllowlistedRecoveryQuery(
      [...root, "user", "posts", "0xowner", "viewer", OTHER_VIEWER, {}],
      context,
    )).toBe(false);
  });

  test("allows anonymous viewer families but never anonymous inbox/profile", () => {
    const anonymousContext = { serverIdentity: SERVER, viewerAddress: null };
    expect(isAllowlistedRecoveryQuery(
      [...root, "posts", "viewer", "anonymous", {}],
      anonymousContext,
    )).toBe(true);
    expect(isAllowlistedRecoveryQuery(
      [...root, "inbox", "anonymous", "infinite", {}],
      anonymousContext,
    )).toBe(false);
    expect(isAllowlistedRecoveryQuery(
      [...root, "user", "profile", "anonymous"],
      anonymousContext,
    )).toBe(false);
  });

  test("aborts selection when the server generation changes", async () => {
    let contextReads = 0;
    let selected = false;
    const query = {
      queryKey: [...root, "posts", ...viewer, {}],
      isActive: () => true,
      isDisabled: () => false,
      isStale: () => true,
      state: { fetchStatus: "idle" },
    };
    const queryClient = {
      invalidateQueries: async ({ predicate, refetchType }, options) => {
        selected = predicate(query);
        expect(refetchType).toBe("active");
        expect(options).toEqual({ cancelRefetch: false });
      },
    };

    await recoverStaleActiveQueries({
      queryClient,
      getViewerAddress: () => VIEWER,
      getServerContext: () => ({
        identity: SERVER,
        baseUrl: SERVER,
        generation: contextReads++ === 0 ? 4 : 5,
      }),
    });

    expect(selected).toBe(false);
  });
});
