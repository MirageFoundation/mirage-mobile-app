import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  Layout,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useDebouncedSearch, usePosts, useTopics } from "@/src/api/read";
import type { Post, TopicInfo, UserInfo } from "@/src/api/types";
import { TimeAgo } from "@/src/components/atoms/time-ago";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useSearchStore, type RecentSearch } from "@/src/stores";

type SearchTab = "posts" | "topics" | "users";

// Topic icon mapping based on topic name patterns
const getTopicIcon = (
  topic: string,
): { icon: keyof typeof Ionicons.glyphMap; color: string } => {
  const lowerTopic = topic.toLowerCase();

  if (lowerTopic.includes("bitcoin") || lowerTopic.includes("btc")) {
    return { icon: "logo-bitcoin", color: "#F7931A" };
  }
  if (
    lowerTopic.includes("crypto") ||
    lowerTopic.includes("eth") ||
    lowerTopic.includes("defi")
  ) {
    return { icon: "wallet", color: "#627EEA" };
  }
  if (
    lowerTopic.includes("ai") ||
    lowerTopic.includes("artificial") ||
    lowerTopic.includes("machine")
  ) {
    return { icon: "sparkles", color: "#8B5CF6" };
  }
  if (
    lowerTopic.includes("game") ||
    lowerTopic.includes("gaming") ||
    lowerTopic.includes("esport")
  ) {
    return { icon: "game-controller", color: "#10B981" };
  }
  if (
    lowerTopic.includes("space") ||
    lowerTopic.includes("rocket") ||
    lowerTopic.includes("nasa")
  ) {
    return { icon: "rocket", color: "#3B82F6" };
  }
  if (
    lowerTopic.includes("sport") ||
    lowerTopic.includes("football") ||
    lowerTopic.includes("soccer")
  ) {
    return { icon: "football", color: "#EF4444" };
  }
  if (
    lowerTopic.includes("music") ||
    lowerTopic.includes("song") ||
    lowerTopic.includes("album")
  ) {
    return { icon: "musical-notes", color: "#EC4899" };
  }
  if (
    lowerTopic.includes("movie") ||
    lowerTopic.includes("film") ||
    lowerTopic.includes("cinema")
  ) {
    return { icon: "film", color: "#F59E0B" };
  }
  if (
    lowerTopic.includes("tech") ||
    lowerTopic.includes("code") ||
    lowerTopic.includes("programming")
  ) {
    return { icon: "code-slash", color: "#06B6D4" };
  }
  if (
    lowerTopic.includes("news") ||
    lowerTopic.includes("politics") ||
    lowerTopic.includes("world")
  ) {
    return { icon: "newspaper", color: "#64748B" };
  }
  if (
    lowerTopic.includes("science") ||
    lowerTopic.includes("research") ||
    lowerTopic.includes("study")
  ) {
    return { icon: "flask", color: "#14B8A6" };
  }
  if (
    lowerTopic.includes("art") ||
    lowerTopic.includes("design") ||
    lowerTopic.includes("creative")
  ) {
    return { icon: "color-palette", color: "#F472B6" };
  }
  if (
    lowerTopic.includes("food") ||
    lowerTopic.includes("cook") ||
    lowerTopic.includes("recipe")
  ) {
    return { icon: "restaurant", color: "#FB923C" };
  }
  if (
    lowerTopic.includes("health") ||
    lowerTopic.includes("fitness") ||
    lowerTopic.includes("workout")
  ) {
    return { icon: "fitness", color: "#22C55E" };
  }
  if (
    lowerTopic.includes("travel") ||
    lowerTopic.includes("trip") ||
    lowerTopic.includes("vacation")
  ) {
    return { icon: "airplane", color: "#0EA5E9" };
  }

  // Default icon
  return { icon: "chatbubble", color: "#6366F1" };
};

// Format post count for display
const formatPostCount = (count?: number): string => {
  if (!count) return "";
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M posts`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K posts`;
  }
  return `${count} posts`;
};

