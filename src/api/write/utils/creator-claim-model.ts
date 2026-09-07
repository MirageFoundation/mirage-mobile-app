import type { TxStatusResponse } from "@/src/api/types";
import {
  CREATOR_CLAIM_CONFIRM_TIMEOUT_MS,
  CREATOR_CLAIM_SYNC_TIMEOUT_MS,
  allSubmittedEpochsClaimed,
  type CreatorClaimPhase,
  type CreatorEarningItem,
  type CreatorEarningsResponse,
} from "@/src/domain/creator-earnings";
import type { WriteResponse } from "../signing";
import {
  waitForIndexedCondition,
  type IndexerSettlementResult,
  type WaitForIndexedConditionOptions,
} from "./indexer-settlement";

export class CreatorClaimExpectedError extends Error {
  readonly expected = true as const;

  constructor(message: string) {
    super(message);
    this.name = "CreatorClaimExpectedError";
  }
}

export class CreatorClaimRejectedError extends CreatorClaimExpectedError {
  constructor(message: string) {
    super(message);
    this.name = "CreatorClaimRejectedError";
  }
}

export type CreatorClaimTiming = Pick<
  WaitForIndexedConditionOptions<unknown>,
  "now" | "sleep" | "perReadTimeoutMs" | "delays" | "delayCapMs"
> & {
  signal?: AbortSignal;
  confirmTimeoutMs?: number;
  syncTimeoutMs?: number;
  onPhase?: (phase: CreatorClaimPhase) => void;
};

export type CreatorClaimSettleDeps = {
  getTxStatus: (hash: string, options?: { signal?: AbortSignal }) => Promise<TxStatusResponse>;
  fetchHistory: (
    options?: { signal?: AbortSignal },
  ) => Promise<CreatorEarningsResponse>;
};

export type SettledCreatorClaimResult = {
  delivery: WriteResponse;
  txHash: string;
  epochIds: number[];
  phase: Extract<
    CreatorClaimPhase,
    "settled" | "confirming_timeout" | "delivered_syncing_timeout" | "aborted"
  >;
  confirmSettlement: IndexerSettlementResult<TxStatusResponse>;
  historySettlement: IndexerSettlementResult<CreatorEarningsResponse> | null;
  rows: CreatorEarningItem[];
};

export function requireCreatorClaimTxHash(result: WriteResponse): string {
  const txHash = String(result.tx_hash ?? "").trim().toLowerCase();
  if (!txHash) {
    throw new Error("Creator claim response did not include a transaction hash");
  }
  return txHash;
}

export function parseTxErrorDetails(errorDetails: unknown): string {
  if (typeof errorDetails === "string" && errorDetails.trim()) {
    return errorDetails.trim();
  }
  if (errorDetails && typeof errorDetails === "object") {
    const record = errorDetails as Record<string, unknown>;
    for (const key of ["message", "error", "error_details"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "Creator claim was rejected by the chain";
}

export function assertCreatorClaimTxSucceeded(status: TxStatusResponse): void {
  const success = status.success === true;
  const codeOk = status.code == null || status.code === 0;
  if (!success || !codeOk) {
    throw new CreatorClaimRejectedError(parseTxErrorDetails(status.error_details));
  }
}

export function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError") {
    return true;
  }
  return error instanceof Error && (error.name === "AbortError" || error.message === "Aborted");
}

export function isExpectedCreatorClaimError(error: unknown): boolean {
  if (isAbortError(error)) return true;
  if (error instanceof CreatorClaimExpectedError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /claim window|already claimed|not claimable|eligibility|timed out waiting|indexing timed out/i.test(
    message,
  );
}

export function matchesClaimedHeight(
  page: CreatorEarningsResponse,
  epochIds: readonly number[],
): boolean {
  return allSubmittedEpochsClaimed(page.items, epochIds);
}

export async function settleCreatorClaim(
  input: {
    epochIds: number[];
    txHash: string;
    delivery: WriteResponse;
  } & CreatorClaimSettleDeps &
    CreatorClaimTiming,
): Promise<SettledCreatorClaimResult> {
  const txHash = String(input.txHash).trim().toLowerCase();
  const epochIds = input.epochIds;
  const waitTiming = {
    now: input.now,
    sleep: input.sleep,
    perReadTimeoutMs: input.perReadTimeoutMs,
    delays: input.delays,
    delayCapMs: input.delayCapMs,
  };

  input.onPhase?.("confirming");
  const confirmSettlement = await waitForIndexedCondition({
    ...waitTiming,
    signal: input.signal,
    overallTimeoutMs: input.confirmTimeoutMs ?? CREATOR_CLAIM_CONFIRM_TIMEOUT_MS,
    read: (signal) => input.getTxStatus(txHash, { signal }),
    matches: (status) => status.found === true,
  });

  if (confirmSettlement.status === "timeout") {
    return {
      delivery: input.delivery,
      txHash,
      epochIds,
      phase: "confirming_timeout",
      confirmSettlement,
      historySettlement: null,
      rows: [],
    };
  }

  assertCreatorClaimTxSucceeded(confirmSettlement.value!);

  input.onPhase?.("delivered_syncing");
  const historySettlement = await waitForIndexedCondition({
    ...waitTiming,
    signal: input.signal,
    overallTimeoutMs: input.syncTimeoutMs ?? CREATOR_CLAIM_SYNC_TIMEOUT_MS,
    read: (signal) => input.fetchHistory({ signal }),
    matches: (page) => matchesClaimedHeight(page, epochIds),
  });

  if (historySettlement.status === "timeout") {
    return {
      delivery: input.delivery,
      txHash,
      epochIds,
      phase: "delivered_syncing_timeout",
      confirmSettlement,
      historySettlement,
      rows: historySettlement.value?.items ?? [],
    };
  }

  return {
    delivery: input.delivery,
    txHash,
    epochIds,
    phase: "settled",
    confirmSettlement,
    historySettlement,
    rows: historySettlement.value?.items ?? [],
  };
}

export function abortedCreatorClaimResult(input: {
  delivery: WriteResponse;
  txHash: string;
  epochIds: number[];
}): SettledCreatorClaimResult {
  return {
    delivery: input.delivery,
    txHash: String(input.txHash).trim().toLowerCase(),
    epochIds: input.epochIds,
    phase: "aborted",
    confirmSettlement: { status: "timeout" },
    historySettlement: null,
    rows: [],
  };
}
