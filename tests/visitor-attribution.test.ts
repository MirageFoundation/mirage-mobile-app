// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: () => () => {},
    fetch: async () => ({
      isConnected: true,
      isInternetReachable: true,
      type: "wifi",
    }),
  },
}));

const records = new Map<string, string>();
mock.module("../src/stores/mmkv-storage", () => ({
  mmkvStorage: {
    getItem: (name: string) => records.get(name) ?? null,
    setItem: (name: string, value: string) => {
      records.set(name, value);
    },
    removeItem: (name: string) => {
      records.delete(name);
    },
  },
  storage: {
    getString: (key: string) => records.get(key),
    set: (key: string, value: string) => records.set(key, value),
    remove: (key: string) => records.delete(key),
  },
}));

mock.module("../src/api/client", () => ({
  api: {
    post: async () => ({ ok: true }),
  },
  apiClient: {
    getCurrentServerContext: () => ({
      generation: 1,
      baseUrl: "https://mirage.talk",
      identity: "https://mirage.talk",
    }),
  },
}));

const { useDeferredCampaignStore } = await import(
  "../src/stores/deferred-campaign-store"
);
const {
  configureVisitorIdentityForTests,
} = await import("../src/services/visitor-identity");
const {
  configureVisitorAttributionForTests,
  flushVisitorAttributionForTests,
  getVisitorAttributionCycleStateForTests,
  requestVisitorAttributionDelivery,
} = await import("../src/services/visitor-attribution");
const {
  buildVisitorAttributionBody,
  isVisitorAttributionAccepted,
} = await import("../src/api/write/endpoints/visitor-attribution");
const { configureMiragePlatformForTests } = await import(
  "../src/api/mirage-request-headers"
);

type Scheduled = {
  id: number;
  fn: () => void;
  at: number;
};

