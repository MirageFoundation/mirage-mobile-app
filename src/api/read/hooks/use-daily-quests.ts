import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getDailyQuests, getPendingRewards, type GetDailyQuestsParams } from "../endpoints/quests";
import { useAuthStore } from "@/src/stores";

export function useDailyQuests(params?: Omit<GetDailyQuestsParams, "address">) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.dailyQuests(walletAddress!),
    queryFn: () =>
      getDailyQuests({
        address: walletAddress!,
        ...params,
      }),
    enabled: !!walletAddress,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useDailyQuestsByAddress(address: string | undefined) {
 return useQuery({
   queryKey: queryKeys.dailyQuests(address!),
   queryFn: () =>
     getDailyQuests({
       address: address!,
     }),
   enabled: !!address,
   staleTime: 1000 * 60,
   gcTime: 1000 * 60 * 5,
 });
}

export function usePendingRewards() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.pendingRewards(walletAddress!),
    queryFn: () =>
      getPendingRewards({
        address: walletAddress!,
      }),
    enabled: !!walletAddress,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 5,
  });
}

export function usePendingRewardsByAddress(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pendingRewards(address!),
    queryFn: () =>
      getPendingRewards({
        address: address!,
      }),
    enabled: !!address,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });
}
