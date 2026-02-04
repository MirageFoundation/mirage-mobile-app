import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import {
  getNetworkStats,
  getCirculationStats,
  getAppStats,
  getWelcomeStats,
  getLeaderboard,
  getReferralStats,
  getPeers,
  type GetLeaderboardParams,
} from "../endpoints/stats";
import { useAuthStore } from "@/src/stores";

/**
 * Get network statistics including difficulty history
 *
 * staleTime: 1 minute
 */
export function useNetworkStats() {
  return useQuery({
    queryKey: queryKeys.networkStats(),
    queryFn: getNetworkStats,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get circulation statistics including top accounts
 *
 * staleTime: 5 minutes
 */
export function useCirculationStats() {
  return useQuery({
    queryKey: queryKeys.circulationStats(),
    queryFn: getCirculationStats,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get app-wide statistics
 *
 * staleTime: 5 minutes
 */
export function useAppStats() {
  return useQuery({
    queryKey: queryKeys.appStats(),
    queryFn: getAppStats,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useWelcomeStats() {
  return useQuery({
    queryKey: queryKeys.welcomeStats(),
    queryFn: getWelcomeStats,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 60,
  });
}

/**
 * Get leaderboard with customizable scoring
 *
 * @param params - Leaderboard parameters
 */
export function useLeaderboard(params?: GetLeaderboardParams) {
  return useQuery({
    queryKey: queryKeys.leaderboard(params?.days, params?.page),
    queryFn: () => getLeaderboard(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get current user's referral statistics
 * Only enabled when wallet is connected
 */
export function useReferralStats() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.referralStats(walletAddress!),
    queryFn: () => getReferralStats({ address: walletAddress! }),
    enabled: !!walletAddress,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get referral statistics for a specific address
 */
export function useReferralStatsByAddress(address: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.referralStats(address!),
    queryFn: () => getReferralStats({ address: address! }),
    enabled: !!address,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get list of network peers
 *
 * staleTime: 5 minutes
 */
export function usePeers() {
  return useQuery({
    queryKey: queryKeys.peers(),
    queryFn: getPeers,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}
