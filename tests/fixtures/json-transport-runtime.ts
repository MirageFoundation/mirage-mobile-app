// @ts-nocheck -- Isolated Bun runtime fixture; no network or native module loads.
import { mock } from "bun:test";
import assert from "node:assert/strict";

console.error = () => {};
const calls = [];
let handle = async () => new Response('{"ok":true}');
mock.module("expo/fetch", () => ({ fetch: async (url, options) => {
  calls.push({ url, options });
  assert.equal(typeof url, "string");
  assert.equal(options.redirect, "manual");
  return handle(url, options);
} }));
mock.module("expo-network", () => ({ getNetworkStateAsync: async () => ({ isConnected: true }) }));
mock.module("@sentry/react-native", () => ({ addBreadcrumb() {}, captureMessage() {}, captureException() {} }));
mock.module("../../src/services/wallet-service", () => ({ walletService: { getWalletMetadata: () => null } }));
mock.module("../../src/stores/inbox-store", () => ({ useInboxStore: { getState: () => ({}) } }));
mock.module("../../src/stores/cloudflare-error-store", () => ({ useCloudflareErrorStore: { getState: () => ({ clearError() {} }) } }));
mock.module("../../src/stores/preferences-store", () => ({
  getApiBaseUrl: server => `https://${server}`,
  usePreferencesStore: { getState: () => ({ apiServer: "a.example" }) },
}));
const { configureVisitorIdentityForTests } = await import("../../src/services/visitor-identity");
const { configureMiragePlatformForTests } = await import("../../src/api/mirage-request-headers");
configureVisitorIdentityForTests({ storage: { getString: () => "test-visitor-identity", set() {} } });
configureMiragePlatformForTests("ios");
const { apiClient } = await import("../../src/api/client");
assert.deepEqual(await apiClient.get("/test"), { ok: true });
assert.equal(calls.at(-1).options.headers["X-Mirage-Visitor"], "test-visitor-identity");
assert.equal(calls.at(-1).options.headers["X-Mirage-Platform"], "ios");
await apiClient.getInstance().get("https://third.example/api/test", {
  headers: { "x-mirage-visitor": "must-strip", "x-mirage-platform": "ios" },
});
assert.equal(calls.at(-1).options.headers["x-mirage-visitor"], undefined);
await apiClient.postTrustedAbsolute("https://old.example/api/core/unregister_push_token", { signature: "fixture" });
assert.equal(calls.at(-1).options.headers["X-Mirage-Visitor"], "test-visitor-identity");
assert.equal(calls.at(-1).options.body, '{"signature":"fixture"}');

for (const status of [301, 302, 303, 307, 308]) {
  handle = async () => new Response('{"error_code":"network_error"}', { status, headers: { location: "https://other.example" } });
  const start = calls.length;
  await assert.rejects(apiClient.get("/test"), error => error.response.status === status);
  await assert.rejects(apiClient.post("/test", { signature: "fixture" }), error => error.response.status === status);
  assert.equal(calls.length, start + 2);
}
handle = async () => ({
  status: 307, statusText: "redirect", headers: new Headers(),
  text: async () => { throw new TypeError("fetch body failed"); },
});
const beforeBrokenBody = calls.length;
await assert.rejects(apiClient.get("/test"), error => error.response.status === 307);
assert.equal(calls.length, beforeBrokenBody + 1);
let attempts = 0;
handle = async () => {
  if (++attempts === 1) throw new TypeError("fetch failed");
  return new Response('{"ok":true}');
};
assert.deepEqual(await apiClient.get("/test"), { ok: true });
assert.equal(attempts, 2);
assert.equal(calls.at(-1).options.headers["X-Retry"], undefined);
assert.equal(calls.at(-1).options.headers["X-Mirage-Visitor"], "test-visitor-identity");

let bodyStarted;
const started = new Promise(resolve => { bodyStarted = resolve; });
handle = async (_url, options) => ({
  status: 200, statusText: "OK", headers: new Headers(),
  text: () => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("native canceled")), { once: true });
    bodyStarted();
  }),
});
const pending = apiClient.get("/test");
const rejection = assert.rejects(pending, error => error.code === "ERR_CANCELED" || error.name === "StaleServerResponseError");
await started;
await apiClient.switchBaseUrl("https://b.example");
await rejection;
handle = async () => new Response('{"ok":true}');
await apiClient.get("/test");
assert.equal(calls.at(-1).url, "https://b.example/api/test");

handle = async (_url, options) => ({
  status: 200, statusText: "OK", headers: new Headers(),
  text: () => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("native canceled")), { once: true })),
});
await assert.rejects(apiClient.getInstance().get("/api/test", { timeout: 5 }), error => error.code === "ECONNABORTED");
console.log("isolated native-fetch seam checks passed");
