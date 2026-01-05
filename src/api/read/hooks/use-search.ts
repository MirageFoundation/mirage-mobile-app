import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { search, type SearchParams } from "../endpoints/search";
import { useAuthStore } from "@/src/stores";

/**
 * Search across topics, users, and posts
 * Prefix @ for users, # for topics
 *
 * @param query - Search query
 * @param params - Search parameters
 */
export function useSearch(
  query: string | undefined | null,
  params?: Omit<SearchParams, "q" | "address">
) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.search(query!, params?.type, params?.limit),
    queryFn: () =>
      search({
        q: query!,
        address: walletAddress ?? undefined,
        ...params,
      }),
    enabled: !!query && query.length >= 1,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Search for users only
 */
export function useSearchUsers(query: string | undefined | null, limit?: number) {
  return useSearch(query, { type: "users", limit });
}

/**
 * Search for topics only
 */
export function useSearchTopicsOnly(query: string | undefined | null, limit?: number) {
  return useSearch(query, { type: "topics", limit });
}

/**
 * Search for posts only
 */
export function useSearchPosts(query: string | undefined | null, limit?: number) {
  return useSearch(query, { type: "posts", limit });
}
