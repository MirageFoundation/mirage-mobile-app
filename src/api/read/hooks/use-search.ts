import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { search, type SearchParams } from "../endpoints/search";
import { normalizeSearchRequestQuery } from "../search-query";
import { useAuthStore } from "@/src/stores";
import { usePreferencesStore, getAllowedTagsFromContentTypes } from "@/src/stores/preferences-store";

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
  const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const allowedTags = getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled);
  const normalizedQuery = normalizeSearchRequestQuery(query, params?.type);

  return useQuery({
    queryKey: queryKeys.search(normalizedQuery, params?.type, params?.limit, allowedTags, walletAddress),
    queryFn: () =>
      search({
        q: normalizedQuery,
        address: walletAddress ?? undefined,
        allowed_tags: allowedTags || undefined,
        ...params,
      }),
    enabled: normalizedQuery.length >= 1,
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
