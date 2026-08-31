import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../query-keys"; 
import {
  getRewardSummary,
  getAchievements,
  type GetRewardSummaryParams,
  type RewardSummaryResponse,
} from "../endpoints/rewards";
import { useAuthStore } from "@/src/stores";

export function useRewardSummary(
  params?: Omit<GetRewardSummaryParams, "address">,
  options?: { enabled?: boolean },
) {
  // Same persisted identity bootstrap writes into `rewardSummary`. `user`
  // is filled later, so a user-keyed query misses the hydrated quests
  // payload and the home card pops in after a second /rewards/summary fetch.
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.rewardSummary(walletAddress!),
    queryFn: async () => {
      const data = await getRewardSummary({
        address: walletAddress!,
        ...params,
      });
      if (data.disabled) {
        const cached = queryClient.getQueryData<RewardSummaryResponse>(queryKeys.rewardSummary(walletAddress!));
        if (cached && (cached.daily_quests?.length ?? 0) > 0) {
          return cached;
        }
      }
      return data;
    },
    enabled:
      !!walletAddress &&
      isLoggedIn &&
      !isInitializing &&
      (options?.enabled ?? true),
    // Hydrated from `bootstrap` (`rewards_summary`) on startup; explicit
    // refetch() on the quests screen bypasses staleTime when freshness matters.
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

export function useRewardSummaryByAddress(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rewardSummary(address!),
    queryFn: () =>
      getRewardSummary({
        address: address!,
      }),
    enabled: !!address,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

export function useAchievements() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.achievements(walletAddress!),
    queryFn: () =>
      getAchievements({
        address: walletAddress!,
      }),
    enabled: !!walletAddress,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });
}

export function useAchievementsByAddress(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.achievements(address!),
    queryFn: () =>
      getAchievements({
        address: address!,
      }),
    enabled: !!address,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });
}
