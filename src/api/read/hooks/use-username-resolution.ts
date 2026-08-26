import { useQueries, useQuery } from "@tanstack/react-query";
import {
  getAddressFromUsername,
  getUsernameFromAddress,
  bulkGetUsernameFromAddress,
  getUsers,
  type GetUsersParams,
} from "../endpoints/users";
import { queryKeys } from "../query-keys";
import {
  buildUsernameResolutionCandidates,
  normalizeUsernameIdentity,
  selectUsernameResolution,
} from "../username-resolution";
import { useAuthStore } from "@/src/stores";

/**
 * Resolve username to address
 * Useful for checking username availability
 *
 * @param username - The username to resolve
 */
export function useAddressFromUsername(username: string | undefined | null) {
  const normalizedUsername = normalizeUsernameIdentity(username);

  return useQuery({
    queryKey: queryKeys.addressFromUsername(normalizedUsername),
    queryFn: () => getAddressFromUsername({ username: normalizedUsername }),
    enabled: normalizedUsername.length >= 2,
    staleTime: 0,
    gcTime: 0,
  });
}

/**
 * Check username availability for both regular and anon- prefixed versions
 * Returns available only if BOTH username and anon-{username} are available
 *
 * @param username - The username to check availability for
 */
export function useUsernameAvailability(username: string | undefined | null) {
  const candidates = buildUsernameResolutionCandidates(username);
  const isEnabled = (candidates[0]?.length ?? 0) >= 2;
  const results = useQueries({
    queries: isEnabled
      ? candidates.map((candidate) => ({
          queryKey: queryKeys.addressFromUsername(candidate),
          queryFn: () => getAddressFromUsername({ username: candidate }),
          staleTime: 0,
          gcTime: 0,
        }))
      : [],
  });
  const isError = results.some((result) => result.isError);
  const isFetched =
    results.length > 0 && results.every((result) => result.isFetched);

  return {
    data:
      isFetched && !isError
        ? selectUsernameResolution(
            candidates,
            results.map((result) => result.data),
          )
        : undefined,
    isLoading: results.some((result) => result.isLoading),
    isFetching: results.some((result) => result.isFetching),
    isFetched,
    isError,
    error: results.find((result) => result.error)?.error ?? null,
    refetch: () => Promise.all(results.map((result) => result.refetch())),
  };
}

/**
 * Resolve address to username
 *
 * @param address - The address to resolve
 */
export function useUsernameFromAddress(address: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.usernameFromAddress(address!),
    queryFn: () => getUsernameFromAddress({ address: address! }),
    enabled: !!address,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useBatchUsernamesFromAddresses(
  addresses: string[],
  options?: { enabled?: boolean },
) {
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const stableKey = addresses.slice().sort().join(",");
  return useQuery({
    queryKey: queryKeys.batchUsernames(stableKey),
    queryFn: async () => {
      if (addresses.length === 0) return {};
      const resp = await bulkGetUsernameFromAddress(addresses);
      return resp.map ?? {};
    },
    enabled:
      !isInitializing &&
      !isBootstrapping &&
      addresses.length > 0 &&
      (options?.enabled ?? true),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });
}

/**
 * Get paginated list of users
 */
export function useUsers(params?: GetUsersParams) {
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => getUsers(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
