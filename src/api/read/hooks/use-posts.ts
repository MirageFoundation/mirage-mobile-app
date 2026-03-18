import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import {
  getPosts,
  getUserPosts,
  type GetPostsParams,
  type GetUserPostsParams,
} from "../endpoints/posts";
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

/**
 * Get posts with infinite scrolling
 * Automatically handles pagination
 */
export function useInfinitePosts(
  params?: Omit<GetPostsParams, "page" | "address">,
  options?: { enabled?: boolean; pageLimit?: number }
) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const isInitializing = useAuthStore((s) => s.isInitializing);

  const baseParams = {
    ...params,
    address: walletAddress ?? undefined,
  };

  const pageLimit = options?.pageLimit;

  return useInfiniteQuery({
    queryKey: queryKeys.posts({ ...baseParams, page: undefined }),
    queryFn: ({ pageParam = 1 }) =>
      getPosts({ ...baseParams, page: pageParam, limit: pageParam === 1 ? baseParams.limit : (pageLimit ?? baseParams.limit) }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.has_more) return undefined;
      return lastPage.page + 1;
    },
    enabled: !isInitializing && (options?.enabled ?? true),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 4,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
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
  const allowedTags = getAllowedTagsFromContentTypes(selectedContentTypes);

  return useQuery({
    queryKey: queryKeys.userPosts(owner!, type, allowedTags),
    queryFn: () =>
      getUserPosts({
        owner: owner!,
        address: walletAddress ?? undefined,
        type,
        allowed_tags: allowedTags || undefined,
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
  const allowedTags = getAllowedTagsFromContentTypes(selectedContentTypes);

  return useInfiniteQuery({
    queryKey: queryKeys.userPosts(owner!, params?.type, allowedTags),
    queryFn: ({ pageParam = 1 }) => {
      return getUserPosts({
        owner: owner!,
        address: walletAddress ?? undefined,
        page: pageParam,
        allowed_tags: allowedTags || undefined,
        ...params,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.has_more) return undefined;
      return lastPage.page + 1;
    },
    enabled: !!owner,
    staleTime: 1000 * 60, // 1 minute
  });
}
