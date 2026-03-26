/**
 * useSetUsername Hook
 *
 * Mutation hook for setting username
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { mutationKeys } from "@/src/api/write/mutation-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { useAuthStore } from "@/src/stores";
import { setUsername, type SetUsernameInput } from "../endpoints/username";
import type { PoWProgress } from "../signing";

// ============================================
// Types
// ============================================

export interface UseSetUsernameOptions {
  /** Callback for PoW progress */
  onPoWProgress?: (progress: PoWProgress) => void;
}

// ============================================
// Hook
// ============================================

/**
 * Hook for setting username
 *
 * Usage:
 * ```tsx
 * const { mutate, isPending } = useSetUsername();
 *
 * const handleSetUsername = () => {
 *   mutate({ username: "myname" });
 * };
 * ```
 */
export function useSetUsername(options: UseSetUsernameOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();
  const setHasUsername = useAuthStore((s) => s.setHasUsername);

  return useMutation({
    mutationKey: mutationKeys.setUsername(),
    mutationFn: async (input: SetUsernameInput) => {
      const wallet = await getWallet();
      return setUsername(wallet, input, options.onPoWProgress);
    },
    onSuccess: (data) => {
      // Update local state
      setHasUsername(true);

      // Invalidate related queries
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }

      return data.tx_hash;
    },
  });
}
