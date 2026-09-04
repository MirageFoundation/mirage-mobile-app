import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import { claimReward, type ClaimRewardResponse } from "../endpoints/rewards";
import { invalidateRewardSummary } from "@/src/api/cache/reward-summary-cache";
import { queryKeys } from "@/src/api/read/query-keys";
import { useAuthStore } from "@/src/stores";
import { mutationKeys } from "../mutation-keys";
import * as Sentry from "@sentry/react-native";

interface UseClaimRewardOptions {
  onSuccess?: (data: ClaimRewardResponse) => void;
  onError?: (error: Error) => void;
}

export function useClaimReward(options?: UseClaimRewardOptions) {
  const { getWallet } = useWallet();
  const queryClient = useQueryClient();
  const walletAddress = useAuthStore((s) => s.walletAddress);

  return useMutation({
    mutationKey: mutationKeys.rewards.claim(),
    mutationFn: async () => {
      const wallet = await getWallet();
      return claimReward(wallet);
    },
    onSuccess: (data) => {
      if (walletAddress) {
        void invalidateRewardSummary(queryClient, walletAddress);
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
