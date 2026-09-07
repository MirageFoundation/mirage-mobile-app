import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/src/stores";
import { queryKeys } from "../query-keys";
import {
  COMMUNITIES_MAX_PAGES,
  COMMUNITIES_QUERY_GC_TIME,
} from "../infinite-query-policy";
import {
  getCommunities,
  getCommunity,
  selectCommunitySlugs,
  type GetCommunitiesParams,
} from "../endpoints/communities";

export { selectCommunitySlugs };

export function useCommunities(params?: GetCommunitiesParams) {
  return useQuery({
    queryKey: queryKeys.communities(params),
    queryFn: () => getCommunities(params),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60 * 24,
  });
}

export function useCommunity(
  slug: string | undefined | null,
  options?: { viewer?: string | null; enabled?: boolean },
) {
  const viewer = options?.viewer ?? undefined;

  return useQuery({
    queryKey: queryKeys.community(slug ?? "", viewer),
    queryFn: () =>
      getCommunity({
        slug: slug!,
        viewer,
      }),
    enabled: !!slug && (options?.enabled ?? true),
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60 * 4,
  });
}

export function useInfiniteCommunities(
  params?: Omit<GetCommunitiesParams, "cursor">,
  options?: { enabled?: boolean },
) {
  const queryKey = queryKeys.communitiesInfinite(params);

  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getCommunities({
        ...params,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.has_more) return undefined;
      return lastPage.next_cursor || undefined;
    },
    maxPages: COMMUNITIES_MAX_PAGES,
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 60 * 10,
    gcTime: COMMUNITIES_QUERY_GC_TIME,
  });
}

export function useJoinedCommunities(params?: Omit<GetCommunitiesParams, "joined_by">) {
  const walletAddress = useAuthStore((s) => s.walletAddress);

  return useQuery({
    queryKey: queryKeys.communities({
      ...params,
      joined_by: walletAddress ?? undefined,
    }),
    queryFn: () =>
      getCommunities({
        ...params,
        joined_by: walletAddress!,
      }),
    enabled: !!walletAddress,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60 * 24,
  });
}
