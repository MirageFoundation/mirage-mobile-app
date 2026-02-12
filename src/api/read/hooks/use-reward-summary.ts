import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getRewardSummary, getAchievements, type GetRewardSummaryParams } from "../endpoints/rewards";
import { useAuthStore } from "@/src/stores";

export function useRewardSummary(params?: Omit<GetRewardSummaryParams, "address">) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.rewardSummary(walletAddress!),
    queryFn: () =>
      getRewardSummary({
        address: walletAddress!,
        ...params,
      }),
    enabled: !!walletAddress,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
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
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
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
