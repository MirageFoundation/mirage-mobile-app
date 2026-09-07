import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuthStore } from "@/src/stores";
import {
  chunkModerationPostIds,
  groupEligibleModerationPosts,
  type CuratorMembership,
  type ModerationPostInput,
  type TeamModerationItem,
} from "@/src/domain/communities";
import { queryKeys } from "../query-keys";
import {
  getCommunityTeam,
  getCommunityTeamHiddenPosts,
  getCommunityTeamHiddenUsers,
  getCommunityTeamInvitations,
  getCommunityTeamModeration,
  getCommunityTeams,
  getCuratorCommunities,
  getCuratorInvitations,
} from "../endpoints/curation";
import { shouldRetryCuratorRead } from "../signed-curator-read";

export function useCuratorCommunities(
  address?: string | null,
  options?: { enabled?: boolean },
) {
  const viewer = address?.trim().toLowerCase() ?? "";
  return useQuery({
    queryKey: queryKeys.curatorCommunities(viewer),
    queryFn: () => getCuratorCommunities(viewer),
    enabled: !!viewer && (options?.enabled ?? true),
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 4,
  });
}

export function useCuratorInvitations(
  address?: string | null,
  options?: { enabled?: boolean },
) {
  const viewer = address?.trim().toLowerCase() ?? "";
  return useQuery({
    queryKey: queryKeys.curatorInvitations(viewer),
    queryFn: ({ signal }) => getCuratorInvitations(viewer, { signal }),
    enabled: !!viewer && (options?.enabled ?? true),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 60,
    retry: (failureCount, error) => shouldRetryCuratorRead(failureCount, error),
  });
}

export function useCommunityTeams(
  slug: string | undefined | null,
  options?: { includeDeleted?: boolean; viewer?: string | null; enabled?: boolean },
) {
  const viewer = options?.viewer ?? undefined;
  return useQuery({
    queryKey: queryKeys.communityTeams(slug ?? "", {
      include_deleted: options?.includeDeleted,
      viewer,
    }),
    queryFn: () =>
      getCommunityTeams({
        slug: slug!,
        include_deleted: options?.includeDeleted,
        viewer,
      }),
    enabled: !!slug && (options?.enabled ?? true),
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 4,
  });
}

export function useCommunityTeam(
  slug: string | undefined | null,
  teamId: string | number | undefined | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.communityTeamDetail(slug ?? "", teamId ?? ""),
    queryFn: () => getCommunityTeam({ slug: slug!, teamId: teamId! }),
    enabled: !!slug && teamId != null && teamId !== "" && (options?.enabled ?? true),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 60 * 4,
  });
}

export function useCommunityTeamInvitations(
  slug: string | undefined | null,
  teamId: string | number | undefined | null,
  options?: { viewer?: string | null; enabled?: boolean },
) {
  const viewer = options?.viewer?.trim().toLowerCase() ?? "";
  return useQuery({
    queryKey: queryKeys.communityTeamInvitations(slug ?? "", teamId ?? "", viewer),
    queryFn: ({ signal }) =>
      getCommunityTeamInvitations(
        { slug: slug!, teamId: teamId!, viewer },
        { signal },
      ),
    enabled:
      !!slug
      && teamId != null
      && teamId !== ""
      && !!viewer
      && (options?.enabled ?? true),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 60,
    retry: (failureCount, error) => shouldRetryCuratorRead(failureCount, error),
  });
}

export function useCommunityTeamHiddenUsers(
  slug: string | undefined | null,
  teamId: string | number | undefined | null,
  params?: { offset?: number; limit?: number },
  options?: { viewer?: string | null; enabled?: boolean },
) {
  const viewer = options?.viewer?.trim().toLowerCase() ?? "";
  return useQuery({
    queryKey: queryKeys.communityTeamHiddenUsers(
      slug ?? "",
      teamId ?? "",
      viewer,
      params,
    ),
    queryFn: ({ signal }) =>
      getCommunityTeamHiddenUsers(
        {
          slug: slug!,
          teamId: teamId!,
          viewer,
          offset: params?.offset,
          limit: params?.limit,
        },
        { signal },
      ),
    enabled:
      !!slug
      && teamId != null
      && teamId !== ""
      && !!viewer
      && (options?.enabled ?? true),
    staleTime: 1000 * 30,
    retry: (failureCount, error) => shouldRetryCuratorRead(failureCount, error),
  });
}

export function useCommunityTeamHiddenPosts(
  slug: string | undefined | null,
  teamId: string | number | undefined | null,
  params?: { offset?: number; limit?: number },
  options?: { viewer?: string | null; enabled?: boolean },
) {
  const viewer = options?.viewer?.trim().toLowerCase() ?? "";
  return useQuery({
    queryKey: queryKeys.communityTeamHiddenPosts(
      slug ?? "",
      teamId ?? "",
      viewer,
      params,
    ),
    queryFn: ({ signal }) =>
      getCommunityTeamHiddenPosts(
        {
          slug: slug!,
          teamId: teamId!,
          viewer,
          offset: params?.offset,
          limit: params?.limit,
        },
        { signal },
      ),
    enabled:
      !!slug
      && teamId != null
      && teamId !== ""
      && !!viewer
      && (options?.enabled ?? true),
    staleTime: 1000 * 30,
    retry: (failureCount, error) => shouldRetryCuratorRead(failureCount, error),
  });
}

export function useBatchTeamModeration(
  posts: readonly ModerationPostInput[],
  options?: { memberships?: readonly CuratorMembership[]; enabled?: boolean },
) {
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const viewer = walletAddress?.trim().toLowerCase() ?? "";
  const groups = useMemo(
    () => groupEligibleModerationPosts({
      posts,
      memberships: options?.memberships ?? [],
    }),
    [options?.memberships, posts],
  );
  const chunks = useMemo(
    () =>
      groups.flatMap((group) =>
        chunkModerationPostIds(group.post_ids).map((postIds) => ({
          community: group.community,
          team_id: group.team_id,
          postIds,
        })),
      ),
    [groups],
  );

  const queries = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: queryKeys.communityTeamModeration(
        chunk.community,
        chunk.team_id,
        viewer,
        chunk.postIds,
      ),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        getCommunityTeamModeration(
          {
            slug: chunk.community,
            teamId: chunk.team_id,
            viewer,
            postIds: chunk.postIds,
          },
          { signal },
        ),
      enabled: !!viewer && (options?.enabled ?? true) && chunk.postIds.length > 0,
      staleTime: 1000 * 30,
      retry: (failureCount: number, error: unknown) =>
        shouldRetryCuratorRead(failureCount, error),
    })),
  });

  const itemsByPostId = useMemo(() => {
    const map = new Map<string, TeamModerationItem>();
    for (const query of queries) {
      for (const item of query.data?.items ?? []) {
        map.set(item.post_id, item);
      }
    }
    return map;
  }, [queries]);

  return {
    groups,
    chunks,
    queries,
    itemsByPostId,
    requestCount: chunks.length,
  };
}
