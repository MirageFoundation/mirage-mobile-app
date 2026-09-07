import { api } from "@/src/api/client";
import { fetchCreatorEarningsPages } from "@/src/api/read/endpoints/creator-earnings";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import {
  CREATOR_EARNINGS_SETTLE_PAGE_LIMIT,
  normalizeClaimEpochs,
} from "@/src/domain/creator-earnings";
import type { MirageWallet } from "@/src/wallet/types";
import {
  buildSignedEnvelope,
  canonBaseClaimCreatorRewards,
  type PoWProgressCallback,
  type WriteResponse,
} from "../signing";
import { withPowRetry } from "../utils/retry-pow";
import { assertWriteDelivered } from "../utils/indexer-settlement";
import {
  abortedCreatorClaimResult,
  isAbortError,
  requireCreatorClaimTxHash,
  settleCreatorClaim,
  type CreatorClaimTiming,
  type SettledCreatorClaimResult,
} from "../utils/creator-claim-model";

export type ClaimCreatorRewardsInput = {
  epochIds: readonly number[];
  maxClaimEpochs: number;
  resumeTxHash?: string | null;
};

export async function claimCreatorRewards(
  wallet: MirageWallet,
  epochIds: number[],
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseClaimCreatorRewards,
      payloadFields: { epoch_ids: epochIds },
      onPoWProgress,
    });
    return api.post<WriteResponse>("/core/claim_creator_rewards", payload);
  }, "claimCreatorRewards");
}

export async function claimCreatorRewardsSettled(
  wallet: MirageWallet,
  input: ClaimCreatorRewardsInput,
  onPoWProgress?: PoWProgressCallback,
  timing: CreatorClaimTiming = {},
): Promise<SettledCreatorClaimResult> {
  const epochIds = normalizeClaimEpochs(input.epochIds, input.maxClaimEpochs);
  const creator = wallet.address.trim().toLowerCase();
  const resumeTxHash = String(input.resumeTxHash ?? "").trim().toLowerCase();
  let delivery: WriteResponse | null = null;
  let txHash = resumeTxHash;

  try {
    if (!txHash) {
      timing.onPhase?.("submitting");
      delivery = await claimCreatorRewards(wallet, epochIds, onPoWProgress);
      assertWriteDelivered(delivery);
      txHash = requireCreatorClaimTxHash(delivery);
    } else {
      delivery = {
        tx_hash: txHash,
        code: 0,
        height: 0,
        raw_log: "",
      };
    }

    return await settleCreatorClaim({
      epochIds,
      txHash,
      delivery,
      signal: timing.signal,
      now: timing.now,
      sleep: timing.sleep,
      perReadTimeoutMs: timing.perReadTimeoutMs,
      delays: timing.delays,
      delayCapMs: timing.delayCapMs,
      confirmTimeoutMs: timing.confirmTimeoutMs,
      syncTimeoutMs: timing.syncTimeoutMs,
      onPhase: timing.onPhase,
      getTxStatus: (hash, options) => getTxStatus({ hash }, options),
      fetchHistory: (options) =>
        fetchCreatorEarningsPages(
          {
            creator,
            claimable_only: false,
            sort: "epoch_desc",
            limit: CREATOR_EARNINGS_SETTLE_PAGE_LIMIT,
            stopEpochIds: epochIds,
          },
          options,
        ),
    });
  } catch (error) {
    if (isAbortError(error) && txHash && delivery) {
      return abortedCreatorClaimResult({ delivery, txHash, epochIds });
    }
    throw error;
  }
}

export type { SettledCreatorClaimResult };
