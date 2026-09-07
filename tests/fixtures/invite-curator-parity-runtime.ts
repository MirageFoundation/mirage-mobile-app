// @ts-nocheck -- Isolated native boundaries; real endpoint, envelope, crypto and Axios.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";

mock.module("@sentry/react-native", () => ({ addBreadcrumb() {}, captureException() {}, captureMessage() {} }));
const crypto = await import("../../src/wallet/crypto");
mock.module("../../src/wallet", () => ({
  ...crypto,
  computePoW: async () => { throw Error("Paid invite must not compute PoW"); },
  estimatePoWTime: () => 0, isPowCancelled: () => false, isPowTimedOut: () => false,
}));
mock.module("../../src/stores", () => ({ useAuthStore: { getState: () => ({ userLevel: 1 }) } }));
mock.module("../../src/providers/query-client", () => ({ queryClient: {} }));
mock.module("../../src/api/cache/account-status-cache", () => ({
  getCachedRelayDecision: () => ({ relay_allowed: true, pow_required: false, quota_exhausted: false }),
}));
mock.module("../../src/api/read/endpoints/parameters", () => ({ getParameters: async () => { throw Error("Paid invite should not fetch PoW parameters"); } }));
mock.module("../../src/api/read/endpoints/curation", () => Object.fromEntries([
  "getCommunityTeam", "getCommunityTeamHiddenPosts", "getCommunityTeamHiddenUsers",
  "getCommunityTeamInvitations", "getCommunityTeamModeration", "getCommunityTeams",
].map(name => [name, async () => { throw Error("No indexer reads expected"); }])));

