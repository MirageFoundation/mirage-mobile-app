import type { SearchCommunityInfo } from "@/src/api/types";
import { communityLabel, isRoutableCommunitySlug } from "@/src/domain/communities";
import type { RecentSearch } from "@/src/stores";
import type { SearchTab } from "./search-utils";

export const SEARCH_TABS: readonly SearchTab[] = ["posts", "communities", "users"];
export const SEARCH_TAB_LABELS: Record<SearchTab, string> = {
  posts: "Posts",
  communities: "Communities",
  users: "Users",
};

export function recentSearchLabel(query: string): string {
  const match = query.trim().match(/^(?:#([a-z0-9-]+)|\[([a-z0-9-]+)\])$/i);
  const slug = match?.[1] ?? match?.[2];
  return slug && isRoutableCommunitySlug(slug) ? communityLabel(slug) : query;
}

export type SearchDiscoverySection =
  | { key: "recent"; items: RecentSearch[] }
  | { key: "trending"; items: SearchCommunityInfo[]; isLoading: boolean };

export function resolveSearchTab(tab?: string): SearchTab {
  return tab === "communities" || tab === "users" ? tab : "posts";
}

export function searchTabToIndex(tab: SearchTab): number {
  return SEARCH_TABS.indexOf(tab);
}

export function searchIndexToTab(index: number): SearchTab {
  return SEARCH_TABS[index] ?? "posts";
}

export function normalizeSearchQuery(query?: string | null): string {
  return query?.trim() ?? "";
}

export function shouldShowSearchResults(
  query: string,
  debouncedQuery?: string | null,
): boolean {
  return normalizeSearchQuery(query).length > 0 && !!debouncedQuery;
}

export function selectTrendingCommunities(
  communities: { community: string; post_count?: number }[] | undefined,
  limit = 10,
): SearchCommunityInfo[] {
  return [...(communities ?? [])]
    .filter((item) => (item.post_count ?? 0) > 0)
    .sort((left, right) =>
      (right.post_count ?? 0) - (left.post_count ?? 0),
    )
    .slice(0, limit)
    .map((item) => ({
      community: item.community,
      post_count: item.post_count,
    }));
}

export function buildSearchDiscoverySections(
  recentSearches: RecentSearch[],
  trendingCommunities: SearchCommunityInfo[],
  isLoadingCommunities: boolean,
): SearchDiscoverySection[] {
  const sections: SearchDiscoverySection[] = [];

  if (recentSearches.length > 0) {
    sections.push({ key: "recent", items: recentSearches });
  }

  sections.push({
    key: "trending",
    items: trendingCommunities,
    isLoading: isLoadingCommunities,
  });

  return sections;
}

export function getSearchTabCounts({
  postCount,
  communityCount,
  communityPostCount,
  userCount,
  hasSelectedCommunity,
}: {
  postCount: number;
  communityCount: number;
  communityPostCount: number;
  userCount: number;
  hasSelectedCommunity: boolean;
}): Record<SearchTab, number> {
  return {
    posts: postCount,
    communities: hasSelectedCommunity ? communityPostCount : communityCount,
    users: userCount,
  };
}
