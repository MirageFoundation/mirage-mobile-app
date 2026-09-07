import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import {
  getNetworkStats,
  getCirculationStats,
  getAppStats,
  getWelcomeStats,
  getLeaderboard,
  getPeers,
  type GetLeaderboardParams,
} from "../endpoints/stats";

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
