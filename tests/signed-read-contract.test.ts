// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const { buildSignedReadParams, buildSignedReadPayload } = await import(
  "../src/api/signing/simple-sign"
);
const { b64decode, getCompressedPublicKey, verifySignature } = await import(
  "../src/wallet/crypto"
);
const { deriveAddress } = await import("../src/wallet/address");

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

function makeWallet(addressOverride?: string): MirageWallet {
  const privateKey = hexToBytes(
    "0000000000000000000000000000000000000000000000000000000000000001",
  );
  const publicKey = getCompressedPublicKey(privateKey);
  return {
    mnemonic: "",
    privateKey,
    publicKey,
    address: addressOverride ?? "SHOULD-NOT-BE-USED",
  };
}

describe("signed-read payload contract", () => {
  test("builds exact UTF-8 payloads for typed actions", () => {
    expect(buildSignedReadPayload("get_posts", "MIRAGE1VIEWER", 123, 7)).toBe(
      "get_posts:mirage1viewer:123:7",
    );
    expect(buildSignedReadPayload("get_comments", "mirage1viewer", 1_750_000_000_000, 9)).toBe(
      "get_comments:mirage1viewer:1750000000000:9",
    );
    expect(buildSignedReadPayload("curator_read", "  Mirage1Curator  ", 456, 8)).toBe(
      "curator_read:mirage1curator:456:8",
    );
  });
});

describe("signed-read proof params", () => {
  test("returns address/pubkey/signature/timestamp/envelope_nonce for each action", () => {
    const wallet = makeWallet();
    const derived = deriveAddress(wallet.publicKey).toLowerCase();

    for (const action of ["get_posts", "get_comments", "curator_read"] as const) {
      const proof = buildSignedReadParams(wallet, action);
      expect(Object.keys(proof).sort()).toEqual([
        "address",
        "envelope_nonce",
        "pubkey",
        "signature",
        "timestamp",
      ]);
      expect(proof.address).toBe(derived);
      expect(proof.address).not.toBe(wallet.address);
      expect(proof.address).toBe(proof.address.toLowerCase());
      expect(proof.timestamp).toBeGreaterThan(10_000_000_000);
      expect(typeof proof.envelope_nonce).toBe("number");
      expect(proof.envelope_nonce).toBeGreaterThan(0);

      const payload = buildSignedReadPayload(
        action,
        proof.address,
        proof.timestamp,
        proof.envelope_nonce,
      );
      expect(payload).toBe(
        `${action}:${derived}:${proof.timestamp}:${proof.envelope_nonce}`,
      );
      expect(
        verifySignature(
          b64decode(proof.signature),
          new TextEncoder().encode(payload),
          wallet.publicKey,
        ),
      ).toBe(true);
    }
  });
});
