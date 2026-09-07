import { useQueryClient } from "@tanstack/react-query";

import type { CommunityTeamsResponse } from "@/src/domain/communities";
import { matchesCreatedTeam, type SettledCurationWriteResult } from "../utils/curation-model";
import { applyCurationSettledEffects } from "../utils/curation-settled-effects";

export function useCheckCreatedTeam(
  refetch: () => Promise<{ data?: CommunityTeamsResponse; isError: boolean }>,
) {
  const queryClient = useQueryClient();

  return async (result: SettledCurationWriteResult, owner: string) => {
    const response = await refetch();
    if (response.isError) throw new Error("Team status unavailable");
    if (!response.data || !matchesCreatedTeam(response.data, { owner, name: result.name ?? "" })) {
      return false;
    }
    applyCurationSettledEffects(queryClient, {
      ...result,
      settlement: { status: "settled", value: response.data },
    }, owner);
    return true;
  };
}
