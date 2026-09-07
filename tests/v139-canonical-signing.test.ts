// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const {
  canonBaseBlockCommunity,
  canonBaseGiftSubscription,
  canonBaseJoinCommunity,
  canonBaseLeaveCommunity,
  canonBasePost,
  canonBaseSubscribe,
  canonBaseUnblockCommunity,
} = await import("../src/api/write/signing/canonical");

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const COMMUNITY_ENVELOPE = {
  pubkey33: hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
  lastBlockHashBytes: hexToBytes(
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ),
  difficulty: 21,
  timestampMs: 1_750_000_000,
  envelopeNonce: 7n,
};

const LEGACY_MOBILE_ENVELOPE = {
  pubkey33: hexToBytes("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  lastBlockHashBytes: hexToBytes(
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ),
  difficulty: 21,
  timestampMs: 1_750_000_000_000,
  envelopeNonce: 7n,
};

const LEGACY_MOBILE_PAID_ENVELOPE = {
  ...LEGACY_MOBILE_ENVELOPE,
  difficulty: 0,
};

const POST_NO_MEDIA_HEX =
  "6d69726167652e636f72652e76313a4d7367506f73740002210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f817980320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680b883a1f73207076400650a746563686e6f6c6f6779660c4c6567616379207469746c65670b4c656761637920626f647968006a01";

const POST_TWO_MEDIA_HEX =
  "6d69726167652e636f72652e76313a4d7367506f73740002210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f817980320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680b883a1f73207076400650a746563686e6f6c6f6779660c4c6567616379207469746c65670b4c656761637920626f64796800691968747470733a2f2f6578616d706c652e636f6d2f612e6a7067691968747470733a2f2f6578616d706c652e636f6d2f622e6d70346a01";

const JOIN_MODE_0_HEX =
  "6d69726167652e636f72652e76313a4d73674a6f696e436f6d6d756e697479000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f677965006600";

const JOIN_MODE_1_TEAM_4_HEX =
  "6d69726167652e636f72652e76313a4d73674a6f696e436f6d6d756e697479000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f677965016604";

const JOIN_MODE_2_RAW_HEX =
  "6d69726167652e636f72652e76313a4d73674a6f696e436f6d6d756e697479000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f677965026600";

const LEAVE_COMMUNITY_HEX =
  "6d69726167652e636f72652e76313a4d73674c65617665436f6d6d756e697479000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f6779";

const BLOCK_COMMUNITY_HEX =
  "6d69726167652e636f72652e76313a4d7367426c6f636b436f6d6d756e697479000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640c6d6972616765316f776e6572650a746563686e6f6c6f6779";

const UNBLOCK_COMMUNITY_HEX =
  "6d69726167652e636f72652e76313a4d7367556e626c6f636b436f6d6d756e697479000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640c6d6972616765316f776e6572650a746563686e6f6c6f6779";

const SELF_SUBSCRIBE_ONE_PERIOD_HEX =
  "6d69726167652e636f72652e76313a4d73675375627363726962650002210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f817980320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04000680b883a1f732070764016601";

const SELF_SUBSCRIBE_THREE_PERIODS_HEX =
  "6d69726167652e636f72652e76313a4d73675375627363726962650002210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f817980320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04000680b883a1f732070764016603";

const GIFT_SUBSCRIBE_ONE_PERIOD_HEX =
  "6d69726167652e636f72652e76313a4d73675375627363726962650002210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f817980320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04000680b883a1f73207076401650b6d697261676531676966746601";

