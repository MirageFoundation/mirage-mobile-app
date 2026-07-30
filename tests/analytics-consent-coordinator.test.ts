// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  AnalyticsConsentCoordinator,
  type AnalyticsSdk,
} from "../src/services/analytics-consent-coordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createSdk(overrides: Partial<AnalyticsSdk> = {}) {
  const calls: string[] = [];
  const sdk: AnalyticsSdk = {
    init: async () => {
      calls.push("init");
    },
    optInTracking: async () => {
      calls.push("opt-in");
    },
    optOutTracking: async () => {
      calls.push("opt-out");
    },
    reset: async () => {
      calls.push("reset");
    },
    registerSuperProperties: () => calls.push("register"),
    identify: async () => {
      calls.push("identify");
    },
    getPeople: () => ({
      set: () => calls.push("people-set"),
    }),
    track: (event) => calls.push(`track:${event}`),
    flush: () => calls.push("flush"),
    ...overrides,
  };
  return { sdk, calls };
}

describe("analytics consent coordinator", () => {
  test("invalidates delayed initialization on immediate opt-out", async () => {
    const initGate = deferred<void>();
    const { sdk, calls } = createSdk({
      init: async () => {
        calls.push("init");
        await initGate.promise;
      },
    });
    const coordinator = new AnalyticsConsentCoordinator(
      () => sdk,
      { platform: "ios" },
    );

    const enabling = coordinator.enable();
    const disabling = coordinator.disable();
    expect(coordinator.isActive()).toBe(false);

    initGate.resolve();
    await Promise.all([enabling, disabling]);

    expect(coordinator.isActive()).toBe(false);
    expect(calls).toEqual(["init", "opt-out", "reset"]);
  });

  test("serializes overlapping opt-ins into one SDK instance", async () => {
    const initGate = deferred<void>();
    let instances = 0;
    const { sdk, calls } = createSdk({
      init: async () => {
        calls.push("init");
        await initGate.promise;
      },
    });
    const coordinator = new AnalyticsConsentCoordinator(() => {
      instances += 1;
      return sdk;
    }, {});

    const first = coordinator.enable();
    const second = coordinator.enable();
    initGate.resolve();
    await Promise.all([first, second]);

    expect(instances).toBe(1);
    expect(calls).toEqual(["init", "opt-in", "register"]);
    expect(coordinator.isActive()).toBe(true);
  });

  test("revocation during identify blocks the queued profile update", async () => {
    const identifyGate = deferred<void>();
    const { sdk, calls } = createSdk({
      identify: async () => {
        calls.push("identify");
        await identifyGate.promise;
      },
    });
    const coordinator = new AnalyticsConsentCoordinator(() => sdk, {});
    await coordinator.enable();

    const identifying = coordinator.identify("wallet-a", { tier: "1" });
    const disabling = coordinator.disable();
    identifyGate.resolve();
    await Promise.all([identifying, disabling]);

    expect(calls).toContain("identify");
    expect(calls).not.toContain("people-set");
    coordinator.track("post_created");
    expect(calls).not.toContain("track:post_created");
  });

  test("revocation triggered during track disposes and blocks later events", async () => {
    let coordinator!: AnalyticsConsentCoordinator;
    let disabling: Promise<void> | undefined;
    const { sdk, calls } = createSdk({
      track: (event) => {
        calls.push(`track:${event}`);
        disabling = coordinator.disable();
      },
    });
    coordinator = new AnalyticsConsentCoordinator(() => sdk, {});
    await coordinator.enable();

    coordinator.track("vote_cast");
    await disabling;
    coordinator.track("comment_posted");

    expect(calls).toContain("track:vote_cast");
    expect(calls).not.toContain("track:comment_posted");
    expect(calls.slice(-2)).toEqual(["opt-out", "reset"]);
  });

  test("disposes a stale instance before allowing a fresh later opt-in", async () => {
    const staleInit = deferred<void>();
    const stale = createSdk({
      init: async () => {
        stale.calls.push("init");
        await staleInit.promise;
      },
    });
    const fresh = createSdk();
    const instances = [stale.sdk, fresh.sdk];
    const coordinator = new AnalyticsConsentCoordinator(
      () => instances.shift()!,
      { app_version: "1.0.0" },
    );

    const staleEnable = coordinator.enable();
    await coordinator.disable();
    staleInit.resolve();
    await staleEnable;

    const freshEnable = await coordinator.enable();
    coordinator.track("app_opened");

    expect(stale.calls).toEqual(["init", "opt-out", "reset"]);
    expect(freshEnable).toBe(true);
    expect(fresh.calls).toEqual([
      "init",
      "opt-in",
      "register",
      "track:app_opened",
    ]);
  });
});
