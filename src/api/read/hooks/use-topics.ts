import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getTopics, searchTopics, type SearchTopicsParams } from "../endpoints/topics";
import { usePreferencesStore, getAllowedTagsFromContentTypes } from "@/src/stores/preferences-store";
import { useAuthStore } from "@/src/stores";

/**
 * Get all topics
 *
 * @param limit - Maximum number of topics (max 200)
 *
 * staleTime: 10 minutes
 */
export function useTopics(limit?: number) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const allowedTags = getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled);

  return useQuery({
    queryKey: queryKeys.topics(limit, allowedTags, walletAddress),
    queryFn: () => getTopics({ limit, address: walletAddress ?? undefined, allowed_tags: allowedTags || undefined }),
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
  const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const allowedTags = getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled);

  return useQuery({
    queryKey: queryKeys.searchTopics(query!, params?.limit, allowedTags),
    queryFn: () =>
      searchTopics({
        q: query!,
        allowed_tags: allowedTags || undefined,
        ...params,
      }),
    enabled: !!query && query.length >= 2,
    staleTime: 1000 * 60, // 1 minute
  gcTime: 1000 * 60 * 5,
  retry: false,
  });
}

/**
 * Debounced search for topics
 * @param query - Search query
 * @param delay - Debounce delay (default 750ms)
 * @param params - Additional params
 */
export function useDebouncedSearchTopics(
  query: string | undefined | null,
  delay = 750,
  params?: Omit<SearchTopicsParams, "q">
) {
  const [debouncedQuery, setDebouncedQuery] = useState<string | null>(null);

  useEffect(() => {
    const trimmedQuery = query?.trim() || "";

    if (!trimmedQuery) {
      setDebouncedQuery(null);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(trimmedQuery);
    }, delay);

    return () => clearTimeout(timer);
  }, [query, delay]);

  const searchQuery = useSearchTopics(
    debouncedQuery && debouncedQuery.length >= 2 ? debouncedQuery : null,
    params
  );

  const isDebouncing = useMemo(() => {
    const trimmedQuery = query?.trim() || "";
    return trimmedQuery.length > 0 && trimmedQuery !== debouncedQuery;
  }, [query, debouncedQuery]);

  return {
    ...searchQuery,
    debouncedQuery,
    isDebouncing,
    isSearching: isDebouncing || searchQuery.isFetching,
  };
}
