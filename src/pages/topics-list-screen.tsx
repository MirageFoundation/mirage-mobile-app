import { Feather, Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useTopics, useDebouncedSearchTopics, useUserFollowed } from "@/src/api/read";
import type { TopicInfo } from "@/src/api/types";
import { Box, Text } from "@/src/components/ui/primitives";
import {
  ContentWarningBadge,
  type ContentWarningType,
} from "@/src/components/atoms";
import { useAuthGuard, useFollowHandler } from "@/src/hooks";
import { triggerHaptic } from "@/src/components/utils/haptics";

const emptyInfoImage = require("@/assets/images/empty-info.png");

function SkeletonBox({
  width,
  height,
  borderRadius,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  const { theme } = useUnistyles();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: borderRadius ?? 6,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

function TopicRowSkeleton() {
  return (
    <View style={styles.topicRow}>
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width={160} height={16} />
        <SkeletonBox width={100} height={12} />
      </View>
      <SkeletonBox width={80} height={32} borderRadius={16} />
    </View>
  );
}

function ListSkeleton() {
  return (
    <View>
      {Array.from({ length: 10 }).map((_, i) => (
        <TopicRowSkeleton key={i} />
      ))}
    </View>
  );
}

function TopicRow({
  topic,
  isFollowing,
  isLoading,
  onPress,
  onFollowToggle,
}: {
  topic: TopicInfo;
  isFollowing: boolean;
  isLoading: boolean;
  onPress: () => void;
  onFollowToggle: () => void;
}) {
  const { theme } = useUnistyles();

  const contentWarnings = useMemo(() => {
    const warnings: ContentWarningType[] = [];
    const tagMap: Record<string, ContentWarningType> = {
      sensitive: "sensitive",
      adult: "adult",
      nsfw: "nsfw",
      porn: "adult",
      violence: "violence",
      gore: "gore",
      death: "death",
    };

    if (topic.flags && typeof topic.flags === "object") {
      for (const [key, value] of Object.entries(
        topic.flags as Record<string, boolean>,
      )) {
        if (value === true) {
          const mapped = tagMap[key.toLowerCase()];
          if (mapped && !warnings.includes(mapped)) {
            warnings.push(mapped);
          }
        }
      }
    }

    if (topic.dominant_tag && typeof topic.dominant_tag === "string") {
      const mapped = tagMap[topic.dominant_tag.toLowerCase()];
      if (mapped && !warnings.includes(mapped)) {
        warnings.push(mapped);
      }
    }

    return warnings;
  }, [topic.flags, topic.dominant_tag]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.topicRow,
        { borderBottomColor: theme.colors.border.subtle },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.topicInfo}>
        <View style={styles.topicNameRow}>
          <Text
            size="lg"
            weight="semibold"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            #{topic.topic}
          </Text>
          {contentWarnings.length > 0 && (
            <ContentWarningBadge types={contentWarnings} size="sm" compact />
          )}
        </View>
        <View style={styles.statsRow}>
          <Text size="md" mode="subtle">
            {topic.post_count ?? 0} posts
          </Text>
          <Text size="md" mode="subtle">
            ·
          </Text>
          <Text size="md" mode="subtle">
            {topic.comment_count ?? topic.count ?? 0} comments
          </Text>
        </View>
      </View>

      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onFollowToggle();
        }}
        disabled={isLoading}
        style={({ pressed }) => [
          styles.followButton,
          isFollowing
            ? { borderColor: theme.colors.border.default }
            : { backgroundColor: theme.colors.text.default },
          pressed && { opacity: 0.7 },
          isLoading && { opacity: 0.5 },
        ]}
      >
        {isLoading ? (
          <ActivityIndicator
            size="small"
            color={
              isFollowing
                ? theme.colors.text.default
                : theme.colors.background.default
            }
          />
        ) : (
          <Text
            size="sm"
            weight="bold"
            style={{
              color: isFollowing
                ? theme.colors.text.default
                : theme.colors.background.default,
            }}
          >
            {isFollowing ? "Following" : "Follow"}
          </Text>
        )}
      </Pressable>
    </Pressable>
  );
}

