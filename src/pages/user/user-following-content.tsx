import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, FlatList, Pressable, View } from "react-native";
import PagerView from "react-native-pager-view";
import Animated, {
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  useAddressFromUsername,
  useInfiniteCommunities,
  usePosts,
  useUserFollowed,
  useUserFollowedByAddress,
  useUsernameFromAddress,
} from "@/src/api/read";
import type { Post as ApiPostType } from "@/src/api/types";
import { communityLabel } from "@/src/domain/communities";
import { Avatar } from "@/src/components/atoms";
import { TimeAgo } from "@/src/components/atoms/time-ago";
import { getTabLabelColors } from "@/src/components/molecules/tab-label-colors";
import { Box, Icon, Text } from "@/src/components/ui/primitives";
import { useAuthStore } from "@/src/stores";

const emptyInfoImage = require("@/assets/images/empty-info.png");

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type FollowingTab = "users" | "communities";

const TABS: { key: FollowingTab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "communities", label: "Communities" },
];

const TAB_INDEX_MAP: Record<FollowingTab, number> = {
  users: 0,
  communities: 1,
};

const INDEX_TAB_MAP: FollowingTab[] = ["users", "communities"];

const formatCount = (
  count: number,
  singular: string,
  plural: string,
): string => {
  if (count === 1) return `${count} ${singular}`;
  return `${count} ${plural}`;
};

function AnimatedTabLabel({
  label,
  index,
  animatedIndex,
  activeColor,
  inactiveColor,
}: {
  label: string;
  index: number;
  animatedIndex: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
}) {
  const animStyle = useAnimatedStyle(() => {
    const distance = Math.abs(animatedIndex.value - index);
    const color = interpolateColor(
      distance,
      [0, 0.5],
      [activeColor, inactiveColor],
    );
    return {
      color,
      fontWeight: distance < 0.5 ? "700" : "500",
    } as any;
  });

  return (
    <Animated.Text style={[{ fontSize: 14 }, animStyle]}>
      {label}
    </Animated.Text>
  );
}

// --- Skeleton primitives ---

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

function UserRowSkeleton() {
  return (
    <View style={styles.row}>
      <SkeletonBox width={40} height={40} borderRadius={4} />
      <SkeletonBox width={140} height={16} style={{ marginLeft: 12 }} />
    </View>
  );
}

function TopicRowSkeleton() {
  return (
    <View style={styles.row}>
      <SkeletonBox width={120} height={16} />
    </View>
  );
}

function TopicPostRowSkeleton() {
  return (
    <View style={styles.topicPostRow}>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SkeletonBox width={90} height={14} />
          <SkeletonBox width={40} height={14} />
        </View>
        <SkeletonBox width="90%" height={16} />
        <SkeletonBox width="60%" height={16} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
          <SkeletonBox width={60} height={14} />
          <SkeletonBox width={80} height={14} />
        </View>
      </View>
      <SkeletonBox width={72} height={72} borderRadius={8} />
    </View>
  );
}

function FollowingListSkeleton({ tab }: { tab: FollowingTab }) {
  const count = 6;
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => {
        switch (tab) {
          case "users":
            return <UserRowSkeleton key={i} />;
          case "communities":
            return <TopicRowSkeleton key={i} />;
        }
      })}
    </View>
  );
}

function TopicPostsListSkeleton() {
  return (
    <View>
      {Array.from({ length: 5 }).map((_, i) => (
        <TopicPostRowSkeleton key={i} />
      ))}
    </View>
  );
}

// --- Empty state ---