mock.module("expo-network", () => ({ getNetworkStateAsync: async () => ({ isConnected: true }) }));
mock.module("../../src/services/wallet-service", () => ({ walletService: { getWalletMetadata: () => null } }));
mock.module("../../src/stores/inbox-store", () => ({ useInboxStore: { getState: () => ({}) } }));
mock.module("../../src/stores/cloudflare-error-store", () => ({ useCloudflareErrorStore: { getState: () => ({ clearError() {}, setError() {} }) } }));
mock.module("../../src/stores/auth-store", () => ({ useAuthStore: { getState: () => ({ walletAddress: null }) } }));
mock.module("../../src/stores/preferences-store", () => ({
  getApiBaseUrl: server => `https://${server}`,
  usePreferencesStore: { getState: () => ({ apiServer: "offline.invalid" }) },
}));
const { configureVisitorIdentityForTests } = await import("../../src/services/visitor-identity");
const { configureMiragePlatformForTests } = await import("../../src/api/mirage-request-headers");
configureVisitorIdentityForTests({ storage: { getString: () => "test-visitor-identity", set() {} } });
configureMiragePlatformForTests("ios");
let emitted;
let requestedPath;
let posts = 0;
let gets = 0;
mock.module("expo/fetch", () => ({ fetch: async (url, init) => {
  if (init.method === "GET") {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/get_address_from_username");
    assert.equal(parsed.searchParams.get("username"), "alice");
    gets++;
    return new Response(JSON.stringify({ exists: true, address: target.toUpperCase(), username: "alice" }), { status: 200 });
  }
  posts++;
  requestedPath = new URL(String(url)).pathname;
  emitted = JSON.parse(init.body);
  return new Response(JSON.stringify({ code: 0, tx_hash: "a".repeat(64) }), { status: 200 });
} }));
const { inviteCurator } = await import("../../src/api/write/endpoints/curation");
const { canonBaseInviteCurator, canonSignedWithPow } = await import("../../src/api/write/signing/canonical");
// Public secp256k1 test scalar 1, never a user credential.
const privateKey = new Uint8Array(32); privateKey[31] = 1;
const publicKey = secp256k1.getPublicKey(privateKey, true);
const { deriveAddress, isValidAddress } = await import("../../src/wallet/address");
const targetKey = new Uint8Array(32); targetKey[31] = 2;
const target = deriveAddress(secp256k1.getPublicKey(targetKey, true));
assert(isValidAddress(target));
await inviteCurator({ privateKey, publicKey, address: deriveAddress(publicKey) }, {
  community: "  PaRiTy  ", teamId: "128", target: `  ${target.toUpperCase()}  `,
});
assert.equal(posts, 1);
function verifyEmitted() {
assert.equal(requestedPath, "/api/core/invite_curator");
assert.equal(emitted.community, "parity");
assert.equal(emitted.team_id, 128);
assert.equal(emitted.target, target);
assert.equal(typeof emitted.envelope_nonce, "string");
assert(BigInt(emitted.envelope_nonce) > BigInt(Number.MAX_SAFE_INTEGER));
assert.equal(emitted.pow, 0);
assert.equal(emitted.pow_difficulty, 0);
assert.equal(emitted.last_block_hash, "");
assert(Math.abs(Date.now() - emitted.timestamp) < 5000);
const base = canonBaseInviteCurator({
  pubkey33: Buffer.from(emitted.pubkey, "base64"), lastBlockHashBytes: new Uint8Array(),
  difficulty: emitted.pow_difficulty, timestampMs: emitted.timestamp,
  envelopeNonce: BigInt(emitted.envelope_nonce), community: emitted.community,
  team_id: emitted.team_id, target: emitted.target,
});
const signed = canonSignedWithPow(base, emitted.pow);
// Independently assemble the chain's signed canonical format from decoded JSON.
const uv = value => { let n = BigInt(value); const out = []; do { const b = Number(n & 127n); n >>= 7n; out.push(n ? b | 128 : b); } while (n); return Buffer.from(out); };
const bytes = (tag, value) => Buffer.concat([Buffer.from([tag]), uv(value.length), value]);
const uint = (tag, value) => Buffer.concat([Buffer.from([tag]), uv(value)]);
const expected = Buffer.concat([
  Buffer.from("mirage.core.v1:MsgInviteCurator\0"), bytes(2, Buffer.from(emitted.pubkey, "base64")),
  bytes(3, Buffer.from(emitted.last_block_hash, "hex")), uint(4, emitted.pow_difficulty),
  uint(5, emitted.pow), uint(6, emitted.timestamp), uint(7, emitted.envelope_nonce),
  bytes(100, Buffer.from(emitted.community)), uint(101, emitted.team_id), bytes(102, Buffer.from(emitted.target)),
]);
assert.deepEqual(Buffer.from(signed), expected);
assert.equal(Buffer.from(emitted.signature, "base64").length, 64);
assert(secp256k1.verify(Buffer.from(emitted.signature, "base64"), sha256(expected), publicKey, { prehash: false, lowS: true }));
}
verifyEmitted();
const baseline = { community: emitted.community, team_id: emitted.team_id, target: emitted.target };
const { QueryClient } = await import("@tanstack/react-query");
const { resolveCuratorInviteTarget } = await import("../../src/api/read/resolve-curator-invite-target");
const queryClient = new QueryClient();
for (const input of [" @ALICE ", "alice", ` ${target.toUpperCase()} `]) {
  const resolved = await resolveCuratorInviteTarget(queryClient, input);
  await inviteCurator({ privateKey, publicKey, address: deriveAddress(publicKey) }, {
    community: "  PaRiTy  ", teamId: "128", target: resolved,
  });
  verifyEmitted();
  assert.deepEqual({ community: emitted.community, team_id: emitted.team_id, target: emitted.target }, baseline);
}
assert.equal(gets, 2); assert.equal(posts, 4);
for (const invalid of ["alice", "@alice", "mirage1broken", `${target.slice(0, -1)}${target.endsWith("q") ? "p" : "q"}`]) {
  await assert.rejects(inviteCurator({ privateKey, publicKey, address: deriveAddress(publicKey) }, {
    community: "parity", teamId: 128, target: invalid,
  }), /Invalid wallet address/);
}
assert.equal(posts, 4);
queryClient.clear();
console.log("Invite endpoint -> real envelope/signature -> Axios JSON -> independent canonical verification passed (offline)");
