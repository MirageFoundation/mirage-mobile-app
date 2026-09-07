// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const getCalls: { path: string; params?: Record<string, unknown>; signal?: AbortSignal }[] = [];
let walletResult: unknown = null;

mock.module("../src/api/client", () => ({
  api: {
    get: async (path: string, params?: Record<string, unknown>, options?: any) => {
      if (options?.paramsFactory) params = await options.paramsFactory();
      getCalls.push({ path, params, signal: options?.signal });
      if (path.includes("/moderation")) {
        return {
          community: "bitcoin",
          team_id: "3",
          items: [
            { post_id: "aa".repeat(32), post_hidden: false, user_hidden: false, thread_locked: false, post_tag: null },
          ],
        };
      }
      if (path.endsWith("/teams")) {
        return { items: [], viewer_team_ids: [], next_cursor: null, has_more: false };
      }
      return { items: [] };
    },
  },
  apiClient: {},
}));

mock.module("../src/services/wallet-service", () => ({
  walletService: {
    getWallet: async () => walletResult,
  },
}));

const { getCompressedPublicKey } = await import("../src/wallet/crypto");
const { deriveAddress } = await import("../src/wallet/address");
const {
  getCommunityTeamInvitations,
  getCommunityTeamModeration,
  getCommunityTeams,
  getCuratorCommunities,
  getCuratorInvitations,
} = await import("../src/api/read/endpoints/curation");
const {
  SignedCuratorReadError,
  shouldRetryCuratorRead,
} = await import("../src/api/read/signed-curator-read");
const { fetchModerationBatches } = await import("../src/api/read/utils/batch-moderation");

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

function makeWallet() {
  const privateKey = hexToBytes(
    "0000000000000000000000000000000000000000000000000000000000000001",
  );
  const publicKey = getCompressedPublicKey(privateKey);
  return {
    mnemonic: "",
    privateKey,
    publicKey,
    address: "SHOULD-NOT-BE-USED",
  };
}

describe("curation read contract", () => {
  test("public team list is unsigned and curator communities uses path address", async () => {
    getCalls.length = 0;
    await getCommunityTeams({ slug: "Bitcoin", include_deleted: true, viewer: " MIRAGE1VIEWER " });
    await getCuratorCommunities("MIRAGE1VIEWER");
    expect(getCalls[0]).toEqual({
      path: "/communities/bitcoin/teams",
      params: { include_deleted: true, viewer: "mirage1viewer" },
      signal: undefined,
    });
    expect(getCalls[1]?.path).toBe("/curators/mirage1viewer/communities");
    expect(getCalls[1]?.params).toBeUndefined();
  });

  test("protected reads send viewer not address, with a fresh curator_read proof", async () => {
    const wallet = makeWallet();
    walletResult = wallet;
    const derived = deriveAddress(wallet.publicKey).toLowerCase();
    getCalls.length = 0;
    await getCuratorInvitations(derived);
    await getCommunityTeamInvitations({ slug: "bitcoin", teamId: 3, viewer: derived });
    expect(getCalls[0]?.path).toBe(`/curators/${derived}/invitations`);
    expect(getCalls[1]?.path).toBe("/communities/bitcoin/teams/3/invitations");
    for (const call of getCalls) {
      expect(call.params).toHaveProperty("viewer", derived);
      expect(call.params).not.toHaveProperty("address");
      expect(call.params).toHaveProperty("pubkey");
      expect(call.params).toHaveProperty("signature");
      expect(call.params).toHaveProperty("timestamp");
      expect(call.params).toHaveProperty("envelope_nonce");
    }
    expect(getCalls[0]?.params?.envelope_nonce).not.toBe(getCalls[1]?.params?.envelope_nonce);
  });

  test("no wallet or mismatch throws before HTTP", async () => {
    getCalls.length = 0;
    walletResult = null;
    await expect(getCuratorInvitations("mirage1viewer")).rejects.toBeInstanceOf(SignedCuratorReadError);
    walletResult = makeWallet();
    await expect(getCuratorInvitations("mirage1other")).rejects.toBeInstanceOf(SignedCuratorReadError);
    expect(getCalls).toEqual([]);
  });

  test("retry policy and abort forwarding", async () => {
    expect(shouldRetryCuratorRead(0, { status: 400 })).toBe(false);
    expect(shouldRetryCuratorRead(0, { status: 401 })).toBe(false);
    expect(shouldRetryCuratorRead(0, { status: 403 })).toBe(false);
    expect(shouldRetryCuratorRead(0, { status: 404 })).toBe(false);
    expect(shouldRetryCuratorRead(0, { status: 500 })).toBe(true);
    expect(shouldRetryCuratorRead(2, { status: 500 })).toBe(false);
    const wallet = makeWallet();
    walletResult = wallet;
    const derived = deriveAddress(wallet.publicKey).toLowerCase();
    const controller = new AbortController();
    getCalls.length = 0;
    await getCommunityTeamModeration({
      slug: "bitcoin",
      teamId: 3,
      viewer: derived,
      postIds: ["aa".repeat(32)],
    }, { signal: controller.signal });
    expect(getCalls[0]?.signal).toBe(controller.signal);
    expect(getCalls[0]?.params?.post_ids).toBe("aa".repeat(32));
  });

  test("batch fetch is one request per chunk and missing rows stay unknown", async () => {
    const wallet = makeWallet();
    walletResult = wallet;
    const derived = deriveAddress(wallet.publicKey).toLowerCase();
    getCalls.length = 0;
    const requested = ["aa".repeat(32), "bb".repeat(32)];
    const result = await fetchModerationBatches(
      [{ community: "bitcoin", team_id: 3, post_ids: requested }],
      derived,
    );
    expect(result.requests).toBe(1);
    expect(result.itemsByPostId.has("aa".repeat(32))).toBe(true);
    expect(result.itemsByPostId.has("bb".repeat(32))).toBe(false);
    expect(result.itemsByPostId.get("aa".repeat(32))?.post_tag).toBeNull();
  });
});
