import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import { claimReward, type ClaimRewardInput, type ClaimRewardResponse } from "../endpoints/rewards";
import { queryKeys } from "@/src/api/read/query-keys";
import { useAuthStore } from "@/src/stores";
import type { PoWProgress } from "../signing";
import * as Sentry from "@sentry/react-native";

interface UseClaimRewardOptions {
  onSuccess?: (data: ClaimRewardResponse) => void;
  onError?: (error: Error) => void;
  onPoWProgress?: (progress: PoWProgress) => void;
}

export function useClaimReward(options?: UseClaimRewardOptions) {
  const { getWallet } = useWallet();
  const queryClient = useQueryClient();
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useMutation({
    mutationFn: async (input: ClaimRewardInput) => {
      const wallet = await getWallet();
      return claimReward(wallet, input, options?.onPoWProgress);
    },
    onSuccess: (data) => {
      if (walletAddress) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.rewardSummary(walletAddress),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(walletAddress),
        });
      }
      options?.onSuccess?.(data);
    },
    onError: (error: Error) => {
      Sentry.captureException(error, {
        tags: { feature: "rewards", operation: "claim-reward" },
      });
      options?.onError?.(error);
    },
  });
}
