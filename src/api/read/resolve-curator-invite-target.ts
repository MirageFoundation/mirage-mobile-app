import type { QueryClient } from "@tanstack/react-query";
import { isValidAddress } from "@/src/wallet/address";
import { getAddressFromUsername } from "./endpoints/users";
import { queryKeys } from "./query-keys";
import { normalizeUsernameIdentity } from "./username-resolution";

export class CuratorInviteTargetError extends Error {}

export async function resolveCuratorInviteTarget(queryClient: QueryClient, raw: string): Promise<string> {
  const target = normalizeUsernameIdentity(raw.trim().replace(/^@+/, ""));
  if (!target) throw new CuratorInviteTargetError("Enter username or address");
  if (isValidAddress(target)) return target;
  if (target.startsWith("mirage1") || /^[a-z0-9]+1[ac-hj-np-z02-9]{30,}$/.test(target)) {
    throw new CuratorInviteTargetError("Invalid wallet address");
  }
  if (!/^[a-z0-9_-]+$/.test(target)) throw new CuratorInviteTargetError("Invalid username format");

  let response;
  try {
    response = await queryClient.fetchQuery({
      queryKey: queryKeys.addressFromUsername(target),
      queryFn: () => getAddressFromUsername({ username: target }),
      staleTime: 0,
      gcTime: 0,
      retry: false,
    });
  } catch {
    throw new CuratorInviteTargetError("Username lookup failed");
  }
  if (response?.exists === false) throw new CuratorInviteTargetError("Username not found");
  const address = typeof response?.address === "string" ? response.address.trim().toLowerCase() : "";
  if (response?.exists !== true || !isValidAddress(address) || typeof response.username !== "string" ||
      normalizeUsernameIdentity(response.username) !== target) {
    throw new CuratorInviteTargetError("Invalid lookup response");
  }
  return address;
}
