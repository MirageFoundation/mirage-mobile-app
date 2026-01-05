import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import {
  getAddressFromUsername,
  getUsernameFromAddress,
  getUsers,
  type GetUsersParams,
} from "../endpoints/users";

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
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
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
