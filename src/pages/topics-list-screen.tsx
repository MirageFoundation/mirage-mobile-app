import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useTopics, useUserFollowed } from "@/src/api/read";
import { useToggleFollowTopic } from "@/src/api/write";
import type { TopicInfo } from "@/src/api/types";
import { Box, Text } from "@/src/components/ui/primitives";
import {
  ContentWarningBadge,
  type ContentWarningType,
} from "@/src/components/atoms";
import { useAuthGuard } from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
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
  const toast = useToast();

  const { data, isLoading, refetch } = useTopics(200);
  const { data: followedData } = useUserFollowed();
  const toggleFollowTopicMutation = useToggleFollowTopic();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState<Set<string>>(new Set());

  const followedTopics = useMemo(
    () => new Set(followedData?.followed_topics ?? []),
    [followedData],
  );

  const topics = useMemo(() => {
    if (!data?.topics) return [];
    return [...data.topics].sort(
      (a, b) => (b.post_count ?? 0) - (a.post_count ?? 0),
    );
  }, [data]);

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
      if (loadingTopics.has(topicName)) return;

      requireAuth(async () => {
        triggerHaptic("light");
        const action = isCurrentlyFollowing ? "Unfollowing" : "Following";
        const actionPast = isCurrentlyFollowing
          ? "Unfollowed"
          : "Now following";

        const toastId = toast.loading(
          `${action} #${topicName}`,
          "Computing proof of work...",
        );

        setLoadingTopics((prev) => new Set(prev).add(topicName));

        setTimeout(async () => {
          try {
            await toggleFollowTopicMutation.mutateAsync({
              topic: topicName,
              isCurrentlyFollowing,
            });

            toast.update(toastId, {
              type: "success",
              title: `${actionPast} #${topicName}`,
              description: undefined,
              duration: 3000,
            });
            setTimeout(() => toast.dismiss(toastId), 3000);
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const isAlreadyFollowed = errorMessage
              .toLowerCase()
              .includes("already follow");
            const isNotFollowing =
              errorMessage.toLowerCase().includes("not following") ||
              errorMessage.includes("not in followed");

            if (isAlreadyFollowed || isNotFollowing) {
              toast.update(toastId, {
                type: "success",
                title: isAlreadyFollowed
                  ? `Already following #${topicName}`
                  : `Already not following #${topicName}`,
                description: undefined,
                duration: 3000,
              });
              setTimeout(() => toast.dismiss(toastId), 3000);
            } else {
              toast.update(toastId, {
                type: "error",
                title: `Failed to ${action.toLowerCase()} #${topicName}`,
                description: "Please try again",
                duration: 4000,
              });
              setTimeout(() => toast.dismiss(toastId), 4000);
            }
          } finally {
            setLoadingTopics((prev) => {
              const newSet = new Set(prev);
              newSet.delete(topicName);
              return newSet;
            });
          }
        }, 0);
      });
    },
    [loadingTopics, requireAuth, toast, toggleFollowTopicMutation],
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
        isLoading={loadingTopics.has(item.topic)}
        onPress={() => handleTopicPress(item.topic)}
        onFollowToggle={() =>
          handleFollowToggle(item.topic, followedTopics.has(item.topic))
        }
      />
    ),
    [followedTopics, loadingTopics, handleTopicPress, handleFollowToggle],
  );

  const keyExtractor = useCallback((item: TopicInfo) => item.topic, []);

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) return <ListSkeleton />;
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
  }, [isLoading]);

  return (
    <Box flex background="base">
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
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
      </View>

      <FlatList
        data={topics}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 20,
          flexGrow: topics.length === 0 ? 1 : undefined,
        }}
        ListEmptyComponent={ListEmptyComponent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.text.subtle}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 56,
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
