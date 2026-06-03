import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getInbox, type GetInboxParams } from "../endpoints/inbox";
import { useAuthStore } from "@/src/stores";

/**
 * Get user's inbox (reply notifications)
 * Only enabled when wallet is connected
 *
 * staleTime: 30 seconds
 */
export function useInbox(params?: Omit<GetInboxParams, "address">) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.inbox(walletAddress ?? "", params?.page),
    queryFn: () =>
      getInbox({
        address: walletAddress!,
        ...params,
      }),
    enabled: !!walletAddress,
    retry: 1,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 60, // 1 hour
  });
}

/**
 * Get inbox with infinite scrolling
 */
export function useInfiniteInbox(
  params?: Omit<GetInboxParams, "address" | "page">
) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useInfiniteQuery({
    queryKey: queryKeys.inboxInfinite(walletAddress ?? ""),
    queryFn: ({ pageParam = 1 }) =>
      getInbox({
        address: walletAddress!,
        page: pageParam,
        ...params,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.has_more) return undefined;
      return (lastPage?.page ?? 0) + 1;
    },
    enabled: !!walletAddress,
    retry: 1,
    staleTime: 1000 * 30, // 30 seconds
  });
}
