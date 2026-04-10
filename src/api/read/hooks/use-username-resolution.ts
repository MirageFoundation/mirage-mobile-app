import { useQuery } from "@tanstack/react-query";
import {
  getAddressFromUsername,
  getUsernameFromAddress,
  bulkGetUsernameFromAddress,
  getUsers,
  type GetUsersParams,
} from "../endpoints/users";
import { queryKeys } from "../query-keys";

/**
 * Resolve username to address
 * Useful for checking username availability
 *
 * @param username - The username to resolve
 */
export function useAddressFromUsername(username: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.addressFromUsername(username!),
    queryFn: () => getAddressFromUsername({ username: username! }),
    enabled: !!username && username.length >= 2,
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
  const isEnabled = !!username && username.length >= 2;
  const anonUsername = `anon-${username ?? "__disabled__"}`;

  return useQuery({
    queryKey: queryKeys.addressFromUsername(anonUsername),
    queryFn: () => getAddressFromUsername({ username: anonUsername }),
    enabled: isEnabled,
    staleTime: 0,
    gcTime: 0,
  });
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

export function useBatchUsernamesFromAddresses(addresses: string[]) {
  const stableKey = addresses.slice().sort().join(",");
  return useQuery({
    queryKey: ["batchUsernames", stableKey],
    queryFn: async () => {
      if (addresses.length === 0) return {};
      const resp = await bulkGetUsernameFromAddress(addresses);
      return resp.map ?? {};
    },
    enabled: addresses.length > 0,
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
