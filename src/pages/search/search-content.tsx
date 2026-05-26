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
  FadeIn,
  FadeInDown,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import {
  useDebouncedSearch,
  usePosts,
  useTopics,
} from "@/src/api/read";
import type { Post, TopicInfo, UserInfo } from "@/src/api/types";
import { getUsernameColor } from "@/src/utils/tiers";
import { Avatar } from "@/src/components/atoms";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useTabSwipeGesture } from "@/src/hooks";
import { useSearchStore, type RecentSearch } from "@/src/stores";
import { SearchPostResult } from "./search-post-result";
import { SearchRecentItem } from "./search-recent-item";
import { styles } from "./search-styles";
import {
  SCREEN_WIDTH,
  formatPostCount,
  getTopicIcon,
  type SearchTab,
} from "./search-utils";


export function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const inputRef = useRef<TextInput>(null);
  const { q, tab } = useLocalSearchParams<{ q?: string; tab?: string }>();

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>(
    tab === "topics" || tab === "users" ? tab : "posts",
  );

  const SEARCH_TABS: SearchTab[] = ["posts", "topics", "users"];
  const tabToIndex = (t: SearchTab) => SEARCH_TABS.indexOf(t);
  const indexToTab = (i: number) => SEARCH_TABS[i] ?? "posts";

  const animatedTabIndex = useSharedValue(tabToIndex(activeTab));

  const handleSwipeTabChange = useCallback((index: number) => {
    const t = indexToTab(index);
    setActiveTab(t);
    if (t !== "topics") setSelectedTopic(null);
  }, []);

  const { swipeGesture, contentAnimatedStyle, fadeOpacity, completeTransition } = useTabSwipeGesture({
    onTabChange: handleSwipeTabChange,
    animatedIndex: animatedTabIndex,
    tabCount: 3,
  });

  const [selectedTopic, setSelectedTopic] = useState<TopicInfo | null>(null);

  // Search store for recent searches
  const recentSearches = useSearchStore((s) => s.recentSearches);
  const addRecentSearch = useSearchStore((s) => s.addRecentSearch);
  const removeRecentSearch = useSearchStore((s) => s.removeRecentSearch);
  const clearRecentSearches = useSearchStore((s) => s.clearRecentSearches);

  // API hooks - Debounced search (300ms delay)
  const {
    data: searchResults,
    isSearching,
    debouncedQuery,
  } = useDebouncedSearch(searchQuery, 750, { limit: 30 });

  // Fetch posts for selected topic
  const { data: topicPostsData, isLoading: isLoadingTopicPosts } = usePosts({
    topic: selectedTopic?.topic,
    limit: 50,
  });

  // Trending topics - fetch topics sorted by activity
  const { data: topicsData, isLoading: isLoadingTopics } = useTopics(20);

  // Sort topics by post count to get "trending"
  const trendingTopics = useMemo(() => {
    if (!topicsData?.topics) return [];
    return [...topicsData.topics]
      .filter((t) => t.post_count && t.post_count > 0)
      .sort((a, b) => (b.post_count || 0) - (a.post_count || 0))
      .slice(0, 10);
  }, [topicsData]);

  // Posts for selected topic
  const topicPosts = useMemo(() => {
    if (!topicPostsData?.posts) return [];
    return topicPostsData.posts;
  }, [topicPostsData]);

  // Auto-focus the input when screen mounts
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
  }, [q]);

  // Handlers
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
    [router, addRecentSearch],
  );

  const handleSubmitEditing = useCallback(() => {
    handleSearch(searchQuery);
  }, [handleSearch, searchQuery]);

  const handleTabPress = useCallback((tab: SearchTab) => {
    triggerHaptic("light");
    const index = tabToIndex(tab);
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
  }, [activeTab, animatedTabIndex, fadeOpacity, completeTransition]);

  const singleTabWidth = SCREEN_WIDTH / 3;
  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: animatedTabIndex.value * singleTabWidth }],
  }));

  // Render recent search item
  const renderRecentSearchItem = useCallback(
    ({ item, index }: { item: RecentSearch; index: number }) => (
      <SearchRecentItem
        item={item}
        index={index}
        textSubtleColor={theme.colors.text.subtle}
        onPress={handleRecentSearchPress}
        onRemove={handleRemoveRecentSearch}
      />
    ),
    [
      theme.colors.text.subtle,
      handleRecentSearchPress,
      handleRemoveRecentSearch,
    ],
  );

  // Render trending topic item
  const renderTrendingTopicItem = useCallback(
    ({ item, index }: { item: TopicInfo; index: number }) => {
      const { icon, color } = getTopicIcon(item.topic);
      return (
        <Animated.View
          entering={FadeInDown.delay(index * 50 + 100).duration(200)}
        >
          <Pressable
            onPress={() => handleTrendingTopicPress(item)}
            style={({ pressed }) => [
              styles.trendingItem,
              pressed && { opacity: 0.7 },
            ]}
          >
            <View
              style={[styles.trendingIcon, { backgroundColor: `${color}15` }]}
            >
              <Ionicons name={icon} size={20} color={color} />
            </View>
            <View style={styles.trendingContent}>
              <Text size="md" weight="medium">
                #{item.topic}
              </Text>
              <Text size="sm" mode="subtle">
                {formatPostCount(item.post_count || item.count)}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      );
    },
    [handleTrendingTopicPress],
  );

  // Render topic search result with divider
  const renderTopicResult = useCallback(
    ({ item, index }: { item: TopicInfo; index: number }) => {
      const { icon, color } = getTopicIcon(item.topic);
      const isLast = index === (searchResults?.topics.length ?? 0) - 1;

      return (
        <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
          <Pressable
            onPress={() => handleTopicResultPress(item)}
            style={({ pressed }) => [
              styles.topicResultItem,
              pressed && { opacity: 0.7 },
            ]}
          >
            <View
              style={[
                styles.topicResultIcon,
                { backgroundColor: `${color}15` },
              ]}
            >
              <Ionicons name={icon} size={18} color={color} />
            </View>
            <View style={styles.topicResultContent}>
              <Text size="md" weight="medium">
                #{item.topic}
              </Text>
              {(item.post_count || item.count) && (
                <Text size="sm" mode="subtle">
                  {formatPostCount(item.post_count || item.count)}
                </Text>
              )}
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.text.subtle}
            />
          </Pressable>
          {!isLast && (
            <View
              style={[
                styles.divider,
                { backgroundColor: theme.colors.border.subtle },
              ]}
            />
          )}
        </Animated.View>
      );
    },
    [
      theme.colors.text.subtle,
      theme.colors.border.subtle,
      handleTopicResultPress,
      searchResults?.topics.length,
    ],
  );

  // Render post search result with new design
  const renderPostResult = useCallback(
    ({ item, index }: { item: Post; index: number }) => {
      const totalPosts = selectedTopic
        ? topicPosts.length
        : (searchResults?.posts.length ?? 0);

      return (
        <SearchPostResult
          item={item}
          index={index}
          totalPosts={totalPosts}
          dividerColor={theme.colors.border.subtle}
          textSubtleColor={theme.colors.text.subtle}
          onPress={handlePostResultPress}
        />
      );
    },
    [
      theme.colors.border.subtle,
      theme.colors.text.subtle,
      handlePostResultPress,
      searchResults?.posts.length,
      selectedTopic,
      topicPosts.length,
    ],
  );

  // Render user search result
  const renderUserResult = useCallback(
    ({ item, index }: { item: UserInfo; index: number }) => {
      const isLast = index === (searchResults?.users.length ?? 0) - 1;

      return (
        <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
          <Pressable
            onPress={() => handleUserResultPress(item)}
            style={({ pressed }) => [
              styles.userResultItem,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Avatar size="sm" seed={item.address} rounded="sm" />
            <View style={styles.userResultContent}>
              <View style={styles.userResultNameRow}>
                <Text
                  size="md"
                  weight="medium"
                  style={item.user_is_new ? { color: "rgb(94,194,106)" } : item.level ? { color: getUsernameColor(item.level) } : undefined}
                >
                  @{item.username}
                </Text>
                {item.level === 10 && (
                  <View style={[styles.agentTag, { backgroundColor: "#EF4444" }]}>
                    <Text size="xs" weight="semibold" style={{ color: "#fff" }}>Agent</Text>
                  </View>
                )}
              </View>
              <Text size="sm" mode="subtle" numberOfLines={1}>
                {item.address.slice(0, 8)}...{item.address.slice(-6)}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.text.subtle}
            />
          </Pressable>
          {!isLast && (
            <View
              style={[
                styles.divider,
                { backgroundColor: theme.colors.border.subtle },
              ]}
            />
          )}
        </Animated.View>
      );
    },
    [
      theme.colors.text.subtle,
      theme.colors.border.subtle,
      handleUserResultPress,
      searchResults?.users.length,
    ],
  );

  // Empty state for posts
  const PostsEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Ionicons
          name="document-text-outline"
          size={48}
          color={theme.colors.text.subtle}
          style={{ marginBottom: 12 }}
        />
        <Text size="lg" mode="subtle" weight="semibold">
          No posts found
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{ marginTop: 2, textAlign: "center" }}
        >
          Try searching with different keywords
        </Text>
      </View>
    ),
    [theme.colors.text.subtle],
  );

  // Empty state for topics
  const TopicsEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Ionicons
          name="pricetag-outline"
          size={48}
          color={theme.colors.text.subtle}
          style={{ marginBottom: 12 }}
        />
        <Text size="lg" mode="subtle" weight="semibold">
          No topics found
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{ marginTop: 4, textAlign: "center" }}
        >
          Try searching for a different topic name
        </Text>
      </View>
    ),
    [theme.colors.text.subtle],
  );

  // Empty state for users
  const UsersEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Ionicons
          name="people-outline"
          size={48}
          color={theme.colors.text.subtle}
          style={{ marginBottom: 12 }}
        />
        <Text size="lg" mode="subtle" weight="semibold">
          No users found
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{ marginTop: 4, textAlign: "center" }}
        >
          Try searching for a username
        </Text>
      </View>
    ),
    [theme.colors.text.subtle],
  );

  const hasSearchQuery = searchQuery.trim().length > 0;
  const showResults = hasSearchQuery && debouncedQuery;

  // Get the count to show in topics tab (either topic posts or search topics count)
  const topicsTabCount = selectedTopic
    ? topicPosts.length
    : (searchResults?.topics.length ?? 0);

  // Render topic posts header with back button
  const TopicPostsHeader = useCallback(() => {
    if (!selectedTopic) return null;
    const { icon, color } = getTopicIcon(selectedTopic.topic);

    return (
      <View style={styles.topicHeader}>
        <Pressable
          onPress={handleBackFromTopic}
          style={({ pressed }) => [
            styles.topicBackButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="arrow-back"
            size={20}
            color={theme.colors.text.default}
          />
        </Pressable>
        <View
          style={[styles.topicHeaderIcon, { backgroundColor: `${color}15` }]}
        >
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text size="lg" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
          #{selectedTopic.topic}
        </Text>
      </View>
    );
  }, [selectedTopic, theme.colors.text.default, handleBackFromTopic]);

  return (
    <Box flex background="base">
      {/* Header with Search Input */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        {/* Back Button */}
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.text.default}
          />
        </Pressable>

        {/* Search Input */}
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.colors.background.lighter,
              borderColor: isFocused
                ? theme.colors.primary[500]
                : theme.colors.border.subtle,
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color={theme.colors.text.subtle}
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setSelectedTopic(null);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSubmitEditing={handleSubmitEditing}
            placeholder="Search posts, topics, users..."
            placeholderTextColor={theme.colors.text.subtle}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.colors.text.default }]}
          />
          {isSearching && (
            <Animated.View entering={FadeIn.duration(100)}>
              <ActivityIndicator
                size="small"
                color={theme.colors.primary[500]}
                style={{ marginRight: 4 }}
              />
            </Animated.View>
          )}
          {hasSearchQuery && !isSearching && (
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(150)}
            >
              <Pressable
                onPress={handleClearInput}
                style={({ pressed }) => [
                  styles.clearInputButton,
                  pressed && { opacity: 0.5 },
                ]}
              >
                <View
                  style={[
                    styles.clearInputIcon,
                    { backgroundColor: theme.colors.text.subtle },
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={12}
                    color={theme.colors.background.default}
                  />
                </View>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Tabs - only show when searching */}
      {showResults && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[
            styles.tabsContainer,
            {
              backgroundColor: theme.colors.background.default,
              borderBottomColor: theme.colors.border.subtle,
            },
          ]}
        >
          {/* Posts Tab */}
          <Pressable
            onPress={() => handleTabPress("posts")}
            style={({ pressed }) => [
              styles.tab,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              size="md"
              weight={activeTab === "posts" ? "semibold" : "regular"}
              style={{
                color:
                  activeTab === "posts"
                    ? theme.colors.primary[500]
                    : theme.colors.text.subtle,
              }}
            >
              Posts
            </Text>
            {searchResults && searchResults.posts.length > 0 && (
              <View
                style={[
                  styles.tabBadge,
                  {
                    backgroundColor:
                      activeTab === "posts"
                        ? theme.colors.primary[500]
                        : theme.colors.background.subtle,
                  },
                ]}
              >
                <Text
                  size="xs"
                  weight="medium"
                  style={{
                    color:
                      activeTab === "posts"
                        ? theme.colors.background.default
                        : theme.colors.text.subtle,
                  }}
                >
                  {searchResults.posts.length}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Topics Tab */}
          <Pressable
            onPress={() => handleTabPress("topics")}
            style={({ pressed }) => [
              styles.tab,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              size="md"
              weight={activeTab === "topics" ? "semibold" : "regular"}
              style={{
                color:
                  activeTab === "topics"
                    ? theme.colors.primary[500]
                    : theme.colors.text.subtle,
              }}
            >
              Topics
            </Text>
            {topicsTabCount > 0 && (
              <View
                style={[
                  styles.tabBadge,
                  {
                    backgroundColor:
                      activeTab === "topics"
                        ? theme.colors.primary[500]
                        : theme.colors.background.subtle,
                  },
                ]}
              >
                <Text
                  size="xs"
                  weight="medium"
                  style={{
                    color:
                      activeTab === "topics"
                        ? theme.colors.background.default
                        : theme.colors.text.subtle,
                  }}
                >
                  {topicsTabCount}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Users Tab */}
          <Pressable
            onPress={() => handleTabPress("users")}
            style={({ pressed }) => [
              styles.tab,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              size="md"
              weight={activeTab === "users" ? "semibold" : "regular"}
              style={{
                color:
                  activeTab === "users"
                    ? theme.colors.primary[500]
                    : theme.colors.text.subtle,
              }}
            >
              Users
            </Text>
            {searchResults && searchResults.users.length > 0 && (
              <View
                style={[
                  styles.tabBadge,
                  {
                    backgroundColor:
                      activeTab === "users"
                        ? theme.colors.primary[500]
                        : theme.colors.background.subtle,
                  },
                ]}
              >
                <Text
                  size="xs"
                  weight="medium"
                  style={{
                    color:
                      activeTab === "users"
                        ? theme.colors.background.default
                        : theme.colors.text.subtle,
                  }}
                >
                  {searchResults.users.length}
                </Text>
              </View>
            )}
          </Pressable>
          <Animated.View
            style={[
              styles.tabIndicator,
              { width: singleTabWidth, backgroundColor: theme.colors.primary[500] },
              tabIndicatorStyle,
            ]}
          />
        </Animated.View>
      )}

      {/* Content */}
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
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 20 },
            ]}
            ListEmptyComponent={!isSearching ? PostsEmptyState : null}
          />
        ) : activeTab === "topics" ? (
          // Topics tab - show topic posts if selected, otherwise show topic list
          selectedTopic ? (
            <FlatList
              data={topicPosts}
              keyExtractor={(item) => `topic-post-${item.post_id}`}
              renderItem={renderPostResult}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + 20 },
              ]}
              ListHeaderComponent={TopicPostsHeader}
              ListEmptyComponent={
                isLoadingTopicPosts ? (
                  <View style={styles.loadingState}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary[500]}
                    />
                  </View>
                ) : (
                  <PostsEmptyState />
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
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + 20 },
              ]}
              ListEmptyComponent={!isSearching ? TopicsEmptyState : null}
            />
          )
        ) : (
          // Users tab
          <FlatList
            data={searchResults?.users ?? []}
            keyExtractor={(item) => `user-${item.address}`}
            renderItem={renderUserResult}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 20 },
            ]}
            ListEmptyComponent={!isSearching ? UsersEmptyState : null}
          />
        )}
        </Animated.View>
        </GestureDetector>
      ) : (
        // Show recent searches and trending topics when empty
        <FlatList
          data={[]}
          renderItem={null}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          ListHeaderComponent={
            <>
              {/* Recent Searches Section */}
              {recentSearches.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text
                      size="sm"
                      weight="semibold"
                      mode="subtle"
                      style={styles.sectionHeaderTitle}
                    >
                      RECENT
                    </Text>
                    <Pressable
                      onPress={handleClearAllRecentSearches}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={({ pressed }) => [pressed && { opacity: 0.5 }]}
                    >
                      <Text
                        size="sm"
                        style={{ color: theme.colors.primary[500] }}
                      >
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
              )}

              {/* Trending Topics Section */}
              <View style={styles.section}>
                <Text
                  size="sm"
                  weight="semibold"
                  mode="subtle"
                  style={styles.sectionTitle}
                >
                  TRENDING TOPICS
                </Text>
                {isLoadingTopics ? (
                  <View style={styles.loadingState}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary[500]}
                    />
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
