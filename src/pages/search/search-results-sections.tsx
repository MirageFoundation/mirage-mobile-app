import { Ionicons } from "@expo/vector-icons";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import type { Post, TopicInfo, UserInfo } from "@/src/api/types";
import { Avatar } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { getUsernameColor } from "@/src/utils/tiers";
import { SearchPostResult } from "./search-post-result";
import { SearchRecentItem } from "./search-recent-item";
import type { SearchController } from "./use-search-controller";
import { styles } from "./search-styles";
import { formatPostCount, getTopicIcon } from "./search-utils";

type SearchResultsSectionsProps = {
  controller: SearchController;
  bottomInset: number;
};

type EmptyStateProps = {
  type: "posts" | "topics" | "users";
  iconColor: string;
};

const emptyStateCopy = {
  posts: {
    icon: "document-text-outline" as const,
    title: "No posts found",
    body: "Try searching with different keywords",
  },
  topics: {
    icon: "pricetag-outline" as const,
    title: "No topics found",
    body: "Try searching for a different topic name",
  },
  users: {
    icon: "people-outline" as const,
    title: "No users found",
    body: "Try searching for a username",
  },
};

function SearchEmptyState({ type, iconColor }: EmptyStateProps) {
  const copy = emptyStateCopy[type];

  return (
    <View style={styles.emptyState} accessibilityRole="summary">
      <Ionicons
        name={copy.icon}
        size={48}
        color={iconColor}
        style={{ marginBottom: 12 }}
      />
      <Text size="lg" mode="subtle" weight="semibold">
        {copy.title}
      </Text>
      <Text
        size="md"
        mode="subtle"
        style={{ marginTop: type === "posts" ? 2 : 4, textAlign: "center" }}
      >
        {copy.body}
      </Text>
    </View>
  );
}

