import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateAfterCommunityBlockChange,
  invalidateAfterCommunityJoinOrLeave,
  invalidateAfterCommunityPreference,
} from "@/src/api/cache/community-social-cache";
import { trackEvent } from "@/src/services/analytics";
import { clearLensPickOnJoinSuccess } from "@/src/stores/lens-picks-store";
import type { SettledCommunityWriteResult } from "./community-membership-model";

export function applyCommunityMembershipSettledEffects(
  queryClient: QueryClient,
  result: SettledCommunityWriteResult,
  address: string | null | undefined,
): void {
  if (result.settlement.status !== "settled") return;

  const community = result.community;
  switch (result.operation) {
    case "join":
      void invalidateAfterCommunityJoinOrLeave(queryClient, { address, community });
      clearLensPickOnJoinSuccess(address, community);
      trackEvent("community_joined", {
        community,
        mode: result.mode,
        ...(result.pinned_team_id
          ? { pinned_team_id: result.pinned_team_id }
          : {}),
      });
      return;
    case "leave":
      void invalidateAfterCommunityJoinOrLeave(queryClient, { address, community });
      return;
    case "preference":
      void invalidateAfterCommunityPreference(queryClient, { community });
      clearLensPickOnJoinSuccess(address, community);
      return;
    case "block":
    case "unblock":
      void invalidateAfterCommunityBlockChange(queryClient, { address, community });
      return;
  }
}
