import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { invalidateAccountSnapshot } from "@/src/api/cache/account-status-cache";

function invalidateFamilies(
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[],
): Promise<void[]> {
  return Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export async function invalidateAfterCreatorClaimSettled(
  queryClient: QueryClient,
  creator: string,
): Promise<void> {
  await invalidateFamilies(queryClient, [
    queryKeys.creatorEarningsRoot(),
    queryKeys.creatorEarningsTargetsRoot(),
    queryKeys.parameters(creator),
  ]);
  await invalidateAccountSnapshot(queryClient, creator);
}

export function creatorClaimInvalidationKeys(creator: string): readonly (readonly unknown[])[] {
  return [
    queryKeys.creatorEarningsRoot(),
    queryKeys.creatorEarningsTargetsRoot(),
    queryKeys.userStatus(creator),
    queryKeys.profile(creator),
    queryKeys.accountStatus(creator),
    queryKeys.parameters(creator),
  ];
}


