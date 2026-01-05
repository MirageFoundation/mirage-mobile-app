import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getParameters, getConfig } from "../endpoints/parameters";
import { useAuthStore } from "@/src/stores";

/**
 * Get latest block hash and PoW difficulty for signing
 * Also returns balance if wallet is connected
 *
 * staleTime: 0 (always fresh for signing operations)
 */
export function useParameters() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.parameters(walletAddress ?? undefined),
    queryFn: () =>
      getParameters(walletAddress ? { address: walletAddress } : undefined),
    staleTime: 0, // Always fresh for signing
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get chain configuration, tier info, validator info
 * Safe to cache for longer periods
 *
 * staleTime: 5 minutes
 */
export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config(),
    queryFn: () => getConfig(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
