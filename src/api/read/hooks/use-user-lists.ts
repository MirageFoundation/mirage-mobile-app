import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import {
  getUserFollowed,
  getUserBlocked,
  getPreferences,
  getSimilarUsers,
} from "../endpoints/users";
import { useAuthStore } from "@/src/stores";

/**
 * Get current user's followed users, topics, and enabled agents
 * Only enabled when wallet is connected
 */
export function useUserFollowed() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const hasOnboarded = useAuthStore((s) => s.hasOnboarded);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

  return useQuery({
    queryKey: queryKeys.userFollowed(walletAddress!),
    queryFn: () => getUserFollowed({ address: walletAddress! }),
    enabled:
      !!walletAddress &&
      isLoggedIn &&
      hasOnboarded &&
      !isInitializing &&
      !isBootstrapping,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Get any user's followed lists by address
 */
export function useUserFollowedByAddress(address: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.userFollowed(address!),
    queryFn: () => getUserFollowed({ address: address! }),
    enabled: !!address,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Get current user's blocked users and posts
 * Only enabled when wallet is connected
 */
export function useUserBlocked() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const hasOnboarded = useAuthStore((s) => s.hasOnboarded);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

  return useQuery({
    queryKey: queryKeys.userBlocked(walletAddress!),
    queryFn: () => getUserBlocked({ address: walletAddress! }),
    enabled:
      !!walletAddress &&
      isLoggedIn &&
      hasOnboarded &&
      !isInitializing &&
      !isBootstrapping,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useUserBlockedByAddress(address: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.userBlocked(address!),
    queryFn: () => getUserBlocked({ address: address! }),
    enabled: !!address,
    staleTime: 1000 * 60,
  });
}

/**
 * Get current user's personalized preferences
 * Only enabled when wallet is connected
 */
export function usePreferences() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.preferences(walletAddress!),
    queryFn: () => getPreferences({ address: walletAddress! }),
    enabled: !!walletAddress,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

export function usePreferencesByAddress(address: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.preferences(address!),
    queryFn: () => getPreferences({ address: address! }),
    enabled: !!address,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get similar users for current user
 * Only enabled when wallet is connected
 */
export function useSimilarUsers() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.similarUsers(walletAddress!),
    queryFn: () => getSimilarUsers({ address: walletAddress! }),
    enabled: !!walletAddress,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get similar users for a specific address
 */
export function useSimilarUsersByAddress(address: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.similarUsers(address!),
    queryFn: () => getSimilarUsers({ address: address! }),
    enabled: !!address,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
