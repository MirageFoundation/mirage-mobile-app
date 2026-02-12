import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import {
  getPosts,
  getUserPosts,
  type GetPostsParams,
  type GetUserPostsParams,
} from "../endpoints/posts";
import { useAuthStore } from "@/src/stores";

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
  params?: Omit<GetPostsParams, "page" | "address">
) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  const baseParams = {
    ...params,
    address: walletAddress ?? undefined,
  };

  return useInfiniteQuery({
    queryKey: queryKeys.posts({ ...baseParams, page: undefined }),
    queryFn: ({ pageParam = 1 }) =>
      getPosts({ ...baseParams, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.has_more) return undefined;
      return lastPage.page + 1;
    },
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 60 * 4, // 4 hours
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

  return useQuery({
    queryKey: queryKeys.userPosts(owner!, type),
    queryFn: () =>
      getUserPosts({
        owner: owner!,
        address: walletAddress ?? undefined,
        type,
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

  return useInfiniteQuery({
    queryKey: queryKeys.userPosts(owner!, params?.type),
    queryFn: ({ pageParam = 1 }) => {
      return getUserPosts({
        owner: owner!,
        address: walletAddress ?? undefined,
        page: pageParam,
        ...params,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.has_more) return undefined;
      return lastPage.page + 1;
    },
    enabled: !!owner,
    staleTime: 1000 * 60, // 1 minute
  });
}
