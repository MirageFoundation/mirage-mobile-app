import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useDebouncedSearch, usePosts, useTopics } from "@/src/api/read";
import type { Post, TopicInfo, UserInfo } from "@/src/api/types";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useTabSwipeGesture } from "@/src/hooks";
import { useSearchStore, type RecentSearch } from "@/src/stores";

import { SearchEmptyState } from "./search/search-empty-state";
import { SearchHeader } from "./search/search-header";
import {
  PostResultItem,
  RecentSearchItem,
  TopicListItem,
  UserResultItem,
} from "./search/search-result-items";
import { SearchTabs } from "./search/search-tabs";
import {
  indexToTab,
  SCREEN_WIDTH,
  SearchTab,
  tabToIndex,
} from "./search/search-utils";

export function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const inputRef = useRef<TextInput>(null);
  const { q, tab } = useLocalSearchParams<{ q?: string; tab?: string }>();

  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>(
    tab === "topics" || tab === "users" ? tab : "posts",
  );
  const [selectedTopic, setSelectedTopic] = useState<TopicInfo | null>(null);

  const animatedTabIndex = useSharedValue(tabToIndex(activeTab));

  const recentSearches = useSearchStore((state) => state.recentSearches);
  const addRecentSearch = useSearchStore((state) => state.addRecentSearch);
  const removeRecentSearch = useSearchStore((state) => state.removeRecentSearch);
  const clearRecentSearches = useSearchStore((state) => state.clearRecentSearches);

  const {
    data: searchResults,
    isSearching,
    debouncedQuery,
  } = useDebouncedSearch(searchQuery, 750, { limit: 30 });

  const { data: topicPostsData, isLoading: isLoadingTopicPosts } = usePosts({
    topic: selectedTopic?.topic,
    limit: 50,
  });

  const { data: topicsData, isLoading: isLoadingTopics } = useTopics(20);

  const trendingTopics = useMemo(() => {
    if (!topicsData?.topics) return [];
    return [...topicsData.topics]
      .filter((topic) => topic.post_count && topic.post_count > 0)
      .sort((a, b) => (b.post_count || 0) - (a.post_count || 0))
      .slice(0, 10);
  }, [topicsData]);

  const topicPosts = useMemo(() => topicPostsData?.posts ?? [], [topicPostsData]);

  useEffect(() => {
    if (q) {
      setSearchQuery(q);
    }
    if (tab === "topics" || tab === "users") {
      setActiveTab(tab);
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [q, tab]);

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    Keyboard.dismiss();
    router.back();
  }, [router]);

  const handleClearInput = useCallback(() => {
    triggerHaptic("light");
    setSearchQuery("");
    setSelectedTopic(null);
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;
      triggerHaptic("light");
      addRecentSearch(trimmedQuery);
      Keyboard.dismiss();
    },
    [addRecentSearch],
  );

  const handleRecentSearchPress = useCallback(
    (search: RecentSearch) => {
      triggerHaptic("light");
      setSearchQuery(search.query);
      setSelectedTopic(null);
      handleSearch(search.query);
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

  const handleTrendingTopicPress = useCallback(
    (topic: TopicInfo) => {
      triggerHaptic("light");
      addRecentSearch(topic.topic);
      Keyboard.dismiss();
      router.push(`/topic/${encodeURIComponent(topic.topic)}`);
    },
    [addRecentSearch, router],
  );

  const handleTopicResultPress = useCallback(
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

  const handlePostResultPress = useCallback(
    (post: Post) => {
      triggerHaptic("light");
      Keyboard.dismiss();
      router.push(`/post/${post.post_id}`);
    },
    [router],
  );

  const handleUserResultPress = useCallback(
    (user: UserInfo) => {
      triggerHaptic("light");
      addRecentSearch(`@${user.username}`);
      Keyboard.dismiss();
      router.push(`/user/${user.address}`);
    },
    [addRecentSearch, router],
  );

  const handleSubmitEditing = useCallback(() => {
    handleSearch(searchQuery);
  }, [handleSearch, searchQuery]);

  const handleSwipeTabChange = useCallback((index: number) => {
    const nextTab = indexToTab(index);
    setActiveTab(nextTab);
    if (nextTab !== "topics") {
      setSelectedTopic(null);
    }
  }, []);

  const { swipeGesture, contentAnimatedStyle, fadeOpacity, completeTransition } =
    useTabSwipeGesture({
      onTabChange: handleSwipeTabChange,
      animatedIndex: animatedTabIndex,
      tabCount: 3,
    });

  const handleTabPress = useCallback(
    (tabName: SearchTab) => {
      triggerHaptic("light");
      const index = tabToIndex(tabName);
      if (index === tabToIndex(activeTab)) return;
      animatedTabIndex.value = withTiming(index, { duration: 200 });
      fadeOpacity.value = withTiming(
        0,
        { duration: 100 },
        (finished) => {
          "worklet";
          if (finished) {
            runOnJS(completeTransition)(index);
          }
        },
      );
    },
    [activeTab, animatedTabIndex, completeTransition, fadeOpacity],
  );

  const singleTabWidth = SCREEN_WIDTH / 3;
  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: animatedTabIndex.value * singleTabWidth }],
  }));

  const renderRecentSearchItem = useCallback(
    ({ item, index }: { item: RecentSearch; index: number }) => (
      <RecentSearchItem
        item={item}
        index={index}
        subtleTextColor={theme.colors.text.subtle}
        onPress={() => handleRecentSearchPress(item)}
        onRemove={() => handleRemoveRecentSearch(item.id)}
      />
    ),
    [handleRecentSearchPress, handleRemoveRecentSearch, theme.colors.text.subtle],
  );

  const renderTrendingTopicItem = useCallback(
    ({ item, index }: { item: TopicInfo; index: number }) => (
      <TopicListItem
        topic={item}
        index={index}
        isTrending
        subtleTextColor={theme.colors.text.subtle}
        dividerColor={theme.colors.border.subtle}
        onPress={() => handleTrendingTopicPress(item)}
      />
    ),
    [handleTrendingTopicPress, theme.colors.border.subtle, theme.colors.text.subtle],
  );

  const renderTopicResult = useCallback(
    ({ item, index }: { item: TopicInfo; index: number }) => (
      <TopicListItem
        topic={item}
        index={index}
        isLast={index === (searchResults?.topics.length ?? 0) - 1}
        subtleTextColor={theme.colors.text.subtle}
        dividerColor={theme.colors.border.subtle}
        onPress={() => handleTopicResultPress(item)}
      />
    ),
    [handleTopicResultPress, searchResults?.topics.length, theme.colors.border.subtle, theme.colors.text.subtle],
  );

  const renderPostResult = useCallback(
    ({ item, index }: { item: Post; index: number }) => {
      const totalPosts = selectedTopic ? topicPosts.length : searchResults?.posts.length ?? 0;
      return (
        <PostResultItem
          item={item}
          index={index}
          total={totalPosts}
          dividerColor={theme.colors.border.subtle}
          onPress={() => handlePostResultPress(item)}
        />
      );
    },
    [handlePostResultPress, searchResults?.posts.length, selectedTopic, theme.colors.border.subtle, topicPosts.length],
  );

  const renderUserResult = useCallback(
    ({ item, index }: { item: UserInfo; index: number }) => (
      <UserResultItem
        item={item}
        index={index}
        total={searchResults?.users.length ?? 0}
        subtleTextColor={theme.colors.text.subtle}
        dividerColor={theme.colors.border.subtle}
        onPress={() => handleUserResultPress(item)}
      />
    ),
    [handleUserResultPress, searchResults?.users.length, theme.colors.border.subtle, theme.colors.text.subtle],
  );

  const hasSearchQuery = searchQuery.trim().length > 0;
  const showResults = hasSearchQuery && debouncedQuery;
  const topicsTabCount = selectedTopic ? topicPosts.length : searchResults?.topics.length ?? 0;

  const topicPostsHeader = useMemo(() => {
    if (!selectedTopic) return null;
    return (
      <View style={styles.topicHeader}>
        <Pressable onPress={handleBackFromTopic} style={({ pressed }) => [styles.topicBackButton, pressed && { opacity: 0.7 }]}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
          #{selectedTopic.topic}
        </Text>
      </View>
    );
  }, [handleBackFromTopic, selectedTopic, theme.colors.text.default]);

  return (
    <Box flex background="base">
      <SearchHeader
        topInset={insets.top}
        query={searchQuery}
        isFocused={isFocused}
        isSearching={isSearching}
        inputRef={inputRef}
        textColor={theme.colors.text.default}
        subtleTextColor={theme.colors.text.subtle}
        lighterBackgroundColor={theme.colors.background.lighter}
        borderColor={theme.colors.border.subtle}
        primaryColor={theme.colors.primary[500]}
        backgroundColor={theme.colors.background.default}
        onBack={handleBack}
        onChangeQuery={(text) => {
          setSearchQuery(text);
          setSelectedTopic(null);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onSubmit={handleSubmitEditing}
        onClear={handleClearInput}
      />

      <SearchTabs
        visible={!!showResults}
        activeTab={activeTab}
        postsCount={searchResults?.posts.length ?? 0}
        topicsCount={topicsTabCount}
        usersCount={searchResults?.users.length ?? 0}
        backgroundColor={theme.colors.background.default}
        borderColor={theme.colors.border.subtle}
        primaryColor={theme.colors.primary[500]}
        subtleTextColor={theme.colors.text.subtle}
        inverseTextColor={theme.colors.background.default}
        singleTabWidth={singleTabWidth}
        tabIndicatorStyle={tabIndicatorStyle}
        onPressTab={handleTabPress}
      />

      {showResults ? (
        <GestureDetector gesture={swipeGesture}>
          <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
            {activeTab === "posts" ? (
              <FlatList
                data={searchResults?.posts ?? []}
                keyExtractor={(item) => `post-${item.post_id}`}
                renderItem={renderPostResult}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
                ListEmptyComponent={
                  !isSearching
                    ? () => (
                        <SearchEmptyState
                          icon="document-text-outline"
                          title="No posts found"
                          description="Try searching with different keywords"
                          color={theme.colors.text.subtle}
                        />
                      )
                    : null
                }
              />
            ) : activeTab === "topics" ? (
              selectedTopic ? (
                <FlatList
                  data={topicPosts}
                  keyExtractor={(item) => `topic-post-${item.post_id}`}
                  renderItem={renderPostResult}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
                  ListHeaderComponent={topicPostsHeader}
                  ListEmptyComponent={
                    isLoadingTopicPosts
                      ? () => (
                          <View style={styles.loadingState}>
                            <ActivityIndicator size="small" color={theme.colors.primary[500]} />
                          </View>
                        )
                      : () => (
                          <SearchEmptyState
                            icon="document-text-outline"
                            title="No posts found"
                            description="Try searching with different keywords"
                            color={theme.colors.text.subtle}
                          />
                        )
                  }
                />
              ) : (
                <FlatList
                  data={searchResults?.topics ?? []}
                  keyExtractor={(item) => `topic-${item.topic}`}
                  renderItem={renderTopicResult}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
                  ListEmptyComponent={
                    !isSearching
                      ? () => (
                          <SearchEmptyState
                            icon="pricetag-outline"
                            title="No topics found"
                            description="Try searching for a different topic name"
                            color={theme.colors.text.subtle}
                          />
                        )
                      : null
                  }
                />
              )
            ) : (
              <FlatList
                data={searchResults?.users ?? []}
                keyExtractor={(item) => `user-${item.address}`}
                renderItem={renderUserResult}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
                ListEmptyComponent={
                  !isSearching
                    ? () => (
                        <SearchEmptyState
                          icon="people-outline"
                          title="No users found"
                          description="Try searching for a username"
                          color={theme.colors.text.subtle}
                        />
                      )
                    : null
                }
              />
            )}
          </Animated.View>
        </GestureDetector>
      ) : (
        <FlatList
          data={[]}
          renderItem={null as any}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          ListHeaderComponent={
            <>
              {recentSearches.length > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text size="sm" weight="semibold" mode="subtle" style={styles.sectionHeaderTitle}>
                      RECENT
                    </Text>
                    <Pressable onPress={handleClearAllRecentSearches} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
                      <Text size="sm" style={{ color: theme.colors.primary[500] }}>
                        Clear all
                      </Text>
                    </Pressable>
                  </View>
                  <FlatList
                    data={recentSearches}
                    keyExtractor={(item) => item.id}
                    renderItem={renderRecentSearchItem}
                    scrollEnabled={false}
                  />
                </View>
              ) : null}

              <View style={styles.section}>
                <Text size="sm" weight="semibold" mode="subtle" style={styles.sectionTitle}>
                  TRENDING TOPICS
                </Text>
                {isLoadingTopics ? (
                  <View style={styles.loadingState}>
                    <ActivityIndicator size="small" color={theme.colors.primary[500]} />
                  </View>
                ) : trendingTopics.length > 0 ? (
                  <FlatList
                    data={trendingTopics}
                    keyExtractor={(item) => `trending-${item.topic}`}
                    renderItem={renderTrendingTopicItem}
                    scrollEnabled={false}
                  />
                ) : (
                  <View style={styles.emptyTrendingState}>
                    <Text size="sm" mode="subtle">
                      No trending topics available
                    </Text>
                  </View>
                )}
              </View>
            </>
          }
        />
      )}
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  loadingState: {
    paddingVertical: theme.spacing.xl,
    alignItems: "center",
  },
  section: {
    paddingTop: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.sm,
  },
  sectionHeaderTitle: {
    letterSpacing: 0.8,
  },
  sectionTitle: {
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.8,
  },
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  topicBackButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  emptyTrendingState: {
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
  },
}));
