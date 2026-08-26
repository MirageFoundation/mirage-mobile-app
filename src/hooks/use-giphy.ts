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
import {
  isAbortError,
  RequestGenerationCoordinator,
  type RequestGeneration,
} from "@/src/utils/request-generation";
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
  const [isLoading, setIsLoading] = useState(isConfigured && enabled);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const coordinatorRef = useRef(new RequestGenerationCoordinator());
  const activeSearchRef = useRef<RequestGeneration | null>(null);
  const latestQueryRef = useRef("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizeQuery = useCallback((value: string) => value.trim().toLowerCase(), []);

  const activateSearch = useCallback((searchQuery: string) => {
    const active = coordinatorRef.current.activate(normalizeQuery(searchQuery));
    activeSearchRef.current = active;
    return active;
  }, [normalizeQuery]);

  // Fetch GIFs (either search or trending)
  const fetchGifs = useCallback(
    async (
      searchQuery: string,
      newOffset: number = 0,
      append: boolean = false,
      activeSearch: RequestGeneration,
    ) => {
      const token = coordinatorRef.current.start(activeSearch);
      if (!token) return;
      setIsLoading(true);
      setError(null);

      try {
        const results = searchQuery
          ? await searchGifs(searchQuery, limit, newOffset, token.signal)
          : await getTrendingGifs(limit, newOffset, token.signal);

        if (!coordinatorRef.current.isCurrent(token)) return;

        if (append) {
          setGifs((prev) => {
            const existingIds = new Set(prev.map((gif) => gif.id));
            return [...prev, ...results.filter((gif) => !existingIds.has(gif.id))];
          });
        } else {
          setGifs(results);
        }

        setHasMore(results.length === limit);
        setOffset(newOffset + results.length);
      } catch (err) {
        if (!coordinatorRef.current.isCurrent(token) || isAbortError(err)) return;
        Sentry.addBreadcrumb({ category: "giphy", message: "GIF fetch failed", level: "warning" });
        setError(err instanceof Error ? err.message : "Failed to load GIFs");
        if (!append) {
          setGifs([]);
        }
      } finally {
        if (coordinatorRef.current.isCurrent(token)) {
          setIsLoading(false);
          coordinatorRef.current.settle(token);
        }
      }
    },
    [limit]
  );

  // Set query with debouncing
  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryState(newQuery);
      const normalizedQuery = normalizeQuery(newQuery);
      latestQueryRef.current = normalizedQuery;
      const activeSearch = activateSearch(normalizedQuery);
      setIsLoading(false);
      setError(null);

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        if (enabled && coordinatorRef.current.isGenerationActive(activeSearch)) {
          setOffset(0);
          fetchGifs(normalizedQuery, 0, false, activeSearch);
        }
      }, debounceMs);
    },
    [activateSearch, debounceMs, enabled, fetchGifs, normalizeQuery]
  );

  // Load more GIFs (pagination)
  const loadMore = useCallback(() => {
    const activeSearch = activeSearchRef.current;
    if (!isLoading && hasMore && activeSearch) {
      fetchGifs(normalizeQuery(query), offset, true, activeSearch);
    }
  }, [isLoading, hasMore, query, offset, fetchGifs, normalizeQuery]);

  // Refresh GIFs
  const refresh = useCallback(() => {
    const normalizedQuery = normalizeQuery(query);
    const activeSearch = activateSearch(normalizedQuery);
    setOffset(0);
    fetchGifs(normalizedQuery, 0, false, activeSearch);
  }, [activateSearch, query, fetchGifs, normalizeQuery]);

  // Load trending GIFs on mount (only if configured)
  useEffect(() => {
    const coordinator = coordinatorRef.current;
    if (isConfigured && enabled) {
      const normalizedQuery = latestQueryRef.current;
      const activeSearch = activateSearch(normalizedQuery);
      fetchGifs(normalizedQuery, 0, false, activeSearch);
    } else {
      coordinator.invalidate();
      activeSearchRef.current = null;
      setIsLoading(false);
    }

    // Cleanup debounce timer on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      coordinator.invalidate();
    };
  }, [activateSearch, enabled, fetchGifs, isConfigured]);

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
