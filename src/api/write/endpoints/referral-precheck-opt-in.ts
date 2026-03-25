import { api } from "@/src/api/client";
import { walletService } from "@/src/services/wallet-service";
import { signCanonical, b64encode } from "@/src/wallet";
import type { ReferralPrecheckOptInResponse } from "@/src/api/types";

export interface ReferralPrecheckOptInInput {
  enabled: boolean;
}

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

export async function referralPrecheckOptIn(
  input: ReferralPrecheckOptInInput
): Promise<ReferralPrecheckOptInResponse> {
  const wallet = await walletService.getWallet();
  if (!wallet) throw new Error("Wallet not available");

  const timestamp = Date.now();
  const envelope_nonce = generateNonce();
  const enabledFlag = input.enabled ? "1" : "0";

  const payloadString = `referrals_precheck_opt_in:${wallet.address.toLowerCase()}:${enabledFlag}:${timestamp}:${envelope_nonce}`;
  const payloadBytes = new TextEncoder().encode(payloadString);
  const signature = signCanonical(wallet.privateKey, payloadBytes);

  return api.post<ReferralPrecheckOptInResponse>("/referrals/precheck_opt_in", {
    pubkey: b64encode(wallet.publicKey),
    signature: b64encode(signature),
    address: wallet.address,
    enabled: input.enabled,
    timestamp,
    envelope_nonce,
  });
}
