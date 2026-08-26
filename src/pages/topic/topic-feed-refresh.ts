import type { QueryClient } from "@tanstack/react-query";
import { getPosts, queryKeys, type PostsResponse } from "@/src/api";
import {
  fetchAndMergeInfinitePostsRefresh,
  type InfinitePostsData,
} from "@/src/api/cache/merge-infinite-posts-refresh";

type TopicFeedRefreshParams = {
  queryClient: QueryClient;
  topicName?: string;
  sortBy: "magic" | "newest";
  allowedTags?: string;
  address?: string;
  fetchAllNew?: boolean;
  firstPage?: PostsResponse | null;
};

export function getTopicFeedQueryKey({
  topicName,
  sortBy,
  allowedTags,
  address,
}: Omit<TopicFeedRefreshParams, "queryClient" | "fetchAllNew" | "firstPage">) {
  return queryKeys.posts({
    limit: 10,
    topic: topicName,
    allowed_tags: allowedTags || undefined,
    by: sortBy,
    address,
    page: undefined,
  });
}

export async function refreshTopicFeed({
  queryClient,
  topicName,
  sortBy,
  allowedTags,
  address,
  fetchAllNew = false,
  firstPage,
}: TopicFeedRefreshParams) {
  const queryKey = getTopicFeedQueryKey({
    topicName,
    sortBy,
    allowedTags,
    address,
  });
  const existing = queryClient.getQueryData<InfinitePostsData>(queryKey);
  const { data } = await fetchAndMergeInfinitePostsRefresh({
    existing,
    fetchPage: (page) => getPosts({
      limit: page === 1 ? 10 : 20,
      topic: topicName,
      allowed_tags: allowedTags || undefined,
      by: sortBy,
      address,
      page,
    }),
    fetchAllNew,
    mode: sortBy === "newest" ? "prepend" : "replace-top",
    firstPage,
  });
  queryClient.setQueryData(queryKey, data);
}
