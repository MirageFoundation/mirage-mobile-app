// @ts-nocheck -- Isolated service runtime, no network/native modules.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const calls = { node: 0, chain: 0, status: 0, followed: 0, blocked: 0 };
const events = [];
let generation = 0;
let active = true;
let fail = true;
let releaseStatus;
let releaseNode;
let deferNode = false;
const empty = { node_config: null, chain_config: null, user_status: null, user_followed: null, user_blocked: null, view: null };
let bootstrap = empty;
const failure = Object.assign(new Error("PRIVATE_API_BODY"), { response: { status: 503, data: { error_code: "indexer_unavailable" } } });
mock.module("@sentry/react-native", () => ({ addBreadcrumb() {}, captureException: (...args) => events.push(args) }));
mock.module("../../src/api/client", () => ({ apiClient: { getCurrentServerContext: () => ({ generation, identity: "https://a.example" }) } }));
mock.module("../../src/providers/query-client", () => ({ queryClient: client }));
mock.module("../../src/services/wallet-service", () => ({ walletService: { updateMetadata() {} } }));
mock.module("../../src/stores/preferences-store", () => ({
  getAllowedTagsFromContentTypes: () => "",
  usePreferencesStore: { getState: () => ({ selectedContentTypes: [], adultContentEnabled: false }) },
}));
mock.module("../../src/api/read/endpoints/bootstrap", () => ({ getBootstrap: async () => {
  if (fail) throw failure;
  return bootstrap;
} }));
mock.module("../../src/api/read/endpoints/parameters", () => ({
  getNodeConfig: async () => { calls.node++; return deferNode ? new Promise(resolve => { releaseNode = resolve; }) : { node: true }; },
  getChainConfig: async () => { calls.chain++; return { chain: true }; },
}));
mock.module("../../src/api/read/endpoints/users", () => ({
  getUserStatus: async () => { calls.status++; return new Promise(resolve => { releaseStatus = resolve; }); },
  getUserFollowed: async () => { calls.followed++; return { followed_users: [] }; },
  getUserBlocked: async () => { calls.blocked++; return { blocked_users: [], blocked_posts: [] }; },
}));
const { markCompletedApiRead } = await import("../../src/api/read-retry-policy");
const { primeBootstrap, hydrateBootstrapCache } = await import("../../src/services/bootstrap");
const { resolveAndCacheAuthUserStatus } = await import("../../src/services/auth-bootstrap");
const { queryKeys } = await import("../../src/api/read/query-keys");
const { parseAccountStatusSnapshot, hydrateAccountStatus, getCachedRelayDecision } = await import("../../src/api/cache/account-status-cache");
const { rememberBootstrapFeedPreview, consumeBootstrapFeedPreview, hydrateBootstrapViewCache } = await import("../../src/api/cache/bootstrap-cache");
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
markCompletedApiRead(failure);
assert.equal(await primeBootstrap(client, "viewer", () => active), null);
const auth = resolveAndCacheAuthUserStatus("viewer", null, () => active);
assert.equal(calls.status, 1);
releaseStatus({ username: "viewer", user_level: 0 });
assert.equal((await auth).username, "viewer");
await tick();
assert.deepEqual(calls, { node: 1, chain: 1, status: 1, followed: 1, blocked: 1 });
assert.equal(events.length, 0);
assert.deepEqual(client.getQueryData(queryKeys.nodeConfig()), { node: true });
assert.equal(client.getQueryData(queryKeys.accountStatus("viewer")), undefined);

client.clear();
fail = false;
bootstrap = { ...empty, chain_config: { partial: true }, user_status: { username: "viewer", user_level: 0 }, user_followed: { followed_users: [] }, user_blocked: { blocked_users: [] } };
await primeBootstrap(client, "viewer", () => active);
await tick();
assert.equal(calls.chain, 1);
assert.equal(calls.node, 2);
assert.equal(calls.status, 1);
assert.deepEqual(client.getQueryData(queryKeys.config()), { partial: true });
assert.equal(client.getQueryData(queryKeys.accountStatus("viewer")).incomplete, true);

client.clear();
fail = true;
deferNode = true;
await primeBootstrap(client, undefined, () => active);
active = false;
releaseNode({ wrongViewer: true });
await tick();
assert.equal(client.getQueryData(queryKeys.nodeConfig()), undefined);
active = true;
client.clear();
await primeBootstrap(client, undefined, () => active);
generation++;
releaseNode({ wrongServer: true });
await tick();
assert.equal(client.getQueryData(queryKeys.nodeConfig()), undefined);

assert.deepEqual(parseAccountStatusSnapshot({}), {});
assert.deepEqual(parseAccountStatusSnapshot({ daily_quota: null, renewal_warning: null }), { daily_quota: null, renewal_warning: null });
const accountKey = queryKeys.accountStatus("viewer");
const old = { daily_quota: null, renewal_warning: null };
client.setQueryData(accountKey, old, { updatedAt: 123 });
hydrateAccountStatus(client, "viewer", parseAccountStatusSnapshot({ renewal_warning: null }));
assert.equal(client.getQueryState(accountKey).dataUpdatedAt, 123);
assert.equal(client.getQueryData(accountKey).daily_quota, null);
assert.equal(client.getQueryData(accountKey).incomplete, true);
client.setQueryData(queryKeys.userStatus("viewer"), { user_level: 1, effective_paid: true });
assert.equal(getCachedRelayDecision(client, "viewer").relay_allowed, true);
assert.equal(client.getQueryData(accountKey).incomplete, true);
assert.equal(client.getQueryState(accountKey).dataUpdatedAt, 123);
hydrateBootstrapCache(client, { ...empty, daily_quota: null, renewal_warning: null }, "viewer");
assert.equal(client.getQueryData(accountKey).incomplete, undefined);
assert.equal(getCachedRelayDecision(client, "viewer").relay_allowed, true);

const page = { posts: [{ post_id: "old" }], page: 1, has_more: false };
const feedKey = queryKeys.posts({ feed: "home", address: "viewer", page: undefined });
client.setQueryData(feedKey, { pages: [page], pageParams: [1] }, { updatedAt: 123 });
hydrateBootstrapViewCache(client, { ...empty, view: { ...page, kind: "feed", feed: "home", posts: [{ post_id: "new" }] } }, { address: "viewer", view: "feed:home" });
assert.equal(client.getQueryState(feedKey).dataUpdatedAt, 123);
assert.equal(client.getQueryData(feedKey).pages[0].posts[0].post_id, "old");
rememberBootstrapFeedPreview({ serverIdentity: "https://a.example", address: "viewer" }, page);
assert.equal(consumeBootstrapFeedPreview({ serverIdentity: "https://b.example", address: "viewer" }), null);
assert.equal(consumeBootstrapFeedPreview({ serverIdentity: "https://a.example", address: "other" }), null);
assert.equal(consumeBootstrapFeedPreview({ serverIdentity: "https://a.example", address: "viewer" }), page);
const now = Date.now;
rememberBootstrapFeedPreview({ serverIdentity: "https://a.example", address: "viewer" }, page);
Date.now = () => now() + 61_000;
assert.equal(consumeBootstrapFeedPreview({ serverIdentity: "https://a.example", address: "viewer" }), null);
Date.now = now;
for (let i = 0; i < 21; i++) rememberBootstrapFeedPreview({ serverIdentity: "https://a.example", address: `viewer${i}` }, page);
assert.equal(consumeBootstrapFeedPreview({ serverIdentity: "https://a.example", address: "viewer0" }), null);
client.clear();
console.log("bootstrap resilience runtime checks passed");
