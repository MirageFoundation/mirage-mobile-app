import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import PagerView from "react-native-pager-view";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  useEvent,
  useHandler,
  interpolateColor,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useUserBlocked, useUsernameFromAddress } from "@/src/api/read";
import { queryKeys } from "@/src/api/read/query-keys";
import type { UserBlockedResponse } from "@/src/api/types";
import { useUnblockUser, useUnblockPost, useUnblockCommunity } from "@/src/api/write";
import { Avatar } from "@/src/components/atoms";
import { ConfirmationPopup } from "@/src/components/molecules";
import { Box, Icon, Text } from "@/src/components/ui/primitives";
import { useAuthStore } from "@/src/stores";
import { LocalHiddenPosts } from "./local-hidden-posts";
import {
  usePowQueueStore,
  generateActionId,
} from "@/src/services/pow-queue";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

function AnimatedTabLabel({
  index,
  label,
  scrollPosition,
  activeColor,
  inactiveColor,
}: {
  index: number;
  label: string;
  scrollPosition: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
}) {
  const boldStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - index);
    const t = Math.min(distance, 1);
    return {
      opacity: 1 - t,
      color: interpolateColor(t, [0, 1], [activeColor, inactiveColor]),
    };
  });
  const mediumStyle = useAnimatedStyle(() => {
    const distance = Math.abs(scrollPosition.value - index);
    const t = Math.min(distance, 1);
    return {
      opacity: t,
      color: interpolateColor(t, [0, 1], [activeColor, inactiveColor]),
    };
  });
  return (
    <View>
      <Animated.Text
        style={[
          { fontSize: 13, fontWeight: "700", textAlign: "center" },
          boldStyle,
        ]}
      >
        {label}
      </Animated.Text>
      <Animated.Text
        style={[
          {
            fontSize: 13,
            fontWeight: "500",
            textAlign: "center",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          },
          mediumStyle,
        ]}
      >
        {label}
      </Animated.Text>
    </View>
  );
}

function usePagerScrollHandler(handlers: { onPageScroll: (e: any, ctx: any) => void }, deps?: unknown[]) {
  const { context, doDependenciesDiffer } = useHandler(handlers as any, deps);
  return useEvent(
    (event: any) => {
      "worklet";
      const { onPageScroll } = handlers;
      if (onPageScroll && event.eventName.endsWith("onPageScroll")) {
        onPageScroll(event, context);
      }
    },
    ["onPageScroll"],
    doDependenciesDiffer,
  );
}

const emptyInfoImage = require("@/assets/images/empty-info.png");

type BlockedTab = "users" | "posts" | "communities";

const TABS: { key: BlockedTab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "posts", label: "Posts" },
  { key: "communities", label: "Communities" },
];

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
      <View style={{ flex: 1 }} />
      <SkeletonBox width={70} height={28} borderRadius={14} />
    </View>
  );
}

function PostRowSkeleton() {
  return (
    <View style={styles.row}>
      <SkeletonBox width={16} height={16} borderRadius={4} />
      <View style={{ flex: 1, marginLeft: 12, gap: 4 }}>
        <SkeletonBox width="80%" height={14} />
        <SkeletonBox width="50%" height={12} />
      </View>
      <SkeletonBox width={70} height={28} borderRadius={14} />
    </View>
  );
}

function ListSkeleton({ tab }: { tab: BlockedTab }) {
  return (
    <View>
      {Array.from({ length: 6 }).map((_, i) =>
        tab === "users" ? <UserRowSkeleton key={i} /> : <PostRowSkeleton key={i} />,
      )}
    </View>
  );
}

function EmptyState({ tab }: { tab: BlockedTab }) {
  const { theme } = useUnistyles();
  const titles: Record<BlockedTab, string> = {
    users: "No blocked users",
    posts: "No blocked posts",
    communities: "No blocked communities",
  };
  const subtitles: Record<BlockedTab, string> = {
    users: "Users you block will appear here. You can unblock them anytime.",
    posts: "Posts you block will appear here. You can unblock them anytime.",
    communities: "Communities you block will appear here. You can unblock them anytime.",
  };

  return (
    <View style={styles.emptyContainer}>
      <Image
        source={emptyInfoImage}
        style={styles.emptyImage}
        contentFit="contain"
      />
      <Text
        size="lg"
        weight="bold"
        style={{ color: theme.colors.text.default, textAlign: "center" }}
      >
        {titles[tab]}
      </Text>
      <Text
        size="sm"
        mode="subtle"
        style={{ marginTop: 8, textAlign: "center", maxWidth: 280 }}
      >
        {subtitles[tab]}
      </Text>
    </View>
  );
}

