// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
/**
 * Exact MsgClaimCreatorRewards hex vector is blocked: upstream
 * shared/testdata/canon_v139_vectors.json has no MsgClaimCreatorRewards fixture.
 * Do not invent an expected hex. Structural prefix/header/tag-100 order is covered here.
 */
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const { canonBaseClaimCreatorRewards } = await import("../src/api/write/signing/canonical");

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

function readUvarint(buf: Uint8Array, idx: number): [bigint, number] {
  let n = 0n;
  let shift = 0n;
  while (true) {
    const b = BigInt(buf[idx++]);
    n |= (b & 0x7fn) << shift;
    if ((b & 0x80n) === 0n) break;
    shift += 7n;
  }
  return [n, idx];
}

const ENVELOPE = {
  pubkey33: hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
  lastBlockHashBytes: hexToBytes(
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ),
  difficulty: 21,
  timestampMs: 1_750_000_000,
  envelopeNonce: 7n,
};

describe("MsgClaimCreatorRewards canonical structure", () => {
  test("prefix and repeated tag-100 epoch ids follow envelope fields with no target", () => {
    const bytes = canonBaseClaimCreatorRewards({
      ...ENVELOPE,
      epoch_ids: [3, 5, 9],
    });
    const prefix = "mirage.core.v1:MsgClaimCreatorRewards";
    const prefixBytes = new TextEncoder().encode(prefix);
    expect(Array.from(bytes.slice(0, prefixBytes.length))).toEqual(Array.from(prefixBytes));
    expect(bytes[prefixBytes.length]).toBe(0);

    let i = prefixBytes.length + 1;
    expect(bytes[i]).toBe(2);
    i += 1;
    let len: bigint;
    [len, i] = readUvarint(bytes, i);
    i += Number(len);
    expect(bytes[i]).toBe(3);
    i += 1;
    [len, i] = readUvarint(bytes, i);
    i += Number(len);
    expect(bytes[i]).toBe(4);
    i += 1;
    [, i] = readUvarint(bytes, i);
    expect(bytes[i]).toBe(6);
    i += 1;
    [, i] = readUvarint(bytes, i);
    expect(bytes[i]).toBe(7);
    i += 1;
    [, i] = readUvarint(bytes, i);

    const tags: number[] = [];
    const values: number[] = [];
    while (i < bytes.length) {
      const tag = bytes[i++];
      tags.push(tag);
      let value: bigint;
      [value, i] = readUvarint(bytes, i);
      values.push(Number(value));
    }
    expect(tags).toEqual([100, 100, 100]);
    expect(values).toEqual([3, 5, 9]);
    expect(tags.includes(101)).toBe(false);
  });
});
