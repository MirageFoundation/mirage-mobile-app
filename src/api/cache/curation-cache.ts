import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import type { TeamModerationItem, TeamModerationResponse } from "@/src/domain/communities";

function invalidateFamilies(
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[],
): Promise<void[]> {
  return Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export function patchSettledModerationLeaf(
  queryClient: QueryClient,
  input: {
    community: string;
    teamId: string | number;
    viewer?: string | null;
    postIds: readonly string[];
    postId: string;
    patch: Partial<Pick<TeamModerationItem, "post_hidden" | "user_hidden" | "thread_locked" | "post_tag">>;
  },
): void {
  const queryKey = queryKeys.communityTeamModeration(
    input.community,
    input.teamId,
    input.viewer,
    input.postIds,
  );
  const current = queryClient.getQueryData<TeamModerationResponse>(queryKey);
  if (!current?.items) return;
  const postId = input.postId.toLowerCase();
  queryClient.setQueryData<TeamModerationResponse>(queryKey, {
    ...current,
    items: current.items.map((item) =>
      item.post_id === postId ? { ...item, ...input.patch } : item,
    ),
  });
}

export function invalidateAfterCurationTeamChange(
  queryClient: QueryClient,
  input: { community: string; teamId?: string | number; address?: string | null },
): Promise<void[]> {
  const keys: (readonly unknown[])[] = [
    queryKeys.curationRoot(),
    queryKeys.communityTeamsRoot(input.community),
    queryKeys.communityDetailRoot(input.community),
    queryKeys.communitiesRoot(),
  ];
  if (input.teamId != null) {
    keys.push(queryKeys.communityTeamDetailRoot(input.community, input.teamId));
  }
  if (input.address) {
    keys.push(queryKeys.curatorCommunities(input.address));
  }
  return invalidateFamilies(queryClient, keys);
}

export function invalidateAfterCurationInviteChange(
  queryClient: QueryClient,
  input: {
    community: string;
    teamId: string | number;
    address?: string | null;
    target?: string | null;
  },
): Promise<void[]> {
  const keys: (readonly unknown[])[] = [
    queryKeys.curationRoot(),
    queryKeys.curatorInvitationsRoot(),
    queryKeys.communityTeamInvitationsRoot(input.community, input.teamId),
    queryKeys.communityTeamDetailRoot(input.community, input.teamId),
    queryKeys.communityTeamsRoot(input.community),
  ];
  if (input.address) keys.push(queryKeys.curatorInvitations(input.address));
  if (input.target) {
    keys.push(queryKeys.curatorInvitations(input.target));
    keys.push(queryKeys.curatorCommunities(input.target));
  }
  if (input.address) keys.push(queryKeys.curatorCommunities(input.address));
  return invalidateFamilies(queryClient, keys);
}

export function invalidateAfterCurationMembershipChange(
  queryClient: QueryClient,
  input: { community: string; teamId: string | number; address?: string | null },
): Promise<void[]> {
  const keys: (readonly unknown[])[] = [
    queryKeys.curationRoot(),
    queryKeys.communityTeamDetailRoot(input.community, input.teamId),
    queryKeys.communityTeamsRoot(input.community),
    queryKeys.communityDetailRoot(input.community),
  ];
  if (input.address) keys.push(queryKeys.curatorCommunities(input.address));
  return invalidateFamilies(queryClient, keys);
}

export function invalidateAfterCurationModerationChange(
  queryClient: QueryClient,
  input: {
    community: string;
    teamId: string | number;
    kind: "post" | "user" | "lock" | "post_tag";
  },
): Promise<void[]> {
  const keys: (readonly unknown[])[] = [
    queryKeys.communityTeamModerationRoot(input.community, input.teamId),
    queryKeys.postsRoot(),
    queryKeys.commentsRoot(),
    queryKeys.searchRoot(),
  ];
  if (input.kind === "post") {
    keys.push(queryKeys.communityTeamHiddenPostsRoot(input.community, input.teamId));
    keys.push(queryKeys.userPostsRoot());
    keys.push(queryKeys.inboxRoot());
  }
  if (input.kind === "user") {
    keys.push(queryKeys.communityTeamHiddenUsersRoot(input.community, input.teamId));
    keys.push(queryKeys.userPostsRoot());
  }
  if (input.kind === "lock") {
    keys.push(queryKeys.inboxRoot());
  }
  return invalidateFamilies(queryClient, keys);
}

export function invalidateAfterCurationTeamSettingsChange(
  queryClient: QueryClient,
  input: { community: string; teamId: string | number },
): Promise<void[]> {
  return invalidateFamilies(queryClient, [
    queryKeys.communityTeamDetailRoot(input.community, input.teamId),
    queryKeys.communityTeamsRoot(input.community),
    queryKeys.communityDetailRoot(input.community),
    queryKeys.postsRoot(),
  ]);
}