function FollowingEmptyState({ tab }: { tab: FollowingTab }) {
  const { theme } = useUnistyles();

  const messages: Record<FollowingTab, { title: string; subtitle: string }> = {
    users: {
      title: "Not following any users",
      subtitle: "When you follow users, they'll appear here.",
    },
    communities: {
      title: "No joined communities",
      subtitle: "When you join communities, they'll appear here.",
    },
  };

  const { title, subtitle } = messages[tab];

  return (
    <View style={styles.emptyContainer}>
      <Image
        source={emptyInfoImage}
        style={styles.emptyImage}
        contentFit="contain"
      />
      <Text
        size="xxl"
        weight="bold"
        style={{ color: theme.colors.text.default, textAlign: "center" }}
      >
        {title}
      </Text>
      <Text
        size="lg"
        mode="subtle"
        style={{ marginTop: 8, textAlign: "center", maxWidth: 280 }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

// --- Row components ---

function UserRow({
  address,
  onPress,
}: {
  address: string;
  onPress: (id: string) => void;
}) {
  const { theme } = useUnistyles();
  const { data } = useUsernameFromAddress(address);
  const displayName = data?.username ?? address.slice(0, 10) + "...";

  return (
    <Pressable onPress={() => onPress(address)} style={styles.row}>
      <Avatar size="sm" seed={address} rounded="sm" />
      <Text
        size="md"
        weight="medium"
        style={{ marginLeft: 12, color: theme.colors.text.default, flex: 1 }}
        numberOfLines={1}
      >
        {displayName}
      </Text>
      <Icon
        icon={Ionicons}
        name="chevron-forward"
        size={18}
        color={theme.colors.text.subtle}
      />
    </Pressable>
  );
}

function TopicRow({
  topic,
  onPress,
}: {
  topic: string;
  onPress: (topic: string) => void;
}) {
  const { theme } = useUnistyles();

  return (
    <Pressable onPress={() => onPress(topic)} style={styles.row}>
      <Text
        size="md"
        weight="medium"
        style={{ color: theme.colors.text.default, flex: 1 }}
        numberOfLines={1}
      >
        {communityLabel(topic)}
      </Text>
      <Icon
        icon={Ionicons}
        name="chevron-forward"
        size={18}
        color={theme.colors.text.subtle}
      />
    </Pressable>
  );
}

function TopicPostRow({
  post,
  onPress,
}: {
  post: ApiPostType;
  onPress: (postId: string) => void;
}) {
  const hasThumbnail = post.thumbnail && post.thumbnail.length > 0;
  const timestampMs = post.timestamp * 1000;

  return (
    <Pressable
      onPress={() => onPress(post.post_id)}
      style={styles.topicPostRow}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.topicPostHeader}>
          <Text size="sm" mode="subtle" weight="medium" numberOfLines={1}>
            @{post.username || "anonymous"}
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
        {post.title ? (
          <Text size="md" weight="regular" numberOfLines={2}>
            {post.title}
          </Text>
        ) : post.content ? (
          <Text size="md" numberOfLines={2}>
            {post.content}
          </Text>
        ) : null}
        <View style={styles.topicPostMeta}>
          <Text size="sm" mode="subtle">
            {formatCount(Math.round(post.points), "point", "points")}
          </Text>
          <Text size="sm" mode="subtle">
            •
          </Text>
          <Text size="sm" mode="subtle">
            {formatCount(post.comments, "comment", "comments")}
          </Text>
        </View>
      </View>
      {hasThumbnail && (
        <Image
          source={{ uri: post.thumbnail }}
          style={styles.topicPostThumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      )}
    </Pressable>
  );
}

// --- Main screen ---

export function UserFollowingScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const pagerRef = useRef<PagerView>(null);

  const currentUser = useAuthStore((s) => s.user);
  const isOwnProfile =
    id === currentUser?.walletAddress || id === currentUser?.username;

  const isUsername = id && !id.startsWith("mirage");
  const { data: resolvedAddress } = useAddressFromUsername(
    isUsername ? id : null,
  );
  const userAddress = isUsername
    ? (resolvedAddress?.address ?? null)
    : (id ?? null);

  const { data: ownFollowedData, isLoading: isLoadingOwn } = useUserFollowed();
  const { data: otherFollowedData, isLoading: isLoadingOther } =
    useUserFollowedByAddress(isOwnProfile ? null : userAddress);

  const followedData = isOwnProfile ? ownFollowedData : otherFollowedData;
  const isLoading = isOwnProfile ? isLoadingOwn : isLoadingOther;

  const initialTab: FollowingTab = tab === "communities" ? "communities" : "users";
  const [activeTab, setActiveTab] = useState<FollowingTab>(initialTab);
  const [selectedCommunity, setSelectedCommunity] = useState<string | null>(null);
  const animatedTabIndex = useSharedValue(TAB_INDEX_MAP[initialTab]);

  const { data: communityPostsData, isLoading: isLoadingCommunityPosts } = usePosts({
    community: selectedCommunity ?? undefined,
    limit: 50,
  });

  const communityPosts = useMemo(() => {
    if (!communityPostsData?.posts) return [];
    return communityPostsData.posts;
  }, [communityPostsData]);

  const {
    data: joinedCommunitiesData,
    isLoading: isLoadingJoinedCommunities,
  } = useInfiniteCommunities(
    { joined_by: userAddress ?? undefined, limit: 50 },
    { enabled: !!userAddress },
  );

  const usersData = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData?.followed_users],
  );
  const topicsData = useMemo(
    () =>
      joinedCommunitiesData?.pages.flatMap((page) =>
        page.items.map((item) => item.community),
      ) ?? [],
    [joinedCommunitiesData],
  );

  const usersCount = usersData.length;
  const topicsCount = topicsData.length;

  const tabCounts: Record<FollowingTab, number> = useMemo(
    () => ({
      users: usersCount,
      communities: topicsCount,
    }),
    [usersCount, topicsCount],
  );

  const handleUserPress = useCallback(
    (userId: string) => {
      router.push(`/user/${userId}`);
    },
    [router],
  );

  const handleCommunityPress = useCallback(
    (topic: string) => {
      router.push(`/c/${encodeURIComponent(topic)}` as never);
    },
    [router],
  );

  const handleBackFromCommunity = useCallback(() => {
    setSelectedCommunity(null);
  }, []);

  const handleTopicPostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router],
  );

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleTabPress = useCallback((tab: FollowingTab) => {
    const index = TAB_INDEX_MAP[tab];
    setActiveTab(tab);
    animatedTabIndex.value = withTiming(index, { duration: 200 });
    pagerRef.current?.setPage(index);
    if (tab !== "communities") {
      setSelectedCommunity(null);
    }
  }, [animatedTabIndex]);

  const handlePageScroll = useCallback((e: any) => {
    const { position, offset } = e.nativeEvent;
    animatedTabIndex.value = position + offset;
  }, [animatedTabIndex]);

  const handlePageSelected = useCallback((e: any) => {
    const index = e.nativeEvent.position;
    const nextTab = INDEX_TAB_MAP[index];
    if (!nextTab) return;
    setActiveTab(nextTab);
    animatedTabIndex.value = index;
    if (nextTab !== "communities") {
      setSelectedCommunity(null);
    }
  }, [animatedTabIndex]);

  const renderUserItem = useCallback(
    ({ item }: { item: string }) => (
      <UserRow address={item} onPress={handleUserPress} />
    ),
    [handleUserPress],
  );

  const renderTopicItem = useCallback(
    ({ item }: { item: string }) => (
      <TopicRow topic={item} onPress={handleCommunityPress} />
    ),
    [handleCommunityPress],
  );

  const renderTopicPostItem = useCallback(
    ({ item }: { item: ApiPostType }) => (
      <TopicPostRow post={item} onPress={handleTopicPostPress} />
    ),
    [handleTopicPostPress],
  );

  const keyExtractor = useCallback((item: string) => item, []);
  const topicPostKeyExtractor = useCallback(
    (item: ApiPostType) => item.post_id,
    [],
  );

  const TopicPostsHeader = useCallback(() => {
    if (!selectedCommunity) return null;
    return (
      <View style={styles.topicHeader}>
        <Pressable onPress={handleBackFromCommunity} hitSlop={8}>
          <Icon
            icon={Ionicons}
            name="arrow-back"
            size={22}
            color={theme.colors.text.default}
          />
        </Pressable>
        <Text
          size="lg"
          weight="bold"
          numberOfLines={1}
          style={{ flex: 1, marginLeft: 12 }}
        >
          {communityLabel(selectedCommunity)}
        </Text>
      </View>
    );
  }, [selectedCommunity, theme.colors.text.default, handleBackFromCommunity]);

  const showTopicPosts = activeTab === "communities" && selectedCommunity !== null;

  const usersListEmpty = useCallback(() => {
    if (isLoading) return <FollowingListSkeleton tab="users" />;
    return <FollowingEmptyState tab="users" />;
  }, [isLoading]);

  const topicsListEmpty = useCallback(() => {
    if (isLoadingJoinedCommunities) return <FollowingListSkeleton tab="communities" />;
    return <FollowingEmptyState tab="communities" />;
  }, [isLoadingJoinedCommunities]);

  const communityPostsEmpty = useCallback(() => {
    if (isLoadingCommunityPosts) return <TopicPostsListSkeleton />;
    return <FollowingEmptyState tab="communities" />;
  }, [isLoadingCommunityPosts]);

  const singleTabWidth = SCREEN_WIDTH / TABS.length;
  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: animatedTabIndex.value * singleTabWidth }],
  }));

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
          <Pressable onPress={handleBackPress} hitSlop={8}>
            <Icon
              icon={Ionicons}
              name="arrow-back"
              size={24}
              color={theme.colors.text.default}
            />
          </Pressable>
          <Text size="lg" weight="bold" style={{ marginLeft: 16 }}>
            Following
          </Text>
        </View>

        <View style={styles.tabBarContainer}>
          <View style={styles.tabBar}>
            {TABS.map((tab, index) => {
              const count = tabCounts[tab.key];
              const hasCount = tab.key === "users"
                ? !isLoading && !!followedData
                : !isLoadingJoinedCommunities;
              const label = `${tab.label}${hasCount ? ` (${count})` : ""}`;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => handleTabPress(tab.key)}
                  style={styles.tab}
                >
                  <AnimatedTabLabel
                    label={label}
                    index={index}
                    animatedIndex={animatedTabIndex}
                    {...getTabLabelColors(theme.colors.text)}
                  />
                </Pressable>
              );
            })}
          </View>
          <Animated.View
            style={[
              styles.tabIndicator,
              { width: singleTabWidth, backgroundColor: theme.colors.text.default },
              tabIndicatorStyle,
            ]}
          />
          <View
            style={[
              styles.tabBarBorder,
              { backgroundColor: theme.colors.border.subtle },
            ]}
          />
        </View>
      </View>

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={TAB_INDEX_MAP[initialTab]}
        onPageScroll={handlePageScroll}
        onPageSelected={handlePageSelected}
      >
        <View key="users" style={{ flex: 1 }}>
          <FlatList
            data={usersData}
            renderItem={renderUserItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 20,
              flexGrow: usersData.length === 0 ? 1 : undefined,
            }}
            ListEmptyComponent={usersListEmpty}
          />
        </View>

        <View key="communities" style={{ flex: 1 }}>
          {showTopicPosts ? (
            <FlatList
              data={communityPosts}
              renderItem={renderTopicPostItem}
              keyExtractor={topicPostKeyExtractor}
              contentContainerStyle={{
                paddingBottom: insets.bottom + 20,
                flexGrow: communityPosts.length === 0 ? 1 : undefined,
              }}
              ListHeaderComponent={TopicPostsHeader}
              ListEmptyComponent={communityPostsEmpty}
            />
          ) : (
            <FlatList
              data={topicsData}
              renderItem={renderTopicItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={{
                paddingBottom: insets.bottom + 20,
                flexGrow: topicsData.length === 0 ? 1 : undefined,
              }}
              ListEmptyComponent={topicsListEmpty}
            />
          )}
        </View>
      </PagerView>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {},
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 56,
  },
  tabBarContainer: {
    position: "relative",
  },
  tabBar: {
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
  },
  tabBarBorder: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
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
  },
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  topicPostRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
    gap: 12,
  },
  topicPostHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  topicPostMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  topicPostThumbnail: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
}));
