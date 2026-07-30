import { infiniteQueryOptions, useQuery, useInfiniteQuery } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";
import { Platform } from "react-native";
import { queryKeys } from "../query-keys";
import {
  getInbox,
  normalizeInboxQueryParams,
  type GetInboxParams,
} from "../endpoints/inbox";
import { useAuthStore } from "@/src/stores";
import {
  INBOX_MAX_PAGES,
  INBOX_QUERY_GC_TIME,
  getPreviousNumberedPageParam,
} from "../infinite-query-policy";

/**
 * Get user's inbox (reply notifications)
 * Only enabled when wallet is connected
 *
 * staleTime: 30 seconds
 */
export function useInbox(params?: Omit<GetInboxParams, "address">) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const queryParams = normalizeInboxQueryParams(params);

  return useQuery({
    queryKey: queryKeys.inbox(walletAddress ?? "", params?.page, queryParams),
    queryFn: async () => {
      try {
        return await getInbox({
          address: walletAddress!,
          ...params,
          ...queryParams,
        });
      } catch (err) {
        Sentry.addBreadcrumb({
          category: "inbox",
          message: "getInbox request failed",
          level: "warning",
          data: {
            platform: Platform.OS,
            page: params?.page,
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        });
        throw err;
      }
    },
    enabled: !!walletAddress,
    retry: 1,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get inbox with infinite scrolling
 */
export function infiniteInboxQueryOptions(
  walletAddress: string,
  params?: Omit<GetInboxParams, "address" | "page">,
) {
  const queryParams = normalizeInboxQueryParams(params);

  return infiniteQueryOptions({
    queryKey: queryKeys.inboxInfinite(walletAddress, queryParams),
    queryFn: async ({ pageParam = 1 }) => {
      try {
        return await getInbox({
          address: walletAddress,
          page: pageParam,
          ...params,
          ...queryParams,
        });
      } catch (err) {
        Sentry.addBreadcrumb({
          category: "inbox",
          message: "getInbox (infinite) request failed",
          level: "warning",
          data: {
            platform: Platform.OS,
            page: pageParam,
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        });
        throw err;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.has_more) return undefined;
      return (lastPage?.page ?? 0) + 1;
    },
    getPreviousPageParam: getPreviousNumberedPageParam,
    maxPages: INBOX_MAX_PAGES,
    enabled: !!walletAddress,
    retry: 1,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: INBOX_QUERY_GC_TIME,
  });
}

export function useInfiniteInbox(
  params?: Omit<GetInboxParams, "address" | "page">
) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useInfiniteQuery(infiniteInboxQueryOptions(walletAddress ?? "", params));
}
