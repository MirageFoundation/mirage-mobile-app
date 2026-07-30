import * as Sentry from "@sentry/react-native";
import { useQuery, useInfiniteQuery, useIsRestoring } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getInfinitePostsQueryPolicy } from "../infinite-posts-policy";
import {
  FEED_MAX_PAGES,
  FEED_QUERY_GC_TIME,
  USER_POSTS_MAX_PAGES,
  USER_POSTS_QUERY_GC_TIME,
  getPreviousNumberedPageParam,
} from "../infinite-query-policy";
import {
  getPosts,
  getUserPosts,
  normalizeUserPostsQueryParams,
  type GetPostsParams,
  type GetUserPostsParams,
} from "../endpoints/posts";
import type { PostsResponse } from "../../types";
import { useAuthStore } from "@/src/stores";
import { usePreferencesStore, getAllowedTagsFromContentTypes } from "@/src/stores/preferences-store";

/**
 * Get posts with pagination
 * Automatically includes viewer's address for personalized data
 *
 * staleTime: 1 minute
 */
export function usePosts(params?: Omit<GetPostsParams, "address">) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  const fullParams: GetPostsParams = {
    ...params,
    address: walletAddress ?? undefined,
  };

  return useQuery({
    queryKey: queryKeys.posts(fullParams),
    queryFn: () => getPosts(fullParams),
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 60 * 4, // 4 hours
  });
}

const loggedPaginationAnomalies = new Set<string>();

function reportPaginationAnomaly(
  reason: string,
  lastPage: PostsResponse,
  context?: Omit<GetPostsParams, "page">,
) {
  const fingerprint = JSON.stringify({
    reason,
    feed: context?.feed ?? null,
    by: context?.by ?? null,
    topic: context?.topic ?? null,
    allowed_tags: context?.allowed_tags ?? null,
    page: lastPage.page,
    limit: lastPage.limit,
    total: lastPage.total,
    has_more: lastPage.has_more,
    post_count: lastPage.posts?.length ?? 0,
  });

  if (loggedPaginationAnomalies.has(fingerprint)) return;
  loggedPaginationAnomalies.add(fingerprint);

  Sentry.withScope((scope) => {
    scope.setLevel("warning");
    scope.setTag("feature", "feed-pagination");
    scope.setTag("reason", reason);
    if (context?.feed) scope.setTag("feed", context.feed);
    if (context?.by) scope.setTag("sort", context.by);
    scope.setContext("feed_pagination", {
      reason,
      feed: context?.feed ?? null,
      by: context?.by ?? null,
      topic: context?.topic ?? null,
      allowed_tags: context?.allowed_tags ?? null,
      has_address: !!context?.address,
      page: lastPage.page,
      limit: lastPage.limit,
      total: lastPage.total,
      has_more: lastPage.has_more,
      post_count: lastPage.posts?.length ?? 0,
    });
    Sentry.captureMessage("Feed pagination anomaly detected");
  });
}

// Production feed responses can occasionally report has_more=false even while
// later pages still contain posts. Keep paginating while the page still looks
// valid and is contributing new post IDs, and stop once pages go empty/repeat.
function getNextPostsPageParam(
  lastPage: PostsResponse | undefined,
  allPages: PostsResponse[],
  context?: Omit<GetPostsParams, "page">,
) {
  if (!lastPage) return undefined;

  const posts = lastPage.posts ?? [];
  if (posts.length === 0) return undefined;

  const currentPage = Number(lastPage.page) || allPages.length;
  const currentLimit = Number(lastPage.limit) || posts.length;
  const total = Number(lastPage.total);

  const previousPostIds = new Set(
    allPages
      .slice(0, -1)
      .flatMap((page) => page.posts.map((post) => post.post_id)),
  );
  const hasNewPosts = posts.some((post) => !previousPostIds.has(post.post_id));

  if (!hasNewPosts && allPages.length > 1) return undefined;
  if (lastPage.has_more) return currentPage + 1;
  if (Number.isFinite(total) && total > currentPage * currentLimit) {
    reportPaginationAnomaly("total_exceeds_page_window", lastPage, context);
    return currentPage + 1;
  }

  if (posts.length >= Math.max(1, currentLimit - 1)) {
    reportPaginationAnomaly("near_full_page_with_has_more_false", lastPage, context);
    return currentPage + 1;
  }

  return undefined;
}

/**
 * Get posts with infinite scrolling
 * Automatically handles pagination
 */
export function useInfinitePosts(
  params?: Omit<GetPostsParams, "page" | "address">,
  options?: { enabled?: boolean; pageLimit?: number }
) {
  const isRestoring = useIsRestoring();
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const isInitializing = useAuthStore((s) => s.isInitializing);

  const baseParams = {
    ...params,
    address: walletAddress ?? undefined,
  };

  const pageLimit = options?.pageLimit;
  const queryKey = queryKeys.posts({ ...baseParams, page: undefined });
  const queryPolicy = getInfinitePostsQueryPolicy({
    isInitializing,
    isRestoring,
    enabled: options?.enabled,
  });

  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      getPosts({ ...baseParams, page: pageParam, limit: pageParam === 1 ? baseParams.limit : (pageLimit ?? baseParams.limit) }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      getNextPostsPageParam(lastPage, allPages, baseParams),
    getPreviousPageParam: getPreviousNumberedPageParam,
    maxPages: FEED_MAX_PAGES,
    ...queryPolicy,
    gcTime: FEED_QUERY_GC_TIME,
  });
}

/**
 * Get user's posts (submissions or comments)
 *
 * @param owner - The address of the user whose posts to fetch
 * @param type - 'submissions' or 'comments'
 */
export function useUserPosts(
  owner: string | undefined | null,
  type?: "submissions" | "comments"
) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const allowedTags = getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled);
  const queryParams = normalizeUserPostsQueryParams({
    type,
    allowed_tags: allowedTags || undefined,
  });

  return useQuery({
    queryKey: queryKeys.userPosts(owner!, walletAddress, queryParams),
    queryFn: () =>
      getUserPosts({
        owner: owner!,
        address: walletAddress ?? undefined,
        ...queryParams,
      }),
    enabled: !!owner,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Get user's posts with infinite scrolling
 */
export function useInfiniteUserPosts(
  owner: string | undefined | null,
  params?: Omit<GetUserPostsParams, "owner" | "page" | "address">
) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const allowedTags = getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled);
  const queryParams = normalizeUserPostsQueryParams({
    ...params,
    allowed_tags: params?.allowed_tags ?? (allowedTags || undefined),
  });

  return useInfiniteQuery({
    queryKey: queryKeys.userPosts(owner!, walletAddress, queryParams),
    queryFn: ({ pageParam = 1 }) => {
      return getUserPosts({
        owner: owner!,
        address: walletAddress ?? undefined,
        page: pageParam,
        ...queryParams,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.has_more) return undefined;
      return lastPage.page + 1;
    },
    getPreviousPageParam: getPreviousNumberedPageParam,
    maxPages: USER_POSTS_MAX_PAGES,
    enabled: !!owner,
    staleTime: 1000 * 60, // 1 minute
    gcTime: USER_POSTS_QUERY_GC_TIME,
  });
}
