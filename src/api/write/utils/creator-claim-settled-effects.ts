import type { QueryClient } from "@tanstack/react-query";
import { invalidateAfterCreatorClaimSettled } from "@/src/api/cache/creator-earnings-cache";
import type { SettledCreatorClaimResult } from "./creator-claim-model";

export function applyCreatorClaimSettledEffects(
  queryClient: QueryClient,
  result: SettledCreatorClaimResult,
  address?: string | null,
): void {
  if (result.phase !== "settled") return;
  const creator = address?.trim().toLowerCase();
  if (!creator) return;
  void invalidateAfterCreatorClaimSettled(queryClient, creator);
}
