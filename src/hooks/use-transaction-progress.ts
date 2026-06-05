/**
 * useTransactionProgress Hook
 *
 * Manages the state for transaction progress modal during PoW operations.
 * Provides a clean interface for tracking transaction phases and showing
 * progress to the user.
 *
 * Usage:
 * ```tsx
 * const {
 *   progress,
 *   startTransaction,
 *   setPhase,
 *   updatePoWProgress,
 *   setSuccess,
 *   setError,
 *   reset,
 *   isVisible,
 * } = useTransactionProgress();
 *
 * // In mutation
 * startTransaction();
 * const result = await setUsername(wallet, { username }, updatePoWProgress);
 * setSuccess(result.tx_hash);
 * ```
 */

import { useState, useCallback, useRef } from "react";
import * as Sentry from "@sentry/react-native";
import { waitForQueueDrain, usePowQueueStore } from "@/src/services/pow-queue";
import { getApiErrorMessage } from "@/src/utils/parse-api-error";
import type {
  TransactionPhase,
  TransactionProgress,
} from "@/src/components/molecules/transaction-progress-modal";
import type { PoWProgress } from "@/src/api/write";

// ============================================
// Types
// ============================================

export interface UseTransactionProgressReturn {
  /** Current transaction progress state */
  progress: TransactionProgress;
  /** Whether the modal should be visible */
  isVisible: boolean;
  /** Start a new transaction (shows modal, sets to preparing) */
  startTransaction: () => void;
  /** Set the current phase */
  setPhase: (phase: TransactionPhase) => void;
  /** Update PoW progress (callback for write operations) */
  updatePoWProgress: (powProgress: PoWProgress) => void;
  /** Mark transaction as successful */
  setSuccess: (txHash?: string) => void;
  /** Mark transaction as failed with error */
  setError: (error: string) => void;
  /** Reset to idle state and hide modal */
  reset: () => void;
  /** Hide modal (for dismissing after success/error) */
  hideModal: () => void;
}

// ============================================
// Initial State
// ============================================

const INITIAL_PROGRESS: TransactionProgress = {
  phase: "idle",
  powProgress: undefined,
  error: undefined,
  txHash: undefined,
};

// ============================================
// Hook
// ============================================

export function useTransactionProgress(): UseTransactionProgressReturn {
  const [progress, setProgress] = useState<TransactionProgress>(INITIAL_PROGRESS);
  const [isVisible, setIsVisible] = useState(false);
  
  // Track if we've auto-set to computing phase for PoW
  const hasSetComputing = useRef(false);

  /**
   * Start a new transaction
   * Shows modal and sets phase to preparing
   */
  const startTransaction = useCallback(() => {
    hasSetComputing.current = false;
    setProgress({
      phase: "preparing",
      powProgress: undefined,
      error: undefined,
      txHash: undefined,
    });
    setIsVisible(true);
  }, []);

  /**
   * Set the current phase
   */
  const setPhase = useCallback((phase: TransactionPhase) => {
    setProgress((prev) => ({
      ...prev,
      phase,
      // Clear PoW progress when not in computing phase
      powProgress: phase === "computing" ? prev.powProgress : undefined,
    }));
  }, []);

  /**
   * Update PoW progress
   * This is designed to be passed directly to write operations
   */
  const updatePoWProgress = useCallback((powProgress: PoWProgress) => {
    // Auto-switch to computing phase on first PoW update
    if (!hasSetComputing.current) {
      hasSetComputing.current = true;
    }

    setProgress((prev) => ({
      ...prev,
      phase: "computing",
      powProgress: {
        attempts: powProgress.attempts,
        elapsedMs: powProgress.elapsedMs,
        estimatedTotalMs: powProgress.estimatedTotalMs,
      },
    }));
  }, []);

  /**
   * Mark transaction as successful
   */
  const setSuccess = useCallback((txHash?: string) => {
    setProgress((prev) => ({
      ...prev,
      phase: "success",
      txHash,
      error: undefined,
    }));
  }, []);

  /**
   * Mark transaction as failed
   */
  const setError = useCallback((error: string) => {
    setProgress((prev) => ({
      ...prev,
      phase: "error",
      error,
    }));
  }, []);

  /**
   * Reset to idle state
   */
  const reset = useCallback(() => {
    hasSetComputing.current = false;
    setProgress(INITIAL_PROGRESS);
    setIsVisible(false);
  }, []);

  /**
   * Hide modal without resetting state
   * Useful for dismissing after viewing success/error
   */
  const hideModal = useCallback(() => {
    setIsVisible(false);
    // Reset state after a delay (for animation)
    setTimeout(() => {
      setProgress(INITIAL_PROGRESS);
      hasSetComputing.current = false;
    }, 300);
  }, []);

  return {
    progress,
    isVisible,
    startTransaction,
    setPhase,
    updatePoWProgress,
    setSuccess,
    setError,
    reset,
    hideModal,
  };
}

