import type { TopicInfo } from "@/src/api/types";
import type { RecentSearch } from "@/src/stores";
import type { SearchTab } from "./search-utils";

export const SEARCH_TABS: readonly SearchTab[] = ["posts", "topics", "users"];

export type SearchDiscoverySection =
  | { key: "recent"; items: RecentSearch[] }
  | { key: "trending"; items: TopicInfo[]; isLoading: boolean };

export function resolveSearchTab(tab?: string): SearchTab {
  return tab === "topics" || tab === "users" ? tab : "posts";
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

export function selectTrendingTopics(
  topics: TopicInfo[] | undefined,
  limit = 10,
): TopicInfo[] {
  return [...(topics ?? [])]
    .filter((topic) => (topic.post_count ?? 0) > 0)
    .sort((left, right) =>
      (right.post_count ?? 0) - (left.post_count ?? 0),
    )
    .slice(0, limit);
}

export function buildSearchDiscoverySections(
  recentSearches: RecentSearch[],
  trendingTopics: TopicInfo[],
  isLoadingTopics: boolean,
): SearchDiscoverySection[] {
  const sections: SearchDiscoverySection[] = [];

  if (recentSearches.length > 0) {
    sections.push({ key: "recent", items: recentSearches });
  }

  sections.push({
    key: "trending",
    items: trendingTopics,
    isLoading: isLoadingTopics,
  });

  return sections;
}

export function getSearchTabCounts({
  postCount,
  topicCount,
  topicPostCount,
  userCount,
  hasSelectedTopic,
}: {
  postCount: number;
  topicCount: number;
  topicPostCount: number;
  userCount: number;
  hasSelectedTopic: boolean;
}): Record<SearchTab, number> {
  return {
    posts: postCount,
    topics: hasSelectedTopic ? topicPostCount : topicCount,
    users: userCount,
  };
}
