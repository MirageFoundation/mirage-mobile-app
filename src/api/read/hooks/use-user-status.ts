import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getUserStatus, getProfile } from "../endpoints/users";
import { useAuthStore } from "@/src/stores";

/**
 * Get current user's status (tier, balance, subscription, recent votes)
 * Only enabled when wallet is connected
 *
 * staleTime: 30 seconds
 * Invalidate after write mutations
 */
export function useUserStatus() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const isInitializing = useAuthStore((s) => s.isInitializing);

  return useQuery({
    queryKey: queryKeys.userStatus(walletAddress!),
    queryFn: () => getUserStatus({ address: walletAddress! }),
    enabled: !!walletAddress && !isInitializing,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get any user's status by address
 *
 * @param address - The address to fetch status for
 */
export function useUserStatusByAddress(address: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.userStatus(address!),
    queryFn: () => getUserStatus({ address: address! }),
    enabled: !!address,
    staleTime: 1000 * 30, // 30 seconds
  });
}

/**
 * Get current user's full profile
 * Only enabled when wallet is connected
 *
 * staleTime: 1 minute
 */
export function useProfile() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.profile(walletAddress!),
    queryFn: () => getProfile({ address: walletAddress! }),
    enabled: !!walletAddress,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get any user's profile by address
 *
 * @param address - The address to fetch profile for
 */
export function useProfileByAddress(address: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.profile(address!),
    queryFn: () => getProfile({ address: address! }),
    enabled: !!address,
    staleTime: 1000 * 60, // 1 minute
  });
}
