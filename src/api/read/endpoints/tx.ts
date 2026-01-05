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
  params: GetTxStatusParams
): Promise<TxStatusResponse> {
  return api.get<TxStatusResponse>("/core/get_tx_status", params);
}