// ============================================
// Helper: Execute with Progress Tracking
// ============================================

/**
 * Helper type for transaction executor function
 */
export type TransactionExecutor<TInput, TResult> = (
  input: TInput,
  onPoWProgress?: (progress: PoWProgress) => void
) => Promise<TResult>;

/**
 * Execute a transaction with automatic progress tracking
 *
 * Usage:
 * ```tsx
 * const { progress, isVisible, ...controls } = useTransactionProgress();
 *
 * const handleSubmit = async () => {
 *   await executeWithProgress(
 *     controls,
 *     async (onProgress) => {
 *       const result = await setUsername(wallet, { username }, onProgress);
 *       return result.tx_hash;
 *     },
 *     {
 *       pollTxStatus: true,
 *       getTxStatus: (hash) => getTxStatus({ hash }),
 *     }
 *   );
 * };
 * ```
 */
export async function executeWithProgress<TResult extends string | { tx_hash: string }>(
  controls: Pick<
    UseTransactionProgressReturn,
    "startTransaction" | "setPhase" | "updatePoWProgress" | "setSuccess" | "setError"
  >,
  executor: (onPoWProgress: (progress: PoWProgress) => void) => Promise<TResult>,
  options?: {
    /** Whether to poll for transaction confirmation */
    pollTxStatus?: boolean;
    /** Function to get tx status (required if pollTxStatus is true) */
    getTxStatus?: (hash: string) => Promise<{
      found: boolean;
      indexed: boolean;
      success?: boolean;
      error_details?: string;
    }>;
    /** Polling interval in ms (default: 2000) */
    pollInterval?: number;
    /** Max polling attempts (default: 30) */
    maxPollAttempts?: number;
  }
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const { startTransaction, setPhase, updatePoWProgress, setSuccess, setError } = controls;
  const {
    pollTxStatus = false,
    getTxStatus,
    pollInterval = 2000,
    maxPollAttempts = 30,
  } = options || {};

  try {
    // Start transaction
    startTransaction();

    const powState = usePowQueueStore.getState();
    if (powState.isProcessing || powState.queue.length > 0 || powState.currentAction) {
      setPhase("waiting");
      await waitForQueueDrain();
    }

    // Execute with PoW progress tracking
    const result = await executor(updatePoWProgress);
    const txHash = typeof result === "string" ? result : result.tx_hash;

    // If not polling, mark as success immediately
    if (!pollTxStatus || !getTxStatus) {
      setSuccess(txHash);
      return { success: true, txHash };
    }

    // Poll for confirmation
    setPhase("confirming");

    let attempts = 0;
    while (attempts < maxPollAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      try {
        const status = await getTxStatus(txHash);

        if (status.found && status.indexed) {
          if (status.success === false) {
            setError(status.error_details || "Transaction failed");
            return { success: false, txHash, error: status.error_details };
          }
          setSuccess(txHash);
          return { success: true, txHash };
        }
      } catch {
        // Ignore polling errors, keep trying
      }

      attempts++;
    }

    // Timeout - but transaction was submitted
    setSuccess(txHash);
    return { success: true, txHash };
  } catch (err) {
    Sentry.captureException(err, { tags: { feature: "transaction-progress" } });
    let errorMessage = err instanceof Error ? err.message : "Transaction failed";
    const responseData = (err as any)?.response?.data;
    const isTransportNetworkError =
      (err as any)?.code === "ERR_NETWORK" ||
      (err as any)?.message === "Network Error";
    if (isTransportNetworkError) {
      errorMessage = "No internet connection";
    } else if (responseData && typeof responseData === "object") {
      errorMessage = getApiErrorMessage(err);
    } else if (typeof responseData === "string" && responseData.trim()) {
      errorMessage = responseData;
    }
    setError(errorMessage);
    return { success: false, error: errorMessage };
  }
}
