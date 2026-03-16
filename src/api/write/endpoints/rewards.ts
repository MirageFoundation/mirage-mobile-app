/**
 * Rewards Write Endpoints
 *
 * POST /rewards/claim - Claim completed quest rewards
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import {
  buildSignedEnvelope,
  canonBaseClaimReward,
} from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";

export interface ClaimRewardInput {
  questId: string;
}

export interface ClaimRewardResponse {
  success: boolean;
  rewards?: { type: string; amount: number; raw_amount: number; multiplier: number }[];
  balance?: number;
  tx_hash?: string;
  error?: string;
  message?: string;
}

/**
 * Claim a completed quest reward
 */
export async function claimReward(
  wallet: MirageWallet,
  input: ClaimRewardInput,
  onPoWProgress?: PoWProgressCallback
): Promise<ClaimRewardResponse> {
  const { questId } = input;

  return withPowRetry(async () => {
   const payload = await buildSignedEnvelope({
     wallet,
     baseBuilder: canonBaseClaimReward,
     payloadFields: {
        owner: wallet.address,
        target: wallet.address,
       questId,
     },
     onPoWProgress,
   });

    return api.post<ClaimRewardResponse>("/rewards/claim", payload);
  }, "claimReward");
}