export function TopicsListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const { requireAuth } = useAuthGuard();

  const { data, isLoading, refetch } = useTopics(200);
  const { data: followedData } = useUserFollowed();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<TextInput>(null);
  const { handleFollowTopic } = useFollowHandler({});

  const HEADER_HEIGHT = 56 + 58 + insets.top;
  const scrollY = useSharedValue(0);
  const lastScrollY = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;
      if (currentY <= 0) {
        headerTranslateY.value = 0;
      } else if (diff > 0) {
        headerTranslateY.value = Math.max(-HEADER_HEIGHT, headerTranslateY.value - diff);
      } else if (diff < 0) {
        headerTranslateY.value = Math.min(0, headerTranslateY.value - diff);
      }
      lastScrollY.value = currentY;
      scrollY.value = currentY;
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const {
    data: searchData,
    isSearching,
    isDebouncing,
  } = useDebouncedSearchTopics(
    searchText.length >= 2 ? searchText : null,
    750,
    50,
  );

  const followedTopics = useMemo(
    () => new Set(followedData?.followed_topics ?? []),
    [followedData],
  );

  const allTopics = useMemo(() => {
    if (!data?.topics) return [];
    return [...data.topics].sort(
      (a, b) => (b.post_count ?? 0) - (a.post_count ?? 0),
    );
  }, [data]);

  const topics = useMemo(() => {
    if (searchText.length >= 2 && searchData?.topics) {
      return searchData.topics;
    }
    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      return allTopics.filter((t) => t.topic.toLowerCase().includes(query));
    }
    return allTopics;
  }, [searchText, searchData, allTopics]);

  const isSearchLoading = isDebouncing || isSearching;

  const handleClearSearch = useCallback(() => {
    setSearchText("");
    searchInputRef.current?.focus();
  }, []);

  const handleSearchCancel = useCallback(() => {
    Keyboard.dismiss();
    setSearchText("");
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleTopicPress = useCallback(
    (topicName: string) => {
      router.push(`/topic/${encodeURIComponent(topicName)}`);
    },
    [router],
  );

  const handleFollowToggle = useCallback(
    (topicName: string, isCurrentlyFollowing: boolean) => {
      triggerHaptic("light");
      handleFollowTopic(topicName, isCurrentlyFollowing);
    },
    [handleFollowTopic],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: TopicInfo }) => (
      <TopicRow
        topic={item}
        isFollowing={followedTopics.has(item.topic)}
        isLoading={false}
        onPress={() => handleTopicPress(item.topic)}
        onFollowToggle={() =>
          handleFollowToggle(item.topic, followedTopics.has(item.topic))
        }
      />
    ),
    [followedTopics, handleTopicPress, handleFollowToggle],
  );

  const keyExtractor = useCallback((item: TopicInfo) => item.topic, []);

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) return <ListSkeleton />;
    if (searchText.trim()) {
      if (isSearchLoading) return null;
      return (
        <Box center p="lg">
          <Text mode="subtle">
            No topics found matching your search
          </Text>
        </Box>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Image
          source={emptyInfoImage}
          style={styles.emptyImage}
          contentFit="contain"
        />
        <Text size="lg" weight="bold" style={{ textAlign: "center" }}>
          No topics yet
        </Text>
        <Text
          size="sm"
          mode="subtle"
          style={{ marginTop: 8, textAlign: "center", maxWidth: 280 }}
        >
          Topics will appear here once they are created.
        </Text>
      </View>
    );
  }, [isLoading, searchText, isSearchLoading]);

  return (
    <Box flex background="base">
      <Animated.View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
          headerAnimatedStyle,
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} hitSlop={8}>
            <Ionicons
              name="arrow-back"
              size={24}
              color={theme.colors.text.default}
            />
          </Pressable>
          <Text size="xl" weight="bold" style={{ marginLeft: 16 }}>
            Topics
          </Text>
        </View>
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchInputWrapper,
              { backgroundColor: theme.colors.background.light },
            ]}
          >
            <Feather
              name="search"
              size={20}
              color={theme.colors.text.subtle}
              style={{ marginRight: 6 }}
            />
            <TextInput
              ref={searchInputRef}
              style={[
                styles.searchInput,
                {
                  color: theme.colors.text.default,
                  fontWeight: "600",
                  fontSize: theme.typography.size.lg,
                },
              ]}
              placeholder="Search for a topic"
              placeholderTextColor={theme.colors.text.subtle}
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <Animated.View
                entering={FadeIn.duration(150)}
                exiting={FadeOut.duration(150)}
              >
                {isSearchLoading && searchText.length >= 2 ? (
                  <View style={styles.clearButton}>
                    <ActivityIndicator size="small" color={theme.colors.text.subtle} />
                  </View>
                ) : (
                  <Pressable onPress={handleClearSearch} style={styles.clearButton}>
                    <Feather
                      name="x-circle"
                      size={14}
                      color={theme.colors.text.subtle}
                    />
                  </Pressable>
                )}
              </Animated.View>
            )}
          </View>
          {searchText.length > 0 && (
            <Pressable onPress={handleSearchCancel} hitSlop={8} style={styles.cancelButtonContainer}>
              <Text size="md" style={{ color: theme.colors.brand[500] }}>
                Cancel
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      <Animated.FlatList
        data={topics}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{
          paddingTop: HEADER_HEIGHT,
          paddingBottom: insets.bottom + 20,
          flexGrow: topics.length === 0 && !searchText.trim() ? 1 : undefined,
        }}
        ListEmptyComponent={ListEmptyComponent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.text.subtle}
            progressViewOffset={HEADER_HEIGHT}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 56,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cancelButtonContainer: {
    marginLeft: 12,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: "100%",
    fontWeight: "400",
  },
  clearButton: {
    padding: 6,
  },

  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  topicInfo: {
    flex: 1,
    marginRight: 12,
    gap: 4,
  },
  topicNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  followButton: {
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "transparent",
    minWidth: 76,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyImage: {
    width: 180,
    height: 180,
    marginBottom: 16,
  },
}));
