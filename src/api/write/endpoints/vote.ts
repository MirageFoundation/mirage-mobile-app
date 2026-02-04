/**
 * Vote Write Endpoint
 *
 * POST /core/vote
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseVote } from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";

// ============================================
// Types
// ============================================

export type VoteDirection = 1 | 0 | -1;

export interface VoteInput {
  /** txhash of post/comment to vote on */
  target: string;
  /** Vote direction: 1 (upvote), 0 (remove vote), -1 (downvote) */
  direction: VoteDirection;
}

// ============================================
// Endpoint
// ============================================

/**
 * Vote on a post or comment
 *
 * @param wallet - Wallet to sign with
 * @param input - Target and direction
 * @param onPoWProgress - Optional callback for PoW progress
 * @returns Write response with tx_hash
 */
const MAX_POW_RETRIES = 2;

export async function vote(
  wallet: MirageWallet,
  input: VoteInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const { target, direction } = input;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_POW_RETRIES; attempt++) {
    try {
      const payload = await buildSignedEnvelope({
        wallet,
        baseBuilder: canonBaseVote,
        payloadFields: {
          target,
          direction,
        },
        onPoWProgress,
      });

      return await api.post<WriteResponse>("/core/vote", payload);
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error || error?.message || "";
      if (errorMsg.includes("insufficient pow") && attempt < MAX_POW_RETRIES) {
        console.log(`[Vote] PoW rejected (attempt ${attempt + 1}/${MAX_POW_RETRIES + 1}), retrying with fresh params...`);
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("Vote failed after retries");
}

/**
 * Upvote a post or comment
 */
export async function upvote(
  wallet: MirageWallet,
  target: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return vote(wallet, { target, direction: 1 }, onPoWProgress);
}

/**
 * Downvote a post or comment
 */
export async function downvote(
  wallet: MirageWallet,
  target: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return vote(wallet, { target, direction: -1 }, onPoWProgress);
}

/**
 * Remove vote from a post or comment
 */
export async function removeVote(
  wallet: MirageWallet,
  target: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return vote(wallet, { target, direction: 0 }, onPoWProgress);
}