// Format count with label
const formatCount = (
  count: number,
  singular: string,
  plural: string,
): string => {
  if (count === 1) {
    return `${count} ${singular}`;
  }
  return `${count} ${plural}`;
};

export function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const inputRef = useRef<TextInput>(null);

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>("posts");

  // State for viewing posts within a specific topic
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
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

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
      setSearchQuery(topic.topic);
      addRecentSearch(topic.topic);
      Keyboard.dismiss();
    },
    [addRecentSearch],
  );

  const handleTopicResultPress = useCallback(
    (topic: TopicInfo) => {
      triggerHaptic("light");
      addRecentSearch(topic.topic);
      Keyboard.dismiss();
      // Set selected topic to show posts within topics tab
      setSelectedTopic(topic);
    },
    [addRecentSearch],
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
      router.push(`/profile/${user.address}`);
    },
    [router, addRecentSearch],
  );

  const handleSubmitEditing = useCallback(() => {
    handleSearch(searchQuery);
  }, [handleSearch, searchQuery]);

  const handleTabPress = useCallback((tab: SearchTab) => {
    triggerHaptic("light");
    setActiveTab(tab);
    // Reset selected topic when switching tabs
    if (tab !== "topics") {
      setSelectedTopic(null);
    }
  }, []);

  // Render recent search item
  const renderRecentSearchItem = useCallback(
    ({ item, index }: { item: RecentSearch; index: number }) => (
      <Animated.View
        entering={FadeInDown.delay(index * 50).duration(200)}
        layout={Layout.springify()}
      >
        <Pressable
          onPress={() => handleRecentSearchPress(item)}
          style={({ pressed }) => [
            styles.recentSearchItem,
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={styles.recentSearchLeft}>
            <Ionicons
              name="time-outline"
              size={18}
              color={theme.colors.text.subtle}
            />
            <Text size="md" style={{ flex: 1 }}>
              {item.query}
            </Text>
          </View>
          <Pressable
            onPress={() => handleRemoveRecentSearch(item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && { opacity: 0.5 },
            ]}
          >
            <Ionicons name="close" size={18} color={theme.colors.text.subtle} />
          </Pressable>
        </Pressable>
      </Animated.View>
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
      const isLast = index === totalPosts - 1;
      const hasThumbnail = item.thumbnail && item.thumbnail.length > 0;
      // Convert timestamp - API returns seconds, we need milliseconds
      const timestampMs = item.timestamp * 1000;

      return (
        <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
          <Pressable
            onPress={() => handlePostResultPress(item)}
            style={({ pressed }) => [
              styles.postResultItem,
              pressed && { opacity: 0.7 },
            ]}
          >
            {/* Left: Content */}
            <View style={styles.postResultContent}>
              {/* Avatar + Username + dot + time ago - all in one row */}
              <View style={styles.postResultHeader}>
                <Text size="sm" mode="subtle" weight="medium" numberOfLines={1}>
                  @{item.username || "anonymous"}
                </Text>
                <Text size="sm" mode="subtle">
                  •
                </Text>
                <TimeAgo
                  timestamp={timestampMs}
                  size="sm"
                  mode="subtle"
                  weight="regular"
                  showSuffix={false}
                />
              </View>

              {/* Title (2 lines max) */}
              {item.title ? (
                <Text
                  size="md"
                  weight="regular"
                  numberOfLines={2}
                  style={styles.postTitle}
                >
                  {item.title}
                </Text>
              ) : item.content ? (
                <Text size="md" numberOfLines={2} style={styles.postTitle}>
                  {item.content}
                </Text>
              ) : null}

              {/* Upvotes + dot + comments */}
              <View style={styles.postResultMeta}>
                <Text size="sm" mode="subtle">
                  {formatCount(Math.round(item.points), "upvote", "upvotes")}
                </Text>
                <Text size="sm" mode="subtle">
                  •
                </Text>
                <Text size="sm" mode="subtle">
                  {formatCount(item.comments, "comment", "comments")}
                </Text>
              </View>
            </View>

            {/* Right: Thumbnail if available */}
            {hasThumbnail && (
              <Image
                source={{ uri: item.thumbnail }}
                style={styles.postThumbnail}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )}
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
      theme.colors.border.subtle,
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
            <View style={styles.userResultContent}>
              <Text size="md" weight="medium">
                @{item.username}
              </Text>
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
        <Text size="md" mode="subtle" weight="medium">
          No posts found
        </Text>
        <Text
          size="sm"
          mode="subtle"
          style={{ marginTop: 4, textAlign: "center" }}
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
        <Text size="md" mode="subtle" weight="medium">
          No topics found
        </Text>
        <Text
          size="sm"
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
        <Text size="md" mode="subtle" weight="medium">
          No users found
        </Text>
        <Text
          size="sm"
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
              activeTab === "posts" && styles.tabActive,
              activeTab === "posts" && {
                borderBottomColor: theme.colors.primary[500],
              },
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
              activeTab === "topics" && styles.tabActive,
              activeTab === "topics" && {
                borderBottomColor: theme.colors.primary[500],
              },
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
              activeTab === "users" && styles.tabActive,
              activeTab === "users" && {
                borderBottomColor: theme.colors.primary[500],
              },
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
        </Animated.View>
      )}

      {/* Content */}
      {showResults ? (
        // Show search results based on active tab
        activeTab === "posts" ? (
          <FlatList
            data={searchResults?.posts ?? []}
            keyExtractor={(item) => `post-${item.post_id}`}
            renderItem={renderPostResult}
            keyboardShouldPersistTaps="handled"
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
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 20 },
            ]}
            ListEmptyComponent={!isSearching ? UsersEmptyState : null}
          />
        )
      ) : (
        // Show recent searches and trending topics when empty
        <FlatList
          data={[]}
          renderItem={null}
          keyboardShouldPersistTaps="handled"
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

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 0.5,
    gap: theme.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: theme.radius.xxl + 10,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  searchIcon: {
    marginRight: theme.spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: theme.typography.size.lg,
    fontFamily: theme.typography.family.mono,
    height: "100%",
    backgroundColor: theme.colors.background.lighter,
    borderRadius: theme.radius.xxl + 10,
  },
  clearInputButton: {
    padding: 4,
  },
  clearInputIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  // Tabs
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: theme.spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomWidth: 2,
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    minWidth: 20,
    alignItems: "center",
  },
  // List content
  listContent: {
    paddingTop: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  sectionHeaderTitle: {
    letterSpacing: 0.5,
  },
  sectionTitle: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  // Divider
  divider: {
    height: 0.5,
    marginHorizontal: theme.spacing.md,
  },
  // Recent search item
  recentSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  recentSearchLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
  },
  clearButton: {
    padding: 4,
  },
  // Trending topic item
  trendingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  trendingIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  trendingContent: {
    flex: 1,
    gap: 2,
  },
  // Topic result item
  topicResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  topicResultIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  topicResultContent: {
    flex: 1,
    gap: 2,
  },
  // Topic header when viewing posts
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  topicBackButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  topicHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  // User result item
  userResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  userResultContent: {
    flex: 1,
    gap: 2,
  },
  // Post result item - new design
  postResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  postResultContent: {
    flex: 1,
    gap: 4,
  },
  postResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  postTitle: {
    lineHeight: 20,
  },
  postResultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  postThumbnail: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background.subtle,
  },
  // Empty states
  emptyState: {
    paddingVertical: theme.spacing.xl * 2,
    alignItems: "center",
  },
  emptyTrendingState: {
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
  },
  loadingState: {
    paddingVertical: theme.spacing.xl,
    alignItems: "center",
  },
}));