function BlockedUserRow({
  address,
  onUnblock,
}: {
  address: string;
  onUnblock: (address: string) => void;
}) {
  const { theme } = useUnistyles();
  const router = useRouter();
  const { data } = useUsernameFromAddress(address);
  const displayName = data?.username ?? `${address.slice(0, 10)}...`;

  return (
    <Pressable
      onPress={() => router.push(`/user/${address}`)}
      style={styles.row}
    >
      <Avatar size="md" seed={address} rounded="sm" />
      <Text
        size="md"
        weight="medium"
        style={{ marginLeft: 12, color: theme.colors.text.default, flex: 1 }}
        numberOfLines={1}
      >
        {displayName}
      </Text>
      <Pressable
        onPress={() => onUnblock(address)}
        style={[styles.unblockButton, { borderColor: theme.colors.border.subtle }]}
      >
        <Text size="xs" weight="bold" style={{ color: theme.colors.text.default }}>
          Unblock
        </Text>
      </Pressable>
    </Pressable>
  );
}

function BlockedPostRow({
  postId,
  onUnblock,
}: {
  postId: string;
  onUnblock: (postId: string) => void;
}) {
  const { theme } = useUnistyles();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/post/${postId}`)}
      style={styles.row}
    >
      <Icon
        icon={Ionicons}
        name="document-text-outline"
        size={18}
        color={theme.colors.text.subtle}
      />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          size="sm"
          weight="medium"
          style={{ color: theme.colors.text.default }}
          numberOfLines={1}
        >
          {postId.slice(0, 12)}...{postId.slice(-6)}
        </Text>
        <Text size="xs" mode="subtle">
          Blocked post
        </Text>
      </View>
      <Pressable
        onPress={() => onUnblock(postId)}
        style={[styles.unblockButton, { borderColor: theme.colors.border.subtle }]}
      >
        <Text size="xs" weight="bold" style={{ color: theme.colors.text.default }}>
          Unblock
        </Text>
      </Pressable>
    </Pressable>
  );
}

function BlockedTopicRow({
  topic,
  onUnblock,
}: {
  topic: string;
  onUnblock: (topic: string) => void;
}) {
  const { theme } = useUnistyles();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/c/${topic}` as never)}
      style={styles.row}
    >
      <Icon
        icon={Ionicons}
        name="pricetag-outline"
        size={18}
        color={theme.colors.text.subtle}
      />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          size="sm"
          weight="medium"
          style={{ color: theme.colors.text.default }}
          numberOfLines={1}
        >
          #{topic}
        </Text>
        <Text size="xs" mode="subtle">
          Blocked topic
        </Text>
      </View>
      <Pressable
        onPress={() => onUnblock(topic)}
        style={[styles.unblockButton, { borderColor: theme.colors.border.subtle }]}
      >
        <Text size="xs" weight="bold" style={{ color: theme.colors.text.default }}>
          Unblock
        </Text>
      </Pressable>
    </Pressable>
  );
}