export function SearchResultsSections({
  controller,
  bottomInset,
}: SearchResultsSectionsProps) {
  const { theme } = useUnistyles();
  const contentContainerStyle = [
    styles.listContent,
    { paddingBottom: bottomInset + 20 },
  ];

  const renderPost = useCallback(
    ({ item, index }: { item: Post; index: number }) => {
      const totalPosts = controller.selectedTopic
        ? controller.topicPosts.length
        : (controller.searchResults?.posts.length ?? 0);

      return (
        <SearchPostResult
          item={item}
          index={index}
          totalPosts={totalPosts}
          dividerColor={theme.colors.border.subtle}
          textSubtleColor={theme.colors.text.subtle}
          onPress={controller.handlePostPress}
        />
      );
    },
    [
      controller.handlePostPress,
      controller.searchResults?.posts.length,
      controller.selectedTopic,
      controller.topicPosts.length,
      theme.colors.border.subtle,
      theme.colors.text.subtle,
    ],
  );

  const renderTopic = useCallback(
    ({ item, index }: { item: TopicInfo; index: number }) => {
      const { icon, color } = getTopicIcon(item.topic);
      const isLast =
        index === (controller.searchResults?.topics.length ?? 0) - 1;

      return (
        <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open topic ${item.topic}`}
            onPress={() => controller.handleTopicPress(item)}
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
              {!!(item.post_count || item.count) && (
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
      controller,
      theme.colors.border.subtle,
      theme.colors.text.subtle,
    ],
  );

  const renderUser = useCallback(
    ({ item, index }: { item: UserInfo; index: number }) => {
      const isLast =
        index === (controller.searchResults?.users.length ?? 0) - 1;
      const usernameStyle = item.user_is_new
        ? { color: "rgb(94,194,106)" }
        : item.level
          ? { color: getUsernameColor(item.level) }
          : undefined;

      return (
        <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open user ${item.username}`}
            onPress={() => controller.handleUserPress(item)}
            style={({ pressed }) => [
              styles.userResultItem,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Avatar size="sm" seed={item.address} rounded="sm" />
            <View style={styles.userResultContent}>
              <View style={styles.userResultNameRow}>
                <Text size="md" weight="medium" style={usernameStyle}>
                  @{item.username}
                </Text>
                {item.level === 10 && (
                  <View style={[styles.agentTag, { backgroundColor: "#EF4444" }]}>
                    <Text
                      size="xs"
                      weight="semibold"
                      style={{ color: "#fff" }}
                    >
                      Agent
                    </Text>
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
      controller,
      theme.colors.border.subtle,
      theme.colors.text.subtle,
    ],
  );

  const topicPostsHeader = controller.selectedTopic ? (
    <TopicPostsHeader controller={controller} />
  ) : null;

  if (controller.showResults) {
    return (
      <GestureDetector gesture={controller.swipeGesture}>
        <Animated.View
          style={[{ flex: 1 }, controller.contentAnimatedStyle]}
        >
          {controller.activeTab === "posts" ? (
            <FlatList
              data={controller.searchResults?.posts ?? []}
              keyExtractor={(item) => `post-${item.post_id}`}
              renderItem={renderPost}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={contentContainerStyle}
              ListEmptyComponent={
                !controller.isSearching ? (
                  <SearchEmptyState
                    type="posts"
                    iconColor={theme.colors.text.subtle}
                  />
                ) : null
              }
            />
          ) : controller.activeTab === "topics" ? (
            controller.selectedTopic ? (
              <FlatList
                data={controller.topicPosts}
                keyExtractor={(item) => `topic-post-${item.post_id}`}
                renderItem={renderPost}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={contentContainerStyle}
                ListHeaderComponent={topicPostsHeader}
                ListEmptyComponent={
                  controller.isLoadingTopicPosts ? (
                    <View style={styles.loadingState}>
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.primary[500]}
                      />
                    </View>
                  ) : (
                    <SearchEmptyState
                      type="posts"
                      iconColor={theme.colors.text.subtle}
                    />
                  )
                }
              />
            ) : (
              <FlatList
                data={controller.searchResults?.topics ?? []}
                keyExtractor={(item) => `topic-${item.topic}`}
                renderItem={renderTopic}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={contentContainerStyle}
                ListEmptyComponent={
                  !controller.isSearching ? (
                    <SearchEmptyState
                      type="topics"
                      iconColor={theme.colors.text.subtle}
                    />
                  ) : null
                }
              />
            )
          ) : (
            <FlatList
              data={controller.searchResults?.users ?? []}
              keyExtractor={(item) => `user-${item.address}`}
              renderItem={renderUser}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={contentContainerStyle}
              ListEmptyComponent={
                !controller.isSearching ? (
                  <SearchEmptyState
                    type="users"
                    iconColor={theme.colors.text.subtle}
                  />
                ) : null
              }
            />
          )}
        </Animated.View>
      </GestureDetector>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
    >
      {controller.discoverySections.map((section) =>
        section.key === "recent" ? (
          <View key={section.key} style={styles.section}>
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
                accessibilityRole="button"
                accessibilityLabel="Clear all recent searches"
                onPress={controller.handleClearAllRecentSearches}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => [pressed && { opacity: 0.5 }]}
              >
                <Text size="sm" style={{ color: theme.colors.primary[500] }}>
                  Clear all
                </Text>
              </Pressable>
            </View>
            {section.items.map((item, index) => (
              <SearchRecentItem
                key={item.id}
                item={item}
                index={index}
                textSubtleColor={theme.colors.text.subtle}
                onPress={controller.handleRecentSearchPress}
                onRemove={controller.handleRemoveRecentSearch}
              />
            ))}
          </View>
        ) : (
          <View key={section.key} style={styles.section}>
            <Text
              size="sm"
              weight="semibold"
              mode="subtle"
              style={styles.sectionTitle}
            >
              TRENDING TOPICS
            </Text>
            {section.isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary[500]}
                />
              </View>
            ) : section.items.length > 0 ? (
              section.items.map((item, index) => (
                <TrendingTopicItem
                  key={`trending-${item.topic}`}
                  item={item}
                  index={index}
                  onPress={controller.handleTopicPress}
                />
              ))
            ) : (
              <View style={styles.emptyTrendingState}>
                <Text size="sm" mode="subtle">
                  No trending topics available
                </Text>
              </View>
            )}
          </View>
        ),
      )}
    </ScrollView>
  );
}

function TrendingTopicItem({
  item,
  index,
  onPress,
}: {
  item: TopicInfo;
  index: number;
  onPress: (topic: TopicInfo) => void;
}) {
  const { icon, color } = getTopicIcon(item.topic);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50 + 100).duration(200)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open trending topic ${item.topic}`}
        onPress={() => onPress(item)}
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
}

function TopicPostsHeader({ controller }: { controller: SearchController }) {
  const { theme } = useUnistyles();
  const topic = controller.selectedTopic;
  if (!topic) return null;
  const { icon, color } = getTopicIcon(topic.topic);

  return (
    <View style={styles.topicHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to topic results"
        onPress={controller.handleBackFromTopic}
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
        #{topic.topic}
      </Text>
    </View>
  );
}
