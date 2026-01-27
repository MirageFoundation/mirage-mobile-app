/**
 * Vote Write Endpoint
 *
 * POST /core/vote
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseVote } from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";

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
 */
export async function vote(
  wallet: MirageWallet,
  input: VoteInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const { target, direction } = input;

  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseVote,
      payloadFields: {
        target,
        direction,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/vote", payload);
  }, "Vote");
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
