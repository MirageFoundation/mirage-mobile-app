import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getTxStatus } from "../endpoints/tx";

/**
 * Get transaction status
 * Useful for one-time status checks
 *
 * @param txHash - Transaction hash
 */
export function useTxStatus(txHash: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.txStatus(txHash!),
    queryFn: () => getTxStatus({ hash: txHash! }),
    enabled: !!txHash,
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Poll for transaction confirmation
 * Stops polling when transaction is found and indexed
 *
 * @param txHash - Transaction hash to poll for
 *
 * Polling Strategy:
 * - Poll every 2 seconds
 * - Stop when transaction is found AND indexed
 * - Use `initialDelay` of 4 seconds after submitting (handled by caller)
 */
export function useTxStatusPolling(txHash: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.txStatus(txHash!),
    queryFn: () => getTxStatus({ hash: txHash! }),
    enabled: !!txHash,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000; // Keep polling if no data

      // Stop polling when transaction is found and indexed
      if (data.found && data.indexed) {
        return false;
      }

      return 2000; // Continue polling every 2 seconds
    },
    refetchIntervalInBackground: false,
    staleTime: 0, // Always refetch when polling
  });
}

/**
 * Hook to wait for transaction confirmation with callbacks
 *
 * Usage:
 * ```
 * const { startPolling, status, isConfirmed, error } = useTxConfirmation();
 *
 * // After submitting transaction
 * await submitTx();
 * startPolling(txHash);
 *
 * // In useEffect or callback
 * if (isConfirmed) {
 *   // Handle success
 * }
 * ```
 */
export function useTxConfirmation(initialHash?: string | null) {
  const query = useTxStatusPolling(initialHash);

  const isConfirmed =
    query.data?.found && query.data?.indexed && query.data?.success;
  const isFailed =
    query.data?.found && query.data?.indexed && !query.data?.success;
  const isPending = !query.data?.found || !query.data?.indexed;

  return {
    ...query,
    isConfirmed,
    isFailed,
    isPending: query.isLoading || (query.data && isPending),
    errorDetails: query.data?.error_details,
    txType: query.data?.tx_type,
    details: query.data?.details,
  };
}
