// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, mock, test } from "bun:test";

const records = new Map<string, string>();
const memoryStorage = {
  getItem: (name: string) => records.get(name) ?? null,
  setItem: (name: string, value: string) => {
    records.set(name, value);
  },
  removeItem: (name: string) => {
    records.delete(name);
  },
};

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));
mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
}));

mock.module("../src/stores/mmkv-storage", () => ({
  mmkvStorage: memoryStorage,
  storage: {
    getString: (key: string) => records.get(key),
    set: (key: string, value: string) => records.set(key, value),
    remove: (key: string) => records.delete(key),
  },
}));

const {
  campaignParamsFromSearch,
  extractCampaignParams,
  isTrustedCampaignLocation,
} = await import("../src/navigation/campaign-linking");
const { useDeferredCampaignStore } = await import("../src/stores/deferred-campaign-store");

afterEach(() => {
  useDeferredCampaignStore.setState({ pending: null, acknowledgedAt: null });
  records.clear();
});

describe("deferred campaign capture", () => {
  test("extracts ref and UTM from trusted Mirage URLs and ignores invite", () => {
    expect(isTrustedCampaignLocation("https://mirage.talk/signup?ref=alice")).toBe(true);
    expect(isTrustedCampaignLocation("mirage://username?utm_source=x")).toBe(true);
    expect(isTrustedCampaignLocation("https://evil.example/signup?ref=alice")).toBe(false);

    expect(extractCampaignParams(
      "https://mirage.talk/signup?ref=alice&invite=ABCD-EFGH&utm_source=twitter&utm_medium=social&utm_campaign=launch&utm_content=bio&utm_term=vote",
    )).toEqual({
      ref: "alice",
      utm_source: "twitter",
      utm_medium: "social",
      utm_campaign: "launch",
      utm_content: "bio",
      utm_term: "vote",
    });
    expect(extractCampaignParams("https://mirage.talk/signup?invite=ABCD-EFGH")).toBeNull();
    expect(campaignParamsFromSearch("?invite=ABCD")).toBeNull();
    expect(extractCampaignParams("/username?ref=bob&utm_source=share")).toEqual({
      ref: "bob",
      utm_source: "share",
    });
  });

  test("first-touch snapshot survives later links and acknowledgement does not deliver", () => {
    const store = useDeferredCampaignStore.getState();
    store.captureFirstTouch({ ref: "alice", utm_source: "twitter" });
    const first = useDeferredCampaignStore.getState().pending;
    expect(first?.ref).toBe("alice");
    expect(first?.utm_source).toBe("twitter");
    expect(first?.capturedAt).toBeGreaterThan(0);

    store.captureFirstTouch({ ref: "bob", utm_campaign: "later" });
    expect(useDeferredCampaignStore.getState().pending).toEqual(first);

    store.acknowledgeAttributionSuccess({
      ...first,
      capturedAt: first.capturedAt - 1,
    });
    expect(useDeferredCampaignStore.getState().acknowledgedAt).toBeNull();

    store.acknowledgeAttributionSuccess({ ...first, ref: "bob" });
    expect(useDeferredCampaignStore.getState().acknowledgedAt).toBeNull();

    store.acknowledgeAttributionSuccess(first);
    const afterAck = useDeferredCampaignStore.getState();
    expect(afterAck.pending).toEqual(first);
    expect(afterAck.acknowledgedAt).toBeGreaterThan(0);

    store.acknowledgeAttributionSuccess(first);
    expect(useDeferredCampaignStore.getState().acknowledgedAt).toBe(afterAck.acknowledgedAt);

    store.captureFirstTouch({ ref: "carol", utm_source: "later" });
    expect(useDeferredCampaignStore.getState().pending).toEqual(first);
  });

  test("does not generate visitor IDs or send attribution", () => {
    const { readFileSync } = require("node:fs");
    const { join } = require("node:path");
    const source = readFileSync(
      join(import.meta.dir, "../src/stores/deferred-campaign-store.ts"),
      "utf8",
    );
    const linking = readFileSync(
      join(import.meta.dir, "../src/navigation/campaign-linking.ts"),
      "utf8",
    );
    expect(source).not.toContain("visitor");
    expect(source).not.toContain("X-Mirage");
    expect(source).not.toContain("visitor_attribution");
    expect(source).not.toContain("trackEvent");
    expect(linking).not.toContain("invite");
    const ownership = readFileSync(
      join(import.meta.dir, "../src/stores/wallet-scoped-storage.ts"),
      "utf8",
    );
    expect(ownership).toContain("\"deferred-campaign-storage\": \"device\"");
  });
});
