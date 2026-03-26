/**
 * Report Mutation Hook
 */

import { useMutation } from "@tanstack/react-query";
import { mutationKeys } from "@/src/api/write/mutation-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { report, type ReportInput } from "../endpoints/moderation";
import type { PoWProgress } from "../signing";

// ============================================
// Types
// ============================================

export interface UseReportOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

// ============================================
// Report Hook
// ============================================

/**
 * Hook for reporting content
 *
 * Reports are stored in the database, not on-chain.
 * Still requires PoW for spam prevention.
 */
export function useReport(options: UseReportOptions = {}) {
  const { getWallet } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.report(),
    mutationFn: async (input: ReportInput) => {
      const wallet = await getWallet();
      return report(wallet, input, options.onPoWProgress);
    },
    // Reports don't affect any cached data
  });
}
