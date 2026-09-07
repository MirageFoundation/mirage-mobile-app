import type { QueryClient } from "@tanstack/react-query";
import { getPosts, queryKeys, type PostsResponse } from "@/src/api";
import {
  fetchAndMergeInfinitePostsRefresh,
  type InfinitePostsData,
} from "@/src/api/cache/merge-infinite-posts-refresh";
import type { LensMode } from "@/src/domain/communities";

type CommunityFeedRefreshParams = {
  queryClient: QueryClient;
  community?: string;
  sortBy: "magic" | "newest";
  allowedTags?: string;
  address?: string;
  lens?: LensMode;
  teamId?: number | null;
  fetchAllNew?: boolean;
  firstPage?: PostsResponse | null;
};

export function getCommunityFeedQueryKey({
  community,
  sortBy,
  allowedTags,
  address,
  lens,
  teamId,
}: Omit<CommunityFeedRefreshParams, "queryClient" | "fetchAllNew" | "firstPage">) {
  return queryKeys.posts({
    limit: 10,
    community,
    allowed_tags: allowedTags || undefined,
    by: sortBy,
    address,
    page: undefined,
    lens,
    team_id: teamId,
  });
}

export async function refreshCommunityFeed({
  queryClient,
  community,
  sortBy,
  allowedTags,
  address,
  lens,
  teamId,
  fetchAllNew = false,
  firstPage,
}: CommunityFeedRefreshParams) {
  const queryKey = getCommunityFeedQueryKey({
    community,
    sortBy,
    allowedTags,
    address,
    lens,
    teamId,
  });
  const existing = queryClient.getQueryData<InfinitePostsData>(queryKey);
  const { data } = await fetchAndMergeInfinitePostsRefresh({
    existing,
    fetchPage: (page) => getPosts({
      limit: page === 1 ? 10 : 20,
      community,
      allowed_tags: allowedTags || undefined,
      by: sortBy,
      address,
      page,
      lens,
      team_id: teamId,
    }),
    fetchAllNew,
    mode: sortBy === "newest" ? "prepend" : "replace-top",
    firstPage,
  });
  queryClient.setQueryData(queryKey, data);
}
