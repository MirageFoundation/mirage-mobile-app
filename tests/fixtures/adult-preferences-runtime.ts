// @ts-nocheck -- Isolated Bun runtime with native storage mocked.
import { expect, mock } from "bun:test";

const disk = new Map();
let writes = 0;
mock.module("../../src/stores/mmkv-storage", () => ({
  mmkvStorage: {
    getItem: (key) => disk.get(key) ?? null,
    setItem: (key, value) => { writes++; disk.set(key, value); },
    removeItem: (key) => disk.delete(key),
  },
}));
mock.module("@sentry/react-native", () => ({ addBreadcrumb() {} }));
mock.module("../../src/services/analytics", () => ({ setAnalyticsTrackingEnabled: async () => {} }));
const { usePreferencesStore: store } = await import("../../src/stores/preferences-store");
expect(store.persist.hasHydrated()).toBe(true);
for (const enabled of [true, false]) {
  store.setState({ hasSeenAdultPrompt: false, adultContentEnabled: false, selectedContentTypes: ["sensitive"], adultPromptDismissedAt: 0 });
  const snapshots = [];
  const stop = store.subscribe((state) => snapshots.push({ ...state }));
  writes = 0;
  store.getState().answerAdultPrompt(enabled);
  store.getState().answerAdultPrompt(!enabled);
  stop();
  expect(writes).toBe(1);
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].hasSeenAdultPrompt).toBe(true);
  expect(snapshots[0].adultContentEnabled).toBe(enabled);
  expect(snapshots[0].adultPromptDismissedAt).toBeGreaterThan(0);
  const saved = JSON.parse(disk.get("preferences-storage"));
  expect(saved.state.hasSeenAdultPrompt).toBe(true);
  expect(saved.state.adultContentEnabled).toBe(enabled);
  await store.persist.rehydrate();
  expect(store.getState().adultContentEnabled).toBe(enabled);
  expect(store.getState().hasSeenAdultPrompt).toBe(true);
  store.getState().setAdultContent(!enabled);
  expect(store.getState().adultContentEnabled).toBe(!enabled);
  expect(store.getState().hasSeenAdultPrompt).toBe(true);
}
for (const enabled of [true, false]) {
  disk.set("preferences-storage", JSON.stringify({ version: 10, state: {
    hasSeenAdultPrompt: false, adultPromptDismissedAt: 1234,
    adultContentEnabled: enabled, selectedContentTypes: enabled ? ["all"] : ["sensitive"],
    analyticsConsent: false, analyticsConsentAsked: true,
  } }));
  await store.persist.rehydrate();
  expect(store.getState().hasSeenAdultPrompt).toBe(true);
  expect(store.getState().adultContentEnabled).toBe(enabled);
  expect(store.getState().analyticsConsent).toBe(false);
  expect(store.getState().analyticsConsentAsked).toBe(true);
}
disk.set("preferences-storage", JSON.stringify({ version: 10, state: {
  hasSeenAdultPrompt: false, adultPromptDismissedAt: 0, adultContentEnabled: false,
} }));
await store.persist.rehydrate();
expect(store.getState().hasSeenAdultPrompt).toBe(false);
console.log("adult preference persistence and migration passed");