describe("v1.39 canonical MsgPost", () => {
  test("encodes a modern root post with no media and protocol tag 106", () => {
    const bytes = canonBasePost({
      ...LEGACY_MOBILE_ENVELOPE,
      target: "",
      community: "technology",
      title: "Legacy title",
      content: "Legacy body",
      tag: "",
    });
    expect(toHex(bytes)).toBe(POST_NO_MEDIA_HEX);
  });

  test("encodes two repeated media tag-105 fields then protocol tag 106", () => {
    const bytes = canonBasePost({
      ...LEGACY_MOBILE_ENVELOPE,
      target: "",
      community: "technology",
      title: "Legacy title",
      content: "Legacy body",
      tag: "",
      media: ["https://example.com/a.jpg", "https://example.com/b.mp4"],
    });
    expect(toHex(bytes)).toBe(POST_TWO_MEDIA_HEX);
  });
});

describe("v1.39 canonical MsgJoinCommunity", () => {
  test("encodes mode 0/default", () => {
    expect(
      toHex(canonBaseJoinCommunity({ ...COMMUNITY_ENVELOPE, community: "technology" })),
    ).toBe(JOIN_MODE_0_HEX);
    expect(
      toHex(
        canonBaseJoinCommunity({
          ...COMMUNITY_ENVELOPE,
          community: "technology",
          mode: 0,
          pinnedTeamId: 0,
        }),
      ),
    ).toBe(JOIN_MODE_0_HEX);
  });

  test("encodes mode 1 with pinned team 4", () => {
    expect(
      toHex(
        canonBaseJoinCommunity({
          ...COMMUNITY_ENVELOPE,
          community: "technology",
          mode: 1,
          pinnedTeamId: 4,
        }),
      ),
    ).toBe(JOIN_MODE_1_TEAM_4_HEX);
  });

  test("encodes mode 2/raw", () => {
    expect(
      toHex(
        canonBaseJoinCommunity({
          ...COMMUNITY_ENVELOPE,
          community: "technology",
          mode: 2,
          pinnedTeamId: 0,
        }),
      ),
    ).toBe(JOIN_MODE_2_RAW_HEX);
  });
});

describe("v1.39 canonical community leave/block/unblock", () => {
  test("encodes leave community", () => {
    expect(
      toHex(canonBaseLeaveCommunity({ ...COMMUNITY_ENVELOPE, community: "technology" })),
    ).toBe(LEAVE_COMMUNITY_HEX);
  });

  test("encodes block community with nonempty lowercased signer target", () => {
    expect(
      toHex(
        canonBaseBlockCommunity({
          ...COMMUNITY_ENVELOPE,
          target: "mirage1owner",
          community: "technology",
        }),
      ),
    ).toBe(BLOCK_COMMUNITY_HEX);
  });

  test("encodes unblock community with nonempty lowercased signer target", () => {
    expect(
      toHex(
        canonBaseUnblockCommunity({
          ...COMMUNITY_ENVELOPE,
          target: "mirage1owner",
          community: "technology",
        }),
      ),
    ).toBe(UNBLOCK_COMMUNITY_HEX);
  });
});

describe("v1.39 canonical MsgSubscribe", () => {
  test("encodes a modern self subscription for one period", () => {
    expect(
      toHex(
        canonBaseSubscribe({
          ...LEGACY_MOBILE_PAID_ENVELOPE,
          level: 1,
          periodCount: 1,
        }),
      ),
    ).toBe(SELF_SUBSCRIBE_ONE_PERIOD_HEX);
  });

  test("encodes a modern self subscription for three periods", () => {
    expect(
      toHex(
        canonBaseSubscribe({
          ...LEGACY_MOBILE_PAID_ENVELOPE,
          level: 1,
          periodCount: 3,
        }),
      ),
    ).toBe(SELF_SUBSCRIBE_THREE_PERIODS_HEX);
  });

  test("encodes a modern gift subscription with target and period_count tag 102", () => {
    expect(
      toHex(
        canonBaseGiftSubscription({
          ...LEGACY_MOBILE_PAID_ENVELOPE,
          level: 1,
          target: "mirage1gift",
          periodCount: 1,
        }),
      ),
    ).toBe(GIFT_SUBSCRIBE_ONE_PERIOD_HEX);
  });
});
