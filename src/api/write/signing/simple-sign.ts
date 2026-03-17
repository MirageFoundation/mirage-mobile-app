import { b64encode, signCanonical } from "@/src/wallet";
import type { MirageWallet } from "@/src/wallet";

function randomUint32(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] ?? 0;
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function generateNonce(): number {
  const timestampNs = BigInt(Date.now()) * 1000000n;
  const nonce = timestampNs + BigInt(randomUint32());
  return Number(nonce > 0n ? nonce : BigInt(Date.now()) * 1000n + BigInt(randomUint32()));
}

export interface SimpleSignedPayload {
  pubkey: string;
  signature: string;
  timestamp: number;
  envelope_nonce: number;
}

export function buildSimpleSignedPayload(
  wallet: MirageWallet,
  message: string,
): SimpleSignedPayload {
  const timestamp = Date.now();
  const nonce = generateNonce();

  const fullMessage = message
    .replace("{timestamp}", timestamp.toString())
    .replace("{nonce}", nonce.toString());

  const messageBytes = new TextEncoder().encode(fullMessage);
  const signature = signCanonical(wallet.privateKey, messageBytes);

  return {
    pubkey: b64encode(wallet.publicKey),
    signature: b64encode(signature),
    timestamp,
    envelope_nonce: nonce,
  };
}