function createClock() {
  let now = 1_000;
  let nextId = 1;
  const timers: Scheduled[] = [];
  return {
    now: () => now,
    setTimeout(fn: () => void, delay: number) {
      const id = nextId++;
      timers.push({ id, fn, at: now + delay });
      return id;
    },
    clearTimeout(id: number) {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    advance(ms: number) {
      now += ms;
      const due = timers.filter((timer) => timer.at <= now).sort((a, b) => a.at - b.at);
      for (const timer of due) {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
        timer.fn();
      }
    },
  };
}

afterEach(() => {
  configureVisitorAttributionForTests(null);
  configureVisitorIdentityForTests(null);
  configureMiragePlatformForTests();
  useDeferredCampaignStore.setState({ pending: null, acknowledgedAt: null });
  records.clear();
});

describe("visitor attribution endpoint", () => {
  test("sends only bounded visitor, platform, ref, and UTM fields", () => {
    configureVisitorIdentityForTests({
      storage: {
        getString: () => "visitor-identity-1",
        set: () => undefined,
      },
    });
    configureMiragePlatformForTests("ios");
    const body = buildVisitorAttributionBody({
      ref: `r${"x".repeat(400)}`,
      utm_source: `s${"y".repeat(400)}`,
      utm_medium: "social",
      capturedAt: 99,
      invite: "ABCD",
      wallet: "mirage1abc",
    } as any);

    expect(body).toEqual({
      visitor_id: "visitor-identity-1",
      platform: "ios",
      ref: `r${"x".repeat(299)}`,
      utm_source: `s${"y".repeat(199)}`,
      utm_medium: "social",
    });
    expect(body).not.toHaveProperty("capturedAt");
    expect(body).not.toHaveProperty("invite");
    expect(body).not.toHaveProperty("wallet");
    expect(isVisitorAttributionAccepted({ ok: true })).toBe(true);
    expect(isVisitorAttributionAccepted({ ok: "true" })).toBe(false);
    expect(isVisitorAttributionAccepted({ ok: false })).toBe(false);
  });
});

describe("visitor attribution delivery", () => {
  test("acks only literal ok true against the captured snapshot and generation", async () => {
    const posts: unknown[] = [];
    let generation = 1;
    useDeferredCampaignStore.getState().captureFirstTouch({
      ref: "alice",
      utm_source: "twitter",
    });
    const snapshot = useDeferredCampaignStore.getState().pending;

    configureVisitorAttributionForTests({
      post: async (delivered) => {
        posts.push(delivered);
        return { ok: true };
      },
      getGeneration: () => generation,
      isOnline: () => true,
      isAppActive: () => true,
    });

    requestVisitorAttributionDelivery();
    await flushVisitorAttributionForTests();
    expect(posts).toEqual([snapshot]);
    expect(useDeferredCampaignStore.getState().acknowledgedAt).toBeGreaterThan(0);

    useDeferredCampaignStore.setState({ acknowledgedAt: null });
    generation = 2;
    configureVisitorAttributionForTests({
      post: async () => {
        generation = 3;
        return { ok: true };
      },
      getGeneration: () => generation,
      isOnline: () => true,
      isAppActive: () => true,
    });
    requestVisitorAttributionDelivery();
    await flushVisitorAttributionForTests();
    expect(useDeferredCampaignStore.getState().acknowledgedAt).toBeNull();
  });

  test("does not ack malformed success or stale snapshots", async () => {
    useDeferredCampaignStore.getState().captureFirstTouch({ ref: "alice" });
    const snapshot = { ...useDeferredCampaignStore.getState().pending };

    configureVisitorAttributionForTests({
      post: async () => ({ ok: "true" }),
      getGeneration: () => 1,
      isOnline: () => true,
      isAppActive: () => true,
    });
    requestVisitorAttributionDelivery();
    await flushVisitorAttributionForTests();
    expect(useDeferredCampaignStore.getState().acknowledgedAt).toBeNull();
    expect(useDeferredCampaignStore.getState().pending).toEqual(snapshot);

    configureVisitorAttributionForTests({
      post: async () => {
        useDeferredCampaignStore.setState({
          pending: { ref: "other", capturedAt: snapshot.capturedAt + 1 },
        });
        return { ok: true };
      },
      getGeneration: () => 1,
      isOnline: () => true,
      isAppActive: () => true,
    });
    useDeferredCampaignStore.setState({ pending: snapshot, acknowledgedAt: null });
    requestVisitorAttributionDelivery();
    await flushVisitorAttributionForTests();
    expect(useDeferredCampaignStore.getState().acknowledgedAt).toBeNull();
  });

  test("bounds retries, coalesces concurrent triggers, and pauses while inactive or offline", async () => {
    const clock = createClock();
    const attempts: number[] = [];
    useDeferredCampaignStore.getState().captureFirstTouch({ ref: "alice" });

    configureVisitorAttributionForTests({
      post: async () => {
        attempts.push(clock.now());
        throw { code: "ERR_NETWORK" };
      },
      getGeneration: () => 1,
      isOnline: () => true,
      isAppActive: () => true,
      clock,
    });

    requestVisitorAttributionDelivery();
    requestVisitorAttributionDelivery();
    await flushVisitorAttributionForTests();
    expect(attempts).toHaveLength(1);
    expect(getVisitorAttributionCycleStateForTests().hasRetryTimer).toBe(true);

    clock.advance(2_000);
    await flushVisitorAttributionForTests();
    expect(attempts).toHaveLength(2);

    clock.advance(8_000);
    await flushVisitorAttributionForTests();
    expect(attempts).toHaveLength(3);

    clock.advance(8_000);
    await flushVisitorAttributionForTests();
    expect(attempts).toHaveLength(3);
    expect(getVisitorAttributionCycleStateForTests().hasRetryTimer).toBe(false);

    let active = false;
    let online = true;
    configureVisitorAttributionForTests({
      post: async () => {
        attempts.push(clock.now());
        return { ok: true };
      },
      getGeneration: () => 1,
      isOnline: () => online,
      isAppActive: () => active,
      clock,
    });
    requestVisitorAttributionDelivery();
    await flushVisitorAttributionForTests();
    expect(attempts).toHaveLength(3);

    active = true;
    online = false;
    requestVisitorAttributionDelivery();
    await flushVisitorAttributionForTests();
    expect(attempts).toHaveLength(3);
  });
});
