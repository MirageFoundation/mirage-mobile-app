import { useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { CREATOR_EARNINGS_QUERY_MAX_PAGES } from "../infinite-query-policy";
import {
  getCreatorEarningTargets,
  getCreatorEarnings,
} from "../endpoints/creator-earnings";
import {
  CREATOR_EARNINGS_PAGE_LIMIT,
  createEarningsPageGuard,
  defaultCreatorEarningsSort,
} from "@/src/domain/creator-earnings";

export function useInfiniteCreatorEarnings(
  creator: string | null | undefined,
  params: {
    claimable_only: boolean;
    sort?: "claim_deadline_asc" | "epoch_desc";
    limit?: number;
  },
  options?: { enabled?: boolean },
) {
  const address = creator?.trim().toLowerCase() ?? "";
  const sort = params.sort ?? defaultCreatorEarningsSort(params.claimable_only);
  const limit = params.limit ?? CREATOR_EARNINGS_PAGE_LIMIT;
  const request = {
    creator: address,
    claimable_only: params.claimable_only,
    sort,
    limit,
  };
  const guardRef = useRef(createEarningsPageGuard());

  return useInfiniteQuery({
    queryKey: queryKeys.creatorEarningsInfinite(address, request),
    queryFn: async ({ pageParam, signal }) => {
      const cursor = typeof pageParam === "string" ? pageParam : null;
      if (!cursor) guardRef.current = createEarningsPageGuard();
      const page = await getCreatorEarnings(
        { ...request, cursor: cursor ?? undefined },
        { signal },
      );
      return guardRef.current.accept(page);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.has_more) return undefined;
      return lastPage.next_cursor || undefined;
    },
    maxPages: CREATOR_EARNINGS_QUERY_MAX_PAGES,
    enabled: !!address && (options?.enabled ?? true),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 30,
  });
}

export function useCreatorEarningTargets(
  creator: string | null | undefined,
  epochId: number | null | undefined,
  options?: { enabled?: boolean; limit?: number },
) {
  const address = creator?.trim().toLowerCase() ?? "";
  const epoch = typeof epochId === "number" ? epochId : Number(epochId);
  const limit = options?.limit ?? CREATOR_EARNINGS_PAGE_LIMIT;

  return useInfiniteQuery({
    queryKey: queryKeys.creatorEarningsTargetsInfinite(address, epoch, { limit }),
    queryFn: ({ pageParam, signal }) =>
      getCreatorEarningTargets(
        {
          creator: address,
          epoch_id: epoch,
          limit,
          cursor: typeof pageParam === "string" ? pageParam : undefined,
        },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.has_more) return undefined;
      return lastPage.next_cursor || undefined;
    },
    maxPages: CREATOR_EARNINGS_QUERY_MAX_PAGES,
    enabled: !!address && Number.isSafeInteger(epoch) && epoch >= 0 && (options?.enabled ?? true),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 30,
  });
}

export function useCreatorEarningsPage(
  creator: string | null | undefined,
  params: {
    claimable_only: boolean;
    sort?: "claim_deadline_asc" | "epoch_desc";
    limit?: number;
    cursor?: string | null;
  },
  options?: { enabled?: boolean },
) {
  const address = creator?.trim().toLowerCase() ?? "";
  const sort = params.sort ?? defaultCreatorEarningsSort(params.claimable_only);
  const request = {
    creator: address,
    claimable_only: params.claimable_only,
    sort,
    limit: params.limit ?? CREATOR_EARNINGS_PAGE_LIMIT,
    cursor: params.cursor ?? null,
  };

  return useQuery({
    queryKey: queryKeys.creatorEarnings(address, request),
    queryFn: ({ signal }) => getCreatorEarnings(request, { signal }),
    enabled: !!address && (options?.enabled ?? true),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 30,
  });
}
