// @ts-nocheck -- Isolated Bun runtime fixture; no network/native modules.
import { mock } from "bun:test";
import assert from "node:assert/strict";
const requests = [];
const events = [];
const breadcrumbs = [];
let viewer = null;
let handle = async () => new Response('{"ok":true}');
mock.module("expo/fetch", () => ({ fetch: async (url, options) => {
  requests.push({ url, options });
  return handle(url, options);
} }));
mock.module("expo-network", () => ({ getNetworkStateAsync: async () => ({ isConnected: true }) }));
mock.module("@sentry/react-native", () => ({
  addBreadcrumb: value => breadcrumbs.push(value),
  captureException: (...args) => events.push(args),
}));
mock.module("../../src/services/wallet-service", () => ({ walletService: { getWalletMetadata: () => viewer ? { address: viewer } : null } }));
mock.module("../../src/stores/inbox-store", () => ({ useInboxStore: { getState: () => ({}) } }));
mock.module("../../src/stores/cloudflare-error-store", () => ({ useCloudflareErrorStore: { getState: () => ({ clearError() {}, setError() {} }) } }));
mock.module("../../src/stores/preferences-store", () => ({
  getApiBaseUrl: server => `https://${server}`,
  usePreferencesStore: { getState: () => ({ apiServer: "a.example" }) },
}));
const { configureVisitorIdentityForTests } = await import("../../src/services/visitor-identity");
const { configureMiragePlatformForTests } = await import("../../src/api/mirage-request-headers");
configureVisitorIdentityForTests({ storage: { getString: () => "test-visitor-identity", set() {} } });
configureMiragePlatformForTests("ios");
const { apiClient } = await import("../../src/api/client");
const { queryClient } = await import("../../src/providers/query-client");
const { queryKeys } = await import("../../src/api/read/query-keys");
const { isCompletedApiRead, shouldRetryApiQuery, readRetryDelay } = await import("../../src/api/read-retry-policy");
const response = (status, code) => new Response(JSON.stringify({ error_code: code, secret: "RESPONSE_SECRET" }), { status, headers: { "Retry-After": "0" } });
const reset = () => { requests.length = 0; events.length = 0; breadcrumbs.length = 0; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

reset();
let proofs = 0;
handle = async () => {
  if (requests.length === 1) throw new TypeError("fetch failed TRANSPORT_SECRET");
  return response(requests.length === 2 ? 429 : 503, "indexer_unavailable");
};
await assert.rejects(queryClient.fetchQuery({
  queryKey: queryKeys.config(),
  queryFn: () => apiClient.get("/get_chain_config?hidden=QUERY_SECRET", undefined, {
    paramsFactory: async () => ({ signature: `PROOF_SECRET_${++proofs}` }),
  }),
}), error => isCompletedApiRead(error) && !shouldRetryApiQuery(0, error));
assert.equal(requests.length, 3);
assert.equal(proofs, 3);
assert.equal(events.length, 1);
assert.equal(events[0][1].extra.attempts, 3);
assert.equal(requests.some(r => r.options.headers["X-Retry"]), false);
for (const secret of ["QUERY_SECRET", "PROOF_SECRET", "RESPONSE_SECRET", "TRANSPORT_SECRET"]) {
  assert.equal(JSON.stringify([events, breadcrumbs]).includes(secret), false);
}
assert.equal(new Set(requests.map(r => new URL(r.url).searchParams.get("signature"))).size, 3);

reset();
handle = async () => response(503, "node_catching_up");
await assert.rejects(apiClient.get("/bootstrap"));
assert.equal(requests.length, 3);
assert.equal(events.length, 0);
assert.equal(breadcrumbs.filter(b => b.category === "api").length, 1);

for (const status of [300, 301, 400, 401, 403, 404]) {
  reset();
  handle = async () => response(status, "node_catching_up");
  await assert.rejects(apiClient.get("/test"));
  assert.equal(requests.length, 1);
}
reset();
handle = async () => response(503, "invalid_signature");
await assert.rejects(apiClient.get("/test"));
assert.equal(requests.length, 1);
reset();
handle = async () => response(503, "indexer_unavailable");
await assert.rejects(apiClient.get("/test", { signature: "prebuilt" }));
assert.equal(requests.length, 1);
reset();
await assert.rejects(apiClient.get("/test", undefined, { paramsFactory: async () => { throw new Error("SIGNING_SECRET"); } }));
assert.equal(requests.length, 0);
assert.equal(events.length, 0);

reset();
let releaseProof;
const proofController = new AbortController();
const proof = apiClient.get("/test", undefined, {
  signal: proofController.signal,
  paramsFactory: () => new Promise(resolve => { releaseProof = resolve; }),
});
proofController.abort();
await assert.rejects(proof, error => error.code === "ERR_CANCELED");
releaseProof({ signature: "late" });
await tick();
assert.equal(requests.length, 0);

reset();
let releaseViewerProof;
viewer = "a";
const switchedViewer = apiClient.get("/test", undefined, { paramsFactory: () => new Promise(resolve => { releaseViewerProof = resolve; }) });
viewer = "b";
releaseViewerProof({ signature: "old-viewer" });
await assert.rejects(switchedViewer, error => error.code === "ERR_CANCELED");
assert.equal(requests.length, 0);
viewer = null;

reset();
handle = async () => new Response('{}', { status: 429, headers: { "Retry-After": "10" } });
const backoffController = new AbortController();
const waiting = apiClient.get("/test", undefined, { signal: backoffController.signal });
await tick();
backoffController.abort();
await assert.rejects(waiting, error => error.code === "ERR_CANCELED");
assert.equal(requests.length, 1);
assert.equal(events.length, 0);

reset();
const releases = [];
handle = async () => new Promise(resolve => releases.push(() => resolve(new Response('{}'))));
const active = Array.from({ length: 6 }, () => apiClient.get("/test"));
await tick();
const queuedController = new AbortController();
const queued = apiClient.get("/queued", undefined, { signal: queuedController.signal });
queuedController.abort();
await assert.rejects(queued, error => error.code === "ERR_CANCELED");
assert.equal(requests.length, 6);
releases.forEach(release => release());
await Promise.all(active);
assert.equal(requests.length, 6);

reset();
let releaseServerProof;
const switched = apiClient.get("/test", undefined, { paramsFactory: () => new Promise(resolve => { releaseServerProof = resolve; }) });
apiClient.setBaseUrl("https://b.example");
await assert.rejects(switched, error => error.code === "ERR_CANCELED" || error.name === "StaleServerResponseError");
releaseServerProof({ signature: "late" });
await tick();
assert.equal(requests.length, 0);
assert.equal(readRetryDelay({ response: { headers: { "retry-after": "99999" } } }, 1), 10_000);
queryClient.clear();
console.log("read resilience runtime checks passed");