export function BlockedListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const pagerRef = useRef<PagerView>(null);
  const queryClient = useQueryClient();
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  const { data: blockedData, isLoading, refetch } = useUserBlocked();
  const unblockUserMutation = useUnblockUser();
  const unblockPostMutation = useUnblockPost();
  const unblockCommunityMutation = useUnblockCommunity();
  const enqueue = usePowQueueStore((state) => state.enqueue);

  const [, setActiveTab] = useState<BlockedTab>("users");
  const [confirmTarget, setConfirmTarget] = useState<{
    type: "user" | "post" | "topic";
    id: string;
  } | null>(null);

  const scrollPosition = useSharedValue(0);
  const [tabBarWidth, setTabBarWidth] = useState(0);

  const pagerScrollHandler = usePagerScrollHandler({
    onPageScroll: (e) => {
      "worklet";
      scrollPosition.value = e.position + e.offset;
    },
  });

  const indicatorStyle = useAnimatedStyle(() => {
    const tabWidth = tabBarWidth / TABS.length;
    return {
      width: tabWidth,
      transform: [{ translateX: scrollPosition.value * tabWidth }],
    };
  });

  const blockedUsers = useMemo(
    () => blockedData?.blocked_users ?? [],
    [blockedData?.blocked_users],
  );
  const blockedPosts = useMemo(
    () => blockedData?.blocked_posts ?? [],
    [blockedData?.blocked_posts],
  );
  const blockedTopics = useMemo(
    () => blockedData?.blocked_communities ?? [],
    [blockedData?.blocked_communities],
  );

  const tabCounts: Record<BlockedTab, number> = useMemo(
    () => ({
      users: blockedUsers.length,
      posts: blockedPosts.length,
      communities: blockedTopics.length,
    }),
    [blockedUsers.length, blockedPosts.length, blockedTopics.length],
  );

  const handleBackPress = useCallback(() => {
    router.back();
  }, [router]);

  const handleTabPress = useCallback((tab: BlockedTab) => {
    setActiveTab(tab);
    const index = TABS.findIndex((t) => t.key === tab);
    pagerRef.current?.setPage(index);
  }, []);

  const handlePageSelected = useCallback((e: any) => {
    const index = e.nativeEvent.position;
    setActiveTab(TABS[index].key);
  }, []);

  const handleRequestUnblockUser = useCallback((address: string) => {
    setConfirmTarget({ type: "user", id: address });
  }, []);

  const handleRequestUnblockPost = useCallback((postId: string) => {
    setConfirmTarget({ type: "post", id: postId });
  }, []);

  const handleRequestUnblockCommunity = useCallback((topic: string) => {
    setConfirmTarget({ type: "topic", id: topic });
  }, []);

  const optimisticallyRemoveFromList = useCallback(
    (type: "user" | "post" | "topic", id: string) => {
      if (!walletAddress) return;
      const qk = queryKeys.userBlocked(walletAddress);
      const prev = queryClient.getQueryData<UserBlockedResponse>(qk);
      if (!prev) return;
      const updated = { ...prev };
      if (type === "user") {
        updated.blocked_users = prev.blocked_users.filter((u) => u !== id);
      } else if (type === "post") {
        updated.blocked_posts = prev.blocked_posts.filter((p) => p !== id);
      } else {
        updated.blocked_communities = (prev.blocked_communities ?? []).filter((t) => t !== id);
      }
      queryClient.setQueryData(qk, updated);
      return prev;
    },
    [walletAddress, queryClient],
  );

  const handleConfirmUnblock = useCallback(() => {
    if (!confirmTarget) return;
    const { type, id } = confirmTarget;
    setConfirmTarget(null);

    const actionId = generateActionId();
    const label =
      type === "user"
        ? "Unblocking user"
        : type === "post"
          ? "Unblocking post"
          : "Unblocking topic";

    const previousData = type === "topic"
      ? undefined
      : optimisticallyRemoveFromList(type, id);

    enqueue({
      id: actionId,
      type: "unblock",
      label,
      execute: async () => {
        const qk = walletAddress ? queryKeys.userBlocked(walletAddress) : null;
        if (qk && type !== "topic") {
          await queryClient.cancelQueries({ queryKey: qk });
        }
        let result;
        if (type === "user") {
          result = await unblockUserMutation.mutateAsync(id);
        } else if (type === "post") {
          result = await unblockPostMutation.mutateAsync(id);
        } else {
          result = await unblockCommunityMutation.mutateAsync(id);
        }
        if (qk && type !== "topic") {
          await queryClient.cancelQueries({ queryKey: qk });
          optimisticallyRemoveFromList(type, id);
        }
        return result;
      },
      onSuccess: () => {
        if (type === "topic") return;
        if (walletAddress) {
          queryClient.cancelQueries({ queryKey: queryKeys.userBlocked(walletAddress) });
          optimisticallyRemoveFromList(type, id);
        }
        setTimeout(async () => {
          await refetch();
          optimisticallyRemoveFromList(type, id);
        }, 3000);
      },
      onError: () => {
        if (previousData && walletAddress) {
          queryClient.setQueryData(queryKeys.userBlocked(walletAddress), previousData);
        }
      },
      onRollback: () => {
        if (previousData && walletAddress) {
          queryClient.setQueryData(queryKeys.userBlocked(walletAddress), previousData);
        }
      },
    });
  }, [confirmTarget, unblockUserMutation, unblockPostMutation, unblockCommunityMutation, enqueue, refetch, optimisticallyRemoveFromList, walletAddress, queryClient]);

  const handleCancelUnblock = useCallback(() => {
    setConfirmTarget(null);
  }, []);

  const renderUserItem = useCallback(
    ({ item }: { item: string }) => (
      <BlockedUserRow address={item} onUnblock={handleRequestUnblockUser} />
    ),
    [handleRequestUnblockUser],
  );

  const renderPostItem = useCallback(
    ({ item }: { item: string }) => (
      <BlockedPostRow postId={item} onUnblock={handleRequestUnblockPost} />
    ),
    [handleRequestUnblockPost],
  );

  const renderTopicItem = useCallback(
    ({ item }: { item: string }) => (
      <BlockedTopicRow topic={item} onUnblock={handleRequestUnblockCommunity} />
    ),
    [handleRequestUnblockCommunity],
  );

  const keyExtractor = useCallback((item: string) => item, []);

  const usersListEmpty = useCallback(() => {
    if (isLoading) return <ListSkeleton tab="users" />;
    return <EmptyState tab="users" />;
  }, [isLoading]);

  const postsListEmpty = useCallback(() => {
    if (isLoading) return <ListSkeleton tab="posts" />;
    return <EmptyState tab="posts" />;
  }, [isLoading]);

  const topicsListEmpty = useCallback(() => {
    if (isLoading) return <ListSkeleton tab="communities" />;
    return <EmptyState tab="communities" />;
  }, [isLoading]);

  const getConfirmTitle = () => {
    if (!confirmTarget) return "Unblock?";
    if (confirmTarget.type === "user") return "Unblock User?";
    if (confirmTarget.type === "post") return "Unblock Post?";
    return "Unblock Topic?";
  };

  const getConfirmMessage = () => {
    if (!confirmTarget) return "";
    if (confirmTarget.type === "user") return "You'll see their content in your feed again.";
    if (confirmTarget.type === "post") return "This post will appear in your feed again.";
    return "Posts with this topic will appear in your feed again.";
  };

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
            Blocked
          </Text>
        </View>

        <View
          style={styles.tabBar}
          onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}
        >
          {TABS.map((tab) => {
            const count = tabCounts[tab.key];
            const hasCount = !isLoading && blockedData;
            const tabIndex = TABS.findIndex((t) => t.key === tab.key);
            const labelText = `${tab.label}${hasCount ? ` (${count})` : ""}`;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleTabPress(tab.key)}
                style={styles.tab}
              >
                <AnimatedTabLabel
                  index={tabIndex}
                  label={labelText}
                  scrollPosition={scrollPosition}
                  activeColor={theme.colors.text.default}
                  inactiveColor={theme.colors.text.subtle}
                />
              </Pressable>
            );
          })}
          {tabBarWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tabIndicator,
                { backgroundColor: theme.colors.text.default },
                indicatorStyle,
              ]}
            />
          )}
        </View>
      </View>

      <LocalHiddenPosts />
      <AnimatedPagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={handlePageSelected}
        onPageScroll={pagerScrollHandler}
      >
        <View key="users" style={{ flex: 1 }}>
          <FlatList
            data={blockedUsers}
            renderItem={renderUserItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 20,
              flexGrow: blockedUsers.length === 0 ? 1 : undefined,
            }}
            ListEmptyComponent={usersListEmpty}
          />
        </View>

        <View key="posts" style={{ flex: 1 }}>
          <FlatList
            data={blockedPosts}
            renderItem={renderPostItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 20,
              flexGrow: blockedPosts.length === 0 ? 1 : undefined,
            }}
            ListEmptyComponent={postsListEmpty}
          />
        </View>

        <View key="communities" style={{ flex: 1 }}>
          <FlatList
            data={blockedTopics}
            renderItem={renderTopicItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 20,
              flexGrow: blockedTopics.length === 0 ? 1 : undefined,
            }}
            ListEmptyComponent={topicsListEmpty}
          />
        </View>
      </AnimatedPagerView>

      <ConfirmationPopup
        visible={!!confirmTarget}
        title={getConfirmTitle()}
        message={getConfirmMessage()}
        icon="ban-outline"
        confirmText="Unblock"
        onConfirm={handleConfirmUnblock}
        onCancel={handleCancelUnblock}
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
  tabBar: {
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    position: "relative",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  unblockButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
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
