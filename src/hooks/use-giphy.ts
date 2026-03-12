/**
 * Giphy Hook
 *
 * Provides debounced GIF search and trending functionality.
 */

import {
  getTrendingGifs,
  isGiphyConfigured,
  searchGifs,
  type GifItem,
} from "@/src/api/giphy";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react-native";

export interface UseGiphyOptions {
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Number of results per page (default: 20) */
  limit?: number;
  /** Whether to enable fetching (default: true) */
  enabled?: boolean;
}

export interface UseGiphyReturn {
  /** Current GIFs to display */
  gifs: GifItem[];
  /** Whether GIFs are loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Current search query */
  query: string;
  /** Set the search query (will trigger debounced search) */
  setQuery: (query: string) => void;
  /** Load more GIFs (pagination) */
  loadMore: () => void;
  /** Whether there are more GIFs to load */
  hasMore: boolean;
  /** Refresh/reload GIFs */
  refresh: () => void;
  /** Whether Giphy API is configured */
  isConfigured: boolean;
}

/**
 * Hook for searching and displaying Giphy GIFs with debounced search
 */
export function useGiphy(options: UseGiphyOptions = {}): UseGiphyReturn {
  const { debounceMs = 300, limit = 20, enabled = true } = options;

  // Check if Giphy is configured
  const isConfigured = isGiphyConfigured();

  const [query, setQueryState] = useState("");
  const [gifs, setGifs] = useState<GifItem[]>([]);
  // Start as true if configured, false otherwise
  const [isLoading, setIsLoading] = useState(isConfigured);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Ref to track the latest query for debouncing
  const latestQueryRef = useRef(query);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch GIFs (either search or trending)
  const fetchGifs = useCallback(
    async (
      searchQuery: string,
      newOffset: number = 0,
      append: boolean = false
    ) => {
      setIsLoading(true);
      setError(null);

      try {
        const results = searchQuery.trim()
          ? await searchGifs(searchQuery, limit, newOffset)
          : await getTrendingGifs(limit, newOffset);

        if (append) {
          setGifs((prev) => [...prev, ...results]);
        } else {
          setGifs(results);
        }

        setHasMore(results.length === limit);
        setOffset(newOffset + results.length);
      } catch (err) {
        Sentry.addBreadcrumb({ category: "giphy", message: "GIF fetch failed", data: { error: String(err) }, level: "warning" });
        setError(err instanceof Error ? err.message : "Failed to load GIFs");
        if (!append) {
          setGifs([]);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [limit]
  );

  // Set query with debouncing
  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryState(newQuery);
      latestQueryRef.current = newQuery;

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        // Only fetch if this is still the latest query
        if (latestQueryRef.current === newQuery) {
          setOffset(0);
          fetchGifs(newQuery, 0, false);
        }
      }, debounceMs);
    },
    [debounceMs, fetchGifs]
  );

  // Load more GIFs (pagination)
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchGifs(query, offset, true);
    }
  }, [isLoading, hasMore, query, offset, fetchGifs]);

  // Refresh GIFs
  const refresh = useCallback(() => {
    setOffset(0);
    fetchGifs(query, 0, false);
  }, [query, fetchGifs]);

  // Load trending GIFs on mount (only if configured)
  useEffect(() => {
    if (isConfigured && enabled) {
      fetchGifs("", 0, false);
    }

    // Cleanup debounce timer on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isConfigured, enabled]);

  return {
    gifs,
    isLoading,
    error,
    query,
    setQuery,
    loadMore,
    hasMore,
    refresh,
    isConfigured,
  };
}
