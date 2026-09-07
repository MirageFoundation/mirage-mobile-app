import { api } from "../../client";
import type { TxStatusResponse } from "../../types";

export interface GetTxStatusParams {
  hash: string;
}

/**
 * Get transaction status
 * Poll for confirmation after submitting transactions
 */
export async function getTxStatus(
  params: GetTxStatusParams,
  options?: { signal?: AbortSignal },
): Promise<TxStatusResponse> {
  return api.get<TxStatusResponse>(
    "/get_tx_status",
    { hash: String(params.hash ?? "").trim().toLowerCase() },
    options,
  );
}
