import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/src/api/read/query-keys";
import type { DailyQuota, RenewalWarning } from "@/src/domain/communities";
import {
  decideRelay,
  parseDailyQuota,
  parseRenewalWarning,
  type RelayDecision,
} from "@/src/domain/subscriptions";
import type { UserStatusResponse } from "@/src/api/types";

export type AccountStatusSnapshot = {
  incomplete?: true;
  daily_quota?: DailyQuota | null;
  renewal_warning?: RenewalWarning | null;
};

export function parseAccountStatusSnapshot(input: {
  daily_quota?: DailyQuota | null;
  renewal_warning?: RenewalWarning | null;
}): AccountStatusSnapshot {
  return {
    ...(input.daily_quota !== undefined ? { daily_quota: parseDailyQuota(input.daily_quota) } : {}),
    ...(input.renewal_warning !== undefined ? { renewal_warning: parseRenewalWarning(input.renewal_warning) } : {}),
  };
}

export function hydrateAccountStatus(
  queryClient: QueryClient,
  address: string,
  snapshot: AccountStatusSnapshot,
): void {
  const key = queryKeys.accountStatus(address);
  const complete = snapshot.daily_quota !== undefined && snapshot.renewal_warning !== undefined;
  const previous = queryClient.getQueryData<AccountStatusSnapshot>(key);
  queryClient.setQueryData(key, complete ? snapshot : { ...previous, ...snapshot, incomplete: true }, complete ? undefined : {
    updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt ?? 0,
  });
}

export function getAccountStatusSnapshot(
  queryClient: QueryClient,
  address: string,
): AccountStatusSnapshot | undefined {
  return queryClient.getQueryData<AccountStatusSnapshot>(queryKeys.accountStatus(address));
}

export function invalidateAccountStatus(
  queryClient: QueryClient,
  address: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.accountStatus(address),
  });
}

export function invalidateAccountSnapshot(
  queryClient: QueryClient,
  address: string,
): Promise<void[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.userStatus(address) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.profile(address) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.accountStatus(address) }),
  ]);
}

export function getCachedRelayDecision(
  queryClient: QueryClient,
  address: string,
  fallback?: { userLevel?: number | null; effectivePaid?: boolean | null },
): RelayDecision {
  const status = queryClient.getQueryData<UserStatusResponse>(queryKeys.userStatus(address));
  const snapshot = getAccountStatusSnapshot(queryClient, address);
  return decideRelay({
    userLevel: status?.user_level ?? fallback?.userLevel,
    effectivePaid: status?.effective_paid ?? fallback?.effectivePaid,
    quota: snapshot?.daily_quota ?? null,
  });
}
