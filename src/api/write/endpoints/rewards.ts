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
  amount?: number;
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
        target: wallet.address,
        questId,
      },
      onPoWProgress,
    });

    return api.post<ClaimRewardResponse>("/rewards/claim", payload);
  }, "claimReward");
}
