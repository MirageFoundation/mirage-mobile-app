// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const posts: unknown[] = [];

mock.module("../src/api/client", () => ({
  api: {
    post: async (path: string, body: unknown) => {
      posts.push({ path, body });
      return { tx_hash: "DEADBEEF", code: 0, height: 0, raw_log: "" };
    },
    get: async () => ({}),
  },
  apiClient: {},
}));

mock.module("../src/api/write/signing", () => ({
  buildSignedEnvelope: async ({ payloadFields }) => ({
    pubkey: "pk",
    signature: "sig",
    timestamp: 1,
    last_block_hash: "",
    pow_difficulty: 0,
    pow: 0,
    envelope_nonce: "1",
    ...payloadFields,
  }),
  canonBaseClaimCreatorRewards: () => new Uint8Array(),
}));

mock.module("../src/api/write/utils/retry-pow", () => ({
  withPowRetry: async (operation: () => Promise<unknown>) => operation(),
}));

const { claimCreatorRewards } = await import("../src/api/write/endpoints/creator-earnings");

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

const wallet = {
  address: "MIRAGE1CREATOR",
  publicKey: new Uint8Array(33),
  privateKey: new Uint8Array(32),
  mnemonic: "",
};

describe("creator claim write contract", () => {
  test("canonical path, mutation key, resume skip, and no target field", () => {
    const endpoint = source("src/api/write/endpoints/creator-earnings.ts");
    expect(endpoint).toContain('"/core/claim_creator_rewards"');
    expect(endpoint).toContain("epoch_ids");
    expect(endpoint).toContain("withPowRetry");
    expect(endpoint).toContain("buildSignedEnvelope");
    expect(endpoint).toContain("resumeTxHash");
    expect(endpoint).toContain("if (!txHash)");
    expect(endpoint).toContain('sort: "epoch_desc"');
    expect(endpoint).toContain("claimable_only: false");
    expect(endpoint).not.toContain("target:");
    expect(source("src/api/write/hooks/use-claim-creator-rewards.ts")).toContain(
      "mutationKeys.creatorEarnings.claim()",
    );
    expect(source("src/api/write/signing/canonical.ts")).toContain("canonBaseClaimCreatorRewards");
    expect(source("src/api/write/signing/canonical.ts")).toContain('prefix("MsgClaimCreatorRewards")');
  });

  test("POST body epoch_ids are numeric ascending with envelope fields", async () => {
    posts.length = 0;
    await claimCreatorRewards(wallet, [3, 5, 9]);
    expect(posts).toHaveLength(1);
    expect(posts[0].path).toBe("/core/claim_creator_rewards");
    expect(posts[0].body.epoch_ids).toEqual([3, 5, 9]);
    expect(posts[0].body.pubkey).toBe("pk");
    expect(posts[0].body).not.toHaveProperty("target");
  });
});
