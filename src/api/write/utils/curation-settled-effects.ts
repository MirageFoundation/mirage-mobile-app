import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateAfterCurationInviteChange,
  invalidateAfterCurationMembershipChange,
  invalidateAfterCurationModerationChange,
  invalidateAfterCurationTeamChange,
  invalidateAfterCurationTeamSettingsChange,
  patchSettledModerationLeaf,
} from "@/src/api/cache/curation-cache";
import type { SettledCurationWriteResult } from "./curation-model";

export function applyCurationSettledEffects(
  queryClient: QueryClient,
  result: SettledCurationWriteResult,
  address?: string | null,
): void {
  if (result.settlement.status !== "settled" && !result.deliveryFallback) return;

  const community = result.community;
  const teamId = result.team_id;

  switch (result.operation) {
    case "create_team":
    case "delete_team":
    case "set_profile":
      void invalidateAfterCurationTeamChange(queryClient, {
        community,
        teamId,
        address,
      });
      return;
    case "invite":
    case "revoke":
    case "accept":
    case "decline":
      void invalidateAfterCurationInviteChange(queryClient, {
        community,
        teamId,
        address,
        target: result.target,
      });
      return;
    case "leave":
    case "remove":
    case "transfer":
      void invalidateAfterCurationMembershipChange(queryClient, {
        community,
        teamId,
        address,
      });
      return;
    case "subscriber_only":
    case "team_tag":
      void invalidateAfterCurationTeamSettingsChange(queryClient, {
        community,
        teamId,
      });
      return;
    case "hide_post":
    case "hide_user":
    case "lock_thread":
    case "post_tag": {
      if (result.target && result.operation !== "hide_user") {
        patchSettledModerationLeaf(queryClient, {
          community,
          teamId,
          viewer: address,
          postIds: [result.target],
          postId: result.target,
          patch: {
            ...(result.operation === "hide_post" && result.hidden != null
              ? { post_hidden: result.hidden }
              : {}),
            ...(result.operation === "lock_thread" && result.locked != null
              ? { thread_locked: result.locked }
              : {}),
            ...(result.operation === "post_tag"
              ? {
                  post_tag: result.clear ? null : (result.tag ?? ""),
                }
              : {}),
          },
        });
      }
      void invalidateAfterCurationModerationChange(queryClient, {
        community,
        teamId,
        kind:
          result.operation === "hide_post"
            ? "post"
            : result.operation === "hide_user"
              ? "user"
              : result.operation === "lock_thread"
                ? "lock"
                : "post_tag",
      });
    }
  }
}
