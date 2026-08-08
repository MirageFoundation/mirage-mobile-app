/**
 * Rewards Write Endpoints
 *
 * POST /rewards/claim - Claim completed quest rewards
 *
 * v1.32.3: claim is a signed write. The server verifies a plain-payload
 * signature over `rewards_claim:<owner-lowercased>:<timestamp>:<nonce>`
 * (SHA-256 digest, compact 64-byte secp256k1 r||s, base64). Unsigned or
 * unverifiable claims are only served during the grace period, which ends
 * 2026-10-05 — after that they hard-401. No PoW and no chain envelope are
 * involved; retries must re-sign with a fresh timestamp and nonce because
 * the server rejects replayed envelope nonces.
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSimpleSignedPayload } from "@/src/api/signing/simple-sign";
import { getErrorMessage, isKnownErrorCode } from "@/src/utils/error-messages";

export interface ClaimRewardResponse {
  success: boolean;
  rewards?: { type: string; amount: number; raw_amount: number; multiplier: number }[];
  balance?: number;
  tx_hash?: string;
  error?: string;
  error_code?: string;
  message?: string;
}

/**
 * Claim pending quest rewards.
 *
 * Signs `rewards_claim:<owner>:<timestamp>:<nonce>` with the wallet key.
 * Each call produces a fresh signature, so callers may safely retry by
 * calling again (never by replaying a previous request body).
 */
export async function claimReward(
  wallet: MirageWallet,
): Promise<ClaimRewardResponse> {
  const owner = wallet.address.toLowerCase();

  const signed = buildSimpleSignedPayload(
    wallet,
    `rewards_claim:${owner}:{timestamp}:{nonce}`,
  );

  const response = await api.post<ClaimRewardResponse>("/rewards/claim", {
    owner,
    ...signed,
  });

  // `no_rewards` is intentionally returned as HTTP 200 by the node. Do not
  // let TanStack Query or the quest screen interpret any success:false body as
  // a successful payout.
  if (!response.success) {
    const errorCode = response.error_code ?? response.error ?? "payout_failed";
    const message = isKnownErrorCode(errorCode)
      ? getErrorMessage(errorCode)
      : response.message ?? "Failed to claim rewards. Please try again.";
    throw Object.assign(new Error(message), {
      response: {
        status: 200,
        data: { ...response, error_code: errorCode },
      },
    });
  }

  return response;
}
