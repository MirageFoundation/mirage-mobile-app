// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const getCalls: { path: string; params?: Record<string, unknown> }[] = [];
let walletResult: unknown = null;

mock.module("../src/api/client", () => ({
  api: {
    get: async (path: string, params?: Record<string, unknown>, options?: any) => {
      if (options?.paramsFactory) params = await options.paramsFactory();
      getCalls.push({ path, params });
      if (path === "/get_comments") {
        if (params?.post_id === "root") {
          return {
            root: { post_id: "root", comments: 1, children: [] },
            children: [{ post_id: "child", comments: 1, children: [] }],
          };
        }
        return {
          root: { post_id: params?.post_id, comments: 0, children: [] },
          children: [{ post_id: "leaf", comments: 0, children: [] }],
        };
      }
      return { posts: [], total: 0, page: 1, limit: 10, has_more: false };
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
  getPosts,
  getUserPosts,
  getComments,
} = await import("../src/api/read/endpoints/posts");
const { search } = await import("../src/api/read/endpoints/search");
const { getBootstrap } = await import("../src/api/read/endpoints/bootstrap");
const {
  shouldRetrySignedContentRead,
  SignedContentReadError,
} = await import("../src/api/read/signed-content-read");
const { buildSignedReadPayload } = await import("../src/api/signing/simple-sign");

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

function expectCompleteProof(params: Record<string, unknown> | undefined, action: string) {
  expect(params).toBeDefined();
  for (const field of ["address", "pubkey", "signature", "timestamp", "envelope_nonce"]) {
    expect(params).toHaveProperty(field);
    expect(params![field]).not.toBe("");
    expect(params![field]).not.toBeUndefined();
  }
  expect(params!.address).toBe(String(params!.address).toLowerCase());
  expect(Number(params!.timestamp)).toBeGreaterThan(10_000_000_000);
  expect(buildSignedReadPayload(
    action,
    String(params!.address),
    Number(params!.timestamp),
    params!.envelope_nonce as number,
  )).toBe(
    `${action}:${params!.address}:${params!.timestamp}:${params!.envelope_nonce}`,
  );
}

describe("signed content requests", () => {
  test("omits proof fields for a true guest query", async () => {
    getCalls.length = 0;
    walletResult = makeWallet();
    await getPosts({ community: "bitcoin", limit: 10 });

    expect(getCalls).toHaveLength(1);
    expect(getCalls[0]?.path).toBe("/get_posts");
    expect(getCalls[0]?.params).toEqual({ community: "bitcoin", limit: 10 });
    expect(getCalls[0]?.params).not.toHaveProperty("address");
    expect(getCalls[0]?.params).not.toHaveProperty("pubkey");
    expect(getCalls[0]?.params).not.toHaveProperty("signature");
  });

  test("throws locally before network I/O when address has no wallet", async () => {
    getCalls.length = 0;
    walletResult = null;
    await expect(getPosts({ address: "mirage1viewer" })).rejects.toBeInstanceOf(
      SignedContentReadError,
    );
    expect(getCalls).toEqual([]);
  });

  test("throws locally before network I/O on address mismatch", async () => {
    getCalls.length = 0;
    walletResult = makeWallet();
    await expect(getPosts({ address: "mirage1other" })).rejects.toBeInstanceOf(
      SignedContentReadError,
    );
    expect(getCalls).toEqual([]);
  });

  test("ignores caller-supplied partial proof fields and sends a complete get_posts proof", async () => {
    getCalls.length = 0;
    const wallet = makeWallet();
    walletResult = wallet;
    const derived = deriveAddress(wallet.publicKey).toLowerCase();

    await getPosts({
      address: derived,
      pubkey: "partial",
      signature: "partial",
      feed: "home",
    } as never);

    expect(getCalls).toHaveLength(1);
    expect(getCalls[0]?.params?.pubkey).not.toBe("partial");
    expect(getCalls[0]?.params?.signature).not.toBe("partial");
    expect(getCalls[0]?.params?.address).toBe(derived);
    expectCompleteProof(getCalls[0]?.params, "get_posts");
  });

  test("signs feed, search, profile, and non-thread bootstrap with get_posts", async () => {
    const wallet = makeWallet();
    walletResult = wallet;
    const derived = deriveAddress(wallet.publicKey).toLowerCase();

    getCalls.length = 0;
    await getPosts({ address: derived, feed: "home" });
    await getUserPosts({ owner: derived, address: derived });
    await search({ q: "bitcoin", type: "communities", address: derived });
    await getBootstrap({ address: derived, view: "feed:home" });

    expect(getCalls.map((call) => call.path)).toEqual([
      "/get_posts",
      "/get_user_posts",
      "/search",
      "/bootstrap",
    ]);
    for (const call of getCalls) {
      expectCompleteProof(call.params, "get_posts");
    }
    expect(getCalls[2]?.params?.type).toBe("communities");
  });

  test("signs comments and bootstrap thread views with get_comments", async () => {
    const wallet = makeWallet();
    walletResult = wallet;
    const derived = deriveAddress(wallet.publicKey).toLowerCase();

    getCalls.length = 0;
    await getComments({
      post_id: "root",
      address: derived,
      lens: "team",
      team_id: 3,
      scope: "current",
    });
    await getBootstrap({ address: derived, view: "thread:abc" });

    const commentCalls = getCalls.filter((call) => call.path === "/get_comments");
    const bootstrapCall = getCalls.find((call) => call.path === "/bootstrap");
    expect(commentCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of commentCalls) {
      expectCompleteProof(call.params, "get_comments");
      expect(call.params?.lens).toBe("team");
      expect(call.params?.team_id).toBe(3);
      expect(call.params).not.toHaveProperty("scope");
    }
    expect(commentCalls[0]?.params?.envelope_nonce).not.toBe(
      commentCalls[1]?.params?.envelope_nonce,
    );
    expectCompleteProof(bootstrapCall?.params, "get_comments");
  });

  test("does not retry 400/401/403/404 and never falls back unsigned after 401", () => {
    for (const status of [300, 301, 302, 303, 304, 307, 308, 399]) {
      expect(shouldRetrySignedContentRead(0, { response: { status } })).toBe(false);
    }
    expect(shouldRetrySignedContentRead(0, { response: { status: 400 } })).toBe(false);
    expect(shouldRetrySignedContentRead(0, { response: { status: 401 } })).toBe(false);
    expect(shouldRetrySignedContentRead(0, { response: { status: 403 } })).toBe(false);
    expect(shouldRetrySignedContentRead(0, { response: { status: 404 } })).toBe(false);
    expect(shouldRetrySignedContentRead(0, { response: { status: 503 } })).toBe(true);
    expect(shouldRetrySignedContentRead(2, { code: "ERR_NETWORK" })).toBe(false);
  });
});
