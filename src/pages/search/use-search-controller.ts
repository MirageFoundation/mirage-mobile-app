import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, TextInput } from "react-native";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useCommunities, useDebouncedSearch, usePosts } from "@/src/api/read";
import type { Post, SearchCommunityInfo, UserInfo } from "@/src/api/types";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { communityLabel } from "@/src/domain/communities";
import { useTabSwipeGesture } from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import { useContentModerationStore, useSearchStore, type RecentSearch } from "@/src/stores";
import {
  buildSearchDiscoverySections,
  getSearchTabCounts,
  normalizeSearchQuery,
  resolveSearchTab,
  searchIndexToTab,
  searchTabToIndex,
  selectTrendingCommunities,
  shouldShowSearchResults,
} from "./search-state";
import { SCREEN_WIDTH, type SearchTab } from "./search-utils";

export function useSearchController() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const { q, tab } = useLocalSearchParams<{ q?: string; tab?: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>(resolveSearchTab(tab));
  const [selectedCommunity, setSelectedCommunity] = useState<SearchCommunityInfo | null>(null);
  const animatedTabIndex = useSharedValue(searchTabToIndex(activeTab));

  const hiddenPostIds = useContentModerationStore((state) => state.hiddenPostIds);
  const recentSearches = useSearchStore((state) => state.recentSearches);
  const addRecentSearch = useSearchStore((state) => state.addRecentSearch);
  const removeRecentSearch = useSearchStore((state) => state.removeRecentSearch);
  const clearRecentSearches = useSearchStore(
    (state) => state.clearRecentSearches,
  );

  const search = useDebouncedSearch(searchQuery, 750, { limit: 30 });
  const communityPostsQuery = usePosts({
    community: selectedCommunity?.community,
    limit: 50,
  });
  const topicsQuery = useCommunities({ limit: 20 });

  const trendingCommunities = useMemo(
    () => selectTrendingCommunities(topicsQuery.data?.items),
    [topicsQuery.data?.items],
  );
  const communityPosts = useMemo(
    () =>
      (communityPostsQuery.data?.posts ?? []).filter(
        (post) => !hiddenPostIds.has(post.post_id),
      ),
    [hiddenPostIds, communityPostsQuery.data?.posts],
  );
  const searchResults = useMemo(() => {
    if (!search.data) return search.data;
    return {
      ...search.data,
      posts: search.data.posts.filter((post) => !hiddenPostIds.has(post.post_id)),
    };
  }, [hiddenPostIds, search.data]);
  const showResults = shouldShowSearchResults(
    searchQuery,
    search.debouncedQuery,
  );
  const hasSearchQuery = normalizeSearchQuery(searchQuery).length > 0;
  const tabCounts = getSearchTabCounts({
    postCount: searchResults?.posts.length ?? 0,
    communityCount: search.data?.communities.length ?? 0,
    communityPostCount: communityPosts.length,
    userCount: search.data?.users.length ?? 0,
    hasSelectedCommunity: !!selectedCommunity,
  });
  const discoverySections = useMemo(
    () =>
      buildSearchDiscoverySections(
        recentSearches,
        trendingCommunities,
        topicsQuery.isLoading,
      ),
    [recentSearches, topicsQuery.isLoading, trendingCommunities],
  );

  const handleSwipeTabChange = useCallback((index: number) => {
    const nextTab = searchIndexToTab(index);
    setActiveTab(nextTab);
    if (nextTab !== "communities") setSelectedCommunity(null);
  }, []);

  const {
    swipeGesture,
    contentAnimatedStyle,
    fadeOpacity,
    completeTransition,
  } = useTabSwipeGesture({
    onTabChange: handleSwipeTabChange,
    animatedIndex: animatedTabIndex,
    tabCount: 3,
  });

  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: animatedTabIndex.value * (SCREEN_WIDTH / 3) },
    ],
  }));

  useEffect(() => {
    if (q) setSearchQuery(q);
    setActiveTab(resolveSearchTab(tab));

    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [q, tab]);

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    Keyboard.dismiss();
    router.back();
  }, [router]);

  const handleQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedCommunity(null);
  }, []);

  const handleClearInput = useCallback(() => {
    triggerHaptic("light");
    setSearchQuery("");
    setSelectedCommunity(null);
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      const trimmedQuery = normalizeSearchQuery(query);
      if (!trimmedQuery) return;

      triggerHaptic("light");
      addRecentSearch(trimmedQuery);
      Keyboard.dismiss();
    },
    [addRecentSearch],
  );

  const handleRecentSearchPress = useCallback(
    (recentSearch: RecentSearch) => {
      triggerHaptic("light");
      setSearchQuery(recentSearch.query);
      setSelectedCommunity(null);
      handleSearch(recentSearch.query);
    },
    [handleSearch],
  );

  const handleRemoveRecentSearch = useCallback(
    (id: string) => {
      triggerHaptic("light");
      removeRecentSearch(id);
    },
    [removeRecentSearch],
  );

  const handleClearAllRecentSearches = useCallback(() => {
    triggerHaptic("light");
    clearRecentSearches();
  }, [clearRecentSearches]);

  const handleCommunityPress = useCallback(
    (topic: SearchCommunityInfo) => {
      triggerHaptic("light");
      addRecentSearch(communityLabel(topic.community));
      Keyboard.dismiss();
      router.push(`/c/${encodeURIComponent(topic.community)}` as never);
    },
    [addRecentSearch, router],
  );

  const handleBackFromCommunity = useCallback(() => {
    triggerHaptic("light");
    setSelectedCommunity(null);
  }, []);

  const handlePostPress = useCallback(
    (post: Post) => {
      triggerHaptic("light");
      Keyboard.dismiss();
      router.push(`/post/${post.post_id}`);
    },
    [router],
  );

  const handleUserPress = useCallback(
    (user: UserInfo) => {
      triggerHaptic("light");
      addRecentSearch(`@${user.username}`);
      Keyboard.dismiss();
      router.push(`/user/${user.address}`);
    },
    [addRecentSearch, router],
  );

  const handleTabPress = useCallback(
    (nextTab: SearchTab) => {
      triggerHaptic("light");
      const nextIndex = searchTabToIndex(nextTab);
      if (nextIndex === searchTabToIndex(activeTab)) return;

      animatedTabIndex.value = withTiming(nextIndex, { duration: 200 });
      fadeOpacity.value = withTiming(0, { duration: 100 }, (finished) => {
        "worklet";
        if (finished) runOnJS(completeTransition)(nextIndex);
      });
    },
    [
      activeTab,
      animatedTabIndex,
      completeTransition,
      fadeOpacity,
    ],
  );

  return {
    inputRef,
    searchQuery,
    isFocused,
    setIsFocused,
    activeTab,
    selectedCommunity,
    searchResults,
    isSearching: search.isSearching,
    hasSearchQuery,
    showResults,
    communityPosts,
    isLoadingCommunityPosts: communityPostsQuery.isLoading,
    discoverySections,
    tabCounts,
    swipeGesture,
    contentAnimatedStyle,
    tabIndicatorStyle,
    handleBack,
    handleQueryChange,
    handleClearInput,
    handleSubmitEditing: () => handleSearch(searchQuery),
    handleRecentSearchPress,
    handleRemoveRecentSearch,
    handleClearAllRecentSearches,
    handleCommunityPress,
    handleBackFromCommunity,
    handlePostPress,
    handleUserPress,
    handleTabPress,
  };
}

export type SearchController = ReturnType<typeof useSearchController>;
