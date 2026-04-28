import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { getComments, getPosts, getUserPosts } from "@/src/api/read/endpoints/posts";
import type { PostsResponse, Post as ApiPost } from "@/src/api/types";
import { queryKeys } from "@/src/api/read/query-keys";
import { getVisiblePostIds } from "@/src/services/seen-posts-tracker";
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

function patchRootMetadataIntoPostQueries(
  queryClient: QueryClient,
  root: ApiPost,
) {
  queryClient.setQueriesData<InfiniteData<PostsResponse>>(
    { queryKey: ["posts"] },
    (old) => {
      if (!old?.pages) return old;

      let anyChanged = false;
      const newPages = old.pages.map((page) => {
        const idx = page.posts.findIndex((p) => p.post_id === root.post_id);
        if (idx === -1) return page;

        const existing = page.posts[idx];
        let changed = false;
        for (const key of METADATA_KEYS) {
          if (existing[key] !== root[key]) {
            changed = true;
            break;
          }
        }
        if (!changed) return page;

        anyChanged = true;
        const updated = { ...existing };
        for (const key of METADATA_KEYS) {
          (updated as any)[key] = root[key];
        }
        const newPosts = [...page.posts];
        newPosts[idx] = updated;
        return { ...page, posts: newPosts };
      });

      if (!anyChanged) return old;
      return { ...old, pages: newPages };
    },
  );
}

async function refreshVisibleRootMetadata(
  queryClient: QueryClient,
  address: string | undefined,
  trackerKeys: string[] | undefined,
) {
  if (!trackerKeys || trackerKeys.length === 0) return;
  const visibleIds = getVisiblePostIds(trackerKeys).slice(0, 6);
  if (visibleIds.length === 0) return;

  const roots = await Promise.all(
    visibleIds.map(async (postId) => {
      try {
        const data = await getComments({ post_id: postId, address });
        return data.root;
      } catch {
        return null;
      }
    }),
  );

  for (const root of roots) {
    if (!root) continue;
    patchRootMetadataIntoPostQueries(queryClient, root);
  }
}

interface UsePostDataRefresherOptions {
  feedParamsList?: FeedRefreshParams[];
  userPostsParams?: UserPostsRefreshParams;
  onRefreshComplete?: () => void;
  visibleTrackerKeys?: string[];
}

export function usePostDataRefresher(options: UsePostDataRefresherOptions) {
  const { feedParamsList, userPostsParams, onRefreshComplete, visibleTrackerKeys } = options;
  const queryClient = useQueryClient();
  const isRefreshingRef = useRef(false);
  const wasBackgroundedRef = useRef(false);
  const followUpSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPostMetadata = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    if (followUpSyncTimerRef.current) {
      clearTimeout(followUpSyncTimerRef.current);
      followUpSyncTimerRef.current = null;
    }

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
      const address = feedParamsList?.find((params) => !!params.address)?.address ?? userPostsParams?.address;
      await refreshVisibleRootMetadata(queryClient, address, visibleTrackerKeys);
      followUpSyncTimerRef.current = setTimeout(() => {
        refreshVisibleRootMetadata(queryClient, address, visibleTrackerKeys).catch(() => {});
        followUpSyncTimerRef.current = null;
      }, 700);
      onRefreshComplete?.();
    } catch {
    } finally {
      isRefreshingRef.current = false;
    }
  }, [queryClient, feedParamsList, userPostsParams, onRefreshComplete, visibleTrackerKeys]);

  const refreshVisiblePostMetadata = useCallback(async () => {
    if (!visibleTrackerKeys?.length) {
      await refreshPostMetadata();
      return;
    }

    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    if (followUpSyncTimerRef.current) {
      clearTimeout(followUpSyncTimerRef.current);
      followUpSyncTimerRef.current = null;
    }

    try {
      const address = feedParamsList?.find((params) => !!params.address)?.address ?? userPostsParams?.address;
      await refreshVisibleRootMetadata(queryClient, address, visibleTrackerKeys);
      followUpSyncTimerRef.current = setTimeout(() => {
        refreshVisibleRootMetadata(queryClient, address, visibleTrackerKeys).catch(() => {});
        followUpSyncTimerRef.current = null;
      }, 700);
      onRefreshComplete?.();
    } catch {
    } finally {
      isRefreshingRef.current = false;
    }
  }, [queryClient, feedParamsList, userPostsParams, onRefreshComplete, refreshPostMetadata, visibleTrackerKeys]);

  useAppState({
    onForeground: () => {
      wasBackgroundedRef.current = true;
      refreshVisiblePostMetadata();
    },
    staleThreshold: 0,
  });

  useEffect(() => {
    return () => {
      if (followUpSyncTimerRef.current) {
        clearTimeout(followUpSyncTimerRef.current);
        followUpSyncTimerRef.current = null;
      }
    };
  }, []);

  return {
    refreshPostMetadata,
    wasBackgroundedRef,
  };
}
