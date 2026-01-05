import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getTopics, searchTopics, type SearchTopicsParams } from "../endpoints/topics";

/**
 * Get all topics
 *
 * @param limit - Maximum number of topics (max 200)
 *
 * staleTime: 10 minutes
 */
export function useTopics(limit?: number) {
  return useQuery({
    queryKey: queryKeys.topics(limit),
    queryFn: () => getTopics(limit ? { limit } : undefined),
    staleTime: 1000 * 60 * 10, // 10 minutes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Search topics by query
 *
 * @param query - Search query (min 2 characters)
 * @param params - Additional search params
 */
export function useSearchTopics(
  query: string | undefined | null,
  params?: Omit<SearchTopicsParams, "q">
) {
  return useQuery({
    queryKey: queryKeys.searchTopics(query!, params?.limit),
    queryFn: () =>
      searchTopics({
        q: query!,
        ...params,
      }),
    enabled: !!query && query.length >= 2,
    staleTime: 1000 * 60, // 1 minute
  });
}
