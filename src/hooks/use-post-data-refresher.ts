import { useCallback, useRef } from "react";
import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { getPosts, getUserPosts } from "@/src/api/read/endpoints/posts";
import type { PostsResponse, Post as ApiPost } from "@/src/api/types";
import { queryKeys } from "@/src/api/read/query-keys";
import { useAppState } from "./use-app-state";

const METADATA_KEYS = [
  "points",
  "comments",
  "user_vote",
  "user_weight",
  "edited_at",
  "awards",
  "agent_edited",
  "appendices",
] as const;

function mergeMetadata(existing: ApiPost, fresh: ApiPost): ApiPost {
  let changed = false;
  for (const key of METADATA_KEYS) {
    if (existing[key] !== fresh[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return existing;

  const merged = { ...existing };
  for (const key of METADATA_KEYS) {
    (merged as any)[key] = fresh[key];
  }
  return merged;
}

function mergePageMetadata(
  existingPosts: ApiPost[],
  freshPostsMap: Map<string, ApiPost>,
): { posts: ApiPost[]; changed: boolean } {
  let changed = false;
  const merged = existingPosts.map((post) => {
    const fresh = freshPostsMap.get(post.post_id);
    if (!fresh) return post;
    const result = mergeMetadata(post, fresh);
    if (result !== post) changed = true;
    return result;
  });
  return { posts: merged, changed };
}

export type FeedRefreshParams = {
  feed?: "home" | "following";
  by?: "magic" | "newest";
  topic?: string;
  allowed_tags?: string;
  limit?: number;
  address?: string;
};

export type UserPostsRefreshParams = {
  owner: string;
  address?: string;
  type?: "submissions" | "comments";
  limit?: number;
};

async function refreshFeedQuery(
  queryClient: QueryClient,
  feedParams: FeedRefreshParams,
) {
  const queryKey = queryKeys.posts({
    ...feedParams,
    page: undefined,
  });

  const existingData = queryClient.getQueryData<InfiniteData<PostsResponse>>(queryKey);
  if (!existingData?.pages?.length) return;

  const freshPages = await Promise.all(
    existingData.pages.map((page, index) =>
      getPosts({
        ...feedParams,
        page: existingData.pageParams[index] as number,
        limit: feedParams.limit,
      }),
    ),
  );

  queryClient.setQueryData<InfiniteData<PostsResponse>>(queryKey, (old) => {
    if (!old) return old;

    let anyChanged = false;
    const newPages = old.pages.map((page, pageIndex) => {
      const freshPage = freshPages[pageIndex];
      if (!freshPage) return page;

      const freshMap = new Map<string, ApiPost>();
      for (const post of freshPage.posts) {
        freshMap.set(post.post_id, post);
      }

      const { posts, changed } = mergePageMetadata(page.posts, freshMap);
      if (!changed) return page;
      anyChanged = true;
      return { ...page, posts };
    });

    if (!anyChanged) return old;
    return { ...old, pages: newPages };
  });
}

async function refreshUserPostsQuery(
  queryClient: QueryClient,
  params: UserPostsRefreshParams,
) {
  const queryKey = queryKeys.userPosts(params.owner, params.type);

  const existingData = queryClient.getQueryData<InfiniteData<PostsResponse>>(queryKey);
  if (!existingData?.pages?.length) return;

  const freshPages = await Promise.all(
    existingData.pages.map((page, index) =>
      getUserPosts({
        ...params,
        page: existingData.pageParams[index] as number,
        limit: params.limit,
      }),
    ),
  );

  queryClient.setQueryData<InfiniteData<PostsResponse>>(queryKey, (old) => {
    if (!old) return old;

    let anyChanged = false;
    const newPages = old.pages.map((page, pageIndex) => {
      const freshPage = freshPages[pageIndex];
      if (!freshPage) return page;

      const freshMap = new Map<string, ApiPost>();
      for (const post of freshPage.posts) {
        freshMap.set(post.post_id, post);
      }

      const { posts, changed } = mergePageMetadata(page.posts, freshMap);
      if (!changed) return page;
      anyChanged = true;
      return { ...page, posts };
    });

    if (!anyChanged) return old;
    return { ...old, pages: newPages };
  });
}

interface UsePostDataRefresherOptions {
  feedParamsList?: FeedRefreshParams[];
  userPostsParams?: UserPostsRefreshParams;
  onRefreshComplete?: () => void;
}

export function usePostDataRefresher(options: UsePostDataRefresherOptions) {
  const { feedParamsList, userPostsParams, onRefreshComplete } = options;
  const queryClient = useQueryClient();
  const isRefreshingRef = useRef(false);
  const wasBackgroundedRef = useRef(false);

  const refreshPostMetadata = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      const tasks: Promise<void>[] = [];

      if (feedParamsList) {
        for (const feedParams of feedParamsList) {
          tasks.push(refreshFeedQuery(queryClient, feedParams));
        }
      }

      if (userPostsParams) {
        tasks.push(refreshUserPostsQuery(queryClient, userPostsParams));
      }

      await Promise.all(tasks);
      onRefreshComplete?.();
    } catch {
    } finally {
      isRefreshingRef.current = false;
    }
  }, [queryClient, feedParamsList, userPostsParams, onRefreshComplete]);

  useAppState({
    onForeground: () => {
      wasBackgroundedRef.current = true;
      refreshPostMetadata();
    },
    staleThreshold: 0,
  });

  return {
    refreshPostMetadata,
    wasBackgroundedRef,
  };
}
