import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { search, type SearchParams } from "../endpoints/search";
import { normalizeSearchRequestQuery } from "../search-query";
import { withSessionLensPicks } from "../request-params";
import { useAuthStore, useEncodedLensPicks } from "@/src/stores";
import { usePreferencesStore, getAllowedTagsFromContentTypes } from "@/src/stores/preferences-store";
import { shouldRetrySignedContentRead } from "../signed-content-read";

/**
 * Search across communities, users, and posts
 * Prefix @ for users, [slug] for communities
 *
 * @param query - Search query
 * @param params - Search parameters
 */
export function useSearch(
  query: string | undefined | null,
  params?: Omit<SearchParams, "q" | "address">
) {
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const allowedTags = getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled);
  const encodedPicks = useEncodedLensPicks(walletAddress);
  const normalizedQuery = normalizeSearchRequestQuery(query, params?.type);
  const lensParams = withSessionLensPicks({
    lens: params?.lens,
    team_id: params?.team_id,
    scope: params?.scope,
    lens_picks: params?.lens_picks ?? encodedPicks,
    offset: params?.offset,
  }, walletAddress);

  return useQuery({
    queryKey: queryKeys.search(
      normalizedQuery,
      params?.type,
      params?.limit,
      allowedTags,
      walletAddress,
      lensParams,
    ),
    queryFn: ({ signal }) =>
      search({
        q: normalizedQuery,
        address: walletAddress ?? undefined,
        allowed_tags: allowedTags || undefined,
        ...params,
        ...lensParams,
      }, { signal }),
    enabled: normalizedQuery.length >= 1,
    staleTime: 1000 * 60, // 1 minute
    retry: (failureCount, error) =>
      shouldRetrySignedContentRead(failureCount, error),
  });
}

/**
 * Search for users only
 */
export function useSearchUsers(query: string | undefined | null, limit?: number) {
  return useSearch(query, { type: "users", limit });
}

/**
 * Search for communities only
 */
export function useSearchCommunitiesOnly(query: string | undefined | null, limit?: number) {
  return useSearch(query, { type: "communities", limit });
}

/**
 * Search for posts only
 */
export function useSearchPosts(query: string | undefined | null, limit?: number) {
  return useSearch(query, { type: "posts", limit });
}
