import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, Layout } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import type { RecentSearch } from "@/src/stores";
import type { Post, TopicInfo, UserInfo } from "@/src/api/types";
import { getUsernameColor } from "@/src/utils/tiers";
import { TimeAgo } from "@/src/components/atoms/time-ago";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { Text } from "@/src/components/ui/primitives";

import { formatCount, formatPostCount, getTopicIcon } from "./search-utils";

export function RecentSearchItem({
  item,
  index,
  subtleTextColor,
  onPress,
  onRemove,
}: {
  item: RecentSearch;
  index: number;
  subtleTextColor: string;
  onPress: () => void;
  onRemove: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).duration(200)}
      layout={Layout.springify()}
    >
      <Pressable onPress={onPress} style={({ pressed }) => [styles.recentSearchItem, pressed && { opacity: 0.7 }]}> 
        <View style={styles.recentSearchLeft}>
          <Ionicons name="time-outline" size={18} color={subtleTextColor} />
          <Text size="md" style={{ flex: 1 }}>
            {item.query}
          </Text>
        </View>
        <Pressable onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={({ pressed }) => [styles.clearButton, pressed && { opacity: 0.5 }]}> 
          <Ionicons name="close" size={18} color={subtleTextColor} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export function TopicListItem({
  topic,
  index,
  isTrending = false,
  isLast,
  subtleTextColor,
  dividerColor,
  onPress,
}: {
  topic: TopicInfo;
  index: number;
  isTrending?: boolean;
  isLast?: boolean;
  subtleTextColor: string;
  dividerColor: string;
  onPress: () => void;
}) {
  const { icon, color } = getTopicIcon(topic.topic);

  if (isTrending) {
    return (
      <Animated.View entering={FadeInDown.delay(index * 50 + 100).duration(200)}>
        <Pressable onPress={onPress} style={({ pressed }) => [styles.trendingItem, pressed && { opacity: 0.7 }]}> 
          <View style={[styles.trendingIcon, { backgroundColor: `${color}15` }]}>
            <Ionicons name={icon} size={20} color={color} />
          </View>
          <View style={styles.trendingContent}>
            <Text size="md" weight="medium">#{topic.topic}</Text>
            <Text size="sm" mode="subtle">{formatPostCount(topic.post_count || topic.count)}</Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.topicResultItem, pressed && { opacity: 0.7 }]}> 
        <View style={[styles.topicResultIcon, { backgroundColor: `${color}15` }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={styles.topicResultContent}>
          <Text size="md" weight="medium">#{topic.topic}</Text>
          {(topic.post_count || topic.count) ? (
            <Text size="sm" mode="subtle">{formatPostCount(topic.post_count || topic.count)}</Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={subtleTextColor} />
      </Pressable>
      {!isLast ? <View style={[styles.divider, { backgroundColor: dividerColor }]} /> : null}
    </Animated.View>
  );
}

export function PostResultItem({
  item,
  index,
  total,
  dividerColor,
  onPress,
}: {
  item: Post;
  index: number;
  total: number;
  dividerColor: string;
  onPress: () => void;
}) {
  const isLast = index === total - 1;
  const hasThumbnail = !!(item.thumbnail && item.thumbnail.length > 0);
  const timestampMs = item.timestamp * 1000;

  return (
    <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.postResultItem, pressed && { opacity: 0.7 }]}> 
        <View style={styles.postResultContent}>
          <View style={styles.postResultHeader}>
            <Text
              size="sm"
              weight="medium"
              numberOfLines={1}
              style={
                (item.level ?? item.author_level ?? item.user_level)
                  ? { color: getUsernameColor(item.level ?? item.author_level ?? item.user_level ?? 0) }
                  : (item.new_user ?? item.author_is_new)
                    ? { color: "rgb(94,194,106)" }
                    : undefined
              }
            >
              @{item.username || "anonymous"}
            </Text>
            <Text size="sm" mode="subtle">•</Text>
            <TimeAgo timestamp={timestampMs} size="sm" mode="subtle" weight="regular" showSuffix={false} />
          </View>
          {item.title ? (
            <Text size="md" weight="regular" numberOfLines={2} style={styles.postTitle}>
              {item.title}
            </Text>
          ) : item.content ? (
            <View>
              <MarkdownContent content={item.content} />
            </View>
          ) : null}
          <View style={styles.postResultMeta}>
            <Text size="sm" mode="subtle">{formatCount(Math.round(item.points), "point", "points")}</Text>
            <Text size="sm" mode="subtle">•</Text>
            <Text size="sm" mode="subtle">{formatCount(item.comments, "comment", "comments")}</Text>
          </View>
        </View>
        {hasThumbnail ? (
          <Image
            source={{ uri: item.thumbnail }}
            style={styles.postThumbnail}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}
      </Pressable>
      {!isLast ? <View style={[styles.divider, { backgroundColor: dividerColor }]} /> : null}
    </Animated.View>
  );
}

export function UserResultItem({
  item,
  index,
  total,
  subtleTextColor,
  dividerColor,
  onPress,
}: {
  item: UserInfo;
  index: number;
  total: number;
  subtleTextColor: string;
  dividerColor: string;
  onPress: () => void;
}) {
  const isLast = index === total - 1;

  return (
    <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.userResultItem, pressed && { opacity: 0.7 }]}> 
        <View style={styles.userResultContent}>
          <View style={styles.userResultNameRow}>
            <Text
              size="md"
              weight="medium"
              style={
                item.level
                  ? { color: getUsernameColor(item.level) }
                  : item.user_is_new
                    ? { color: "rgb(94,194,106)" }
                    : undefined
              }
            >
              @{item.username}
            </Text>
            {item.level === 10 ? (
              <View style={[styles.agentTag, { backgroundColor: "#EF4444" }]}>
                <Text size="xs" weight="semibold" style={{ color: "#fff" }}>Agent</Text>
              </View>
            ) : null}
          </View>
          <Text size="sm" mode="subtle" numberOfLines={1}>
            {item.address.slice(0, 8)}...{item.address.slice(-6)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={subtleTextColor} />
      </Pressable>
      {!isLast ? <View style={[styles.divider, { backgroundColor: dividerColor }]} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  divider: {
    height: 0.5,
    marginLeft: 56,
  },
  recentSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm + 2,
  },
  recentSearchLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: theme.spacing.sm,
  },
  clearButton: {
    padding: 4,
  },
  trendingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  trendingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  trendingContent: {
    flex: 1,
  },
  topicResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  topicResultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  topicResultContent: {
    flex: 1,
  },
  postResultItem: {
    flexDirection: "row",
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  postResultContent: {
    flex: 1,
    minHeight: 88,
  },
  postResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  postTitle: {
    lineHeight: 22,
    marginBottom: 8,
  },
  postResultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: "auto",
  },
  postThumbnail: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.lg,
  },
  userResultItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
  },
  userResultContent: {
    flex: 1,
  },
  userResultNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: 4,
  },
  agentTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
}));
