import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, TextInput } from "react-native";
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useDebouncedSearch, usePosts, useTopics } from "@/src/api/read";
import type { Post, TopicInfo, UserInfo } from "@/src/api/types";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useTabSwipeGesture } from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import { useSearchStore, type RecentSearch } from "@/src/stores";
import {
  buildSearchDiscoverySections,
  getSearchTabCounts,
  normalizeSearchQuery,
  resolveSearchTab,
  searchIndexToTab,
  searchTabToIndex,
  selectTrendingTopics,
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
  const [selectedTopic, setSelectedTopic] = useState<TopicInfo | null>(null);
  const animatedTabIndex = useSharedValue(searchTabToIndex(activeTab));

  const recentSearches = useSearchStore((state) => state.recentSearches);
  const addRecentSearch = useSearchStore((state) => state.addRecentSearch);
  const removeRecentSearch = useSearchStore((state) => state.removeRecentSearch);
  const clearRecentSearches = useSearchStore(
    (state) => state.clearRecentSearches,
  );

  const search = useDebouncedSearch(searchQuery, 750, { limit: 30 });
  const topicPostsQuery = usePosts({
    topic: selectedTopic?.topic,
    limit: 50,
  });
  const topicsQuery = useTopics(20);

  const trendingTopics = useMemo(
    () => selectTrendingTopics(topicsQuery.data?.topics),
    [topicsQuery.data?.topics],
  );
  const topicPosts = topicPostsQuery.data?.posts ?? [];
  const showResults = shouldShowSearchResults(
    searchQuery,
    search.debouncedQuery,
  );
  const hasSearchQuery = normalizeSearchQuery(searchQuery).length > 0;
  const tabCounts = getSearchTabCounts({
    postCount: search.data?.posts.length ?? 0,
    topicCount: search.data?.topics.length ?? 0,
    topicPostCount: topicPosts.length,
    userCount: search.data?.users.length ?? 0,
    hasSelectedTopic: !!selectedTopic,
  });
  const discoverySections = useMemo(
    () =>
      buildSearchDiscoverySections(
        recentSearches,
        trendingTopics,
        topicsQuery.isLoading,
      ),
    [recentSearches, topicsQuery.isLoading, trendingTopics],
  );

  const handleSwipeTabChange = useCallback((index: number) => {
    const nextTab = searchIndexToTab(index);
    setActiveTab(nextTab);
    if (nextTab !== "topics") setSelectedTopic(null);
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
    setSelectedTopic(null);
  }, []);

  const handleClearInput = useCallback(() => {
    triggerHaptic("light");
    setSearchQuery("");
    setSelectedTopic(null);
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
      setSelectedTopic(null);
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

  const handleTopicPress = useCallback(
    (topic: TopicInfo) => {
      triggerHaptic("light");
      addRecentSearch(topic.topic);
      Keyboard.dismiss();
      router.push(`/topic/${encodeURIComponent(topic.topic)}`);
    },
    [addRecentSearch, router],
  );

  const handleBackFromTopic = useCallback(() => {
    triggerHaptic("light");
    setSelectedTopic(null);
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
    selectedTopic,
    searchResults: search.data,
    isSearching: search.isSearching,
    hasSearchQuery,
    showResults,
    topicPosts,
    isLoadingTopicPosts: topicPostsQuery.isLoading,
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
    handleTopicPress,
    handleBackFromTopic,
    handlePostPress,
    handleUserPress,
    handleTabPress,
  };
}

export type SearchController = ReturnType<typeof useSearchController>;
