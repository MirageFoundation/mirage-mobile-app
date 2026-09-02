import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { search, type SearchParams } from "../endpoints/search";
import {
  isDebouncedSearchPending,
  normalizeSearchRequestQuery,
} from "../search-query";
import { usePreferencesStore, getAllowedTagsFromContentTypes } from "@/src/stores/preferences-store";
import { useAuthStore } from "@/src/stores";

/**
 * Debounced search hook for search-as-you-type functionality
 *
 * @param query - The raw search query input
 * @param delay - Debounce delay in milliseconds (default: 300ms)
 * @param params - Additional search parameters
 */
export function useDebouncedSearch(
  query: string | undefined | null,
  delay = 300,
  params?: Omit<SearchParams, "q" | "address">
) {
  const [debouncedQuery, setDebouncedQuery] = useState<string | null>(null);
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const allowedTags = getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled);
  const searchType = params?.type;

  // Debounce the query
  useEffect(() => {
    const normalizedQuery = normalizeSearchRequestQuery(query, searchType);

    // If query is empty, clear immediately
    if (!normalizedQuery) {
      setDebouncedQuery(null);
      return;
    }

    // Set up debounce timer
    const timer = setTimeout(() => {
      setDebouncedQuery(normalizedQuery);
    }, delay);

    return () => clearTimeout(timer);
  }, [query, delay, searchType]);

  // Perform the search with debounced query
  const searchQuery = useQuery({
    queryKey: queryKeys.search(debouncedQuery!, params?.type, params?.limit, allowedTags, walletAddress),
    queryFn: () =>
      search({
        q: debouncedQuery!,
        address: walletAddress ?? undefined,
        allowed_tags: allowedTags || undefined,
        ...params,
      }),
    enabled: !!debouncedQuery && debouncedQuery.length >= 1,
    staleTime: 1000 * 60, // 1 minute
  });

  // Determine if we're waiting for debounce or fetching
  const isDebouncing = useMemo(
    () =>
      isDebouncedSearchPending(query, debouncedQuery, (value) =>
        normalizeSearchRequestQuery(value, searchType),
      ),
    [query, debouncedQuery, searchType],
  );

  return {
    ...searchQuery,
    debouncedQuery,
    isDebouncing,
    // True if either debouncing or fetching
    isSearching: isDebouncing || searchQuery.isFetching,
  };
}

/**
 * Debounced search for topics only
 */
export function useDebouncedSearchTopics(
  query: string | undefined | null,
  delay = 300,
  limit?: number
) {
  return useDebouncedSearch(query, delay, { type: "topics", limit });
}

/**
 * Debounced search for posts only
 */
export function useDebouncedSearchPosts(
  query: string | undefined | null,
  delay = 300,
  limit?: number
) {
  return useDebouncedSearch(query, delay, { type: "posts", limit });
}
