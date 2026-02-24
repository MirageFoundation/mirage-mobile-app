import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import PagerView from "react-native-pager-view";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useUserBlocked, useUsernameFromAddress } from "@/src/api/read";
import { queryKeys } from "@/src/api/read/query-keys";
import type { UserBlockedResponse } from "@/src/api/types";
import { useUnblockUser, useUnblockPost, useUnblockTopic } from "@/src/api/write";
import { Avatar } from "@/src/components/atoms";
import { ConfirmationPopup } from "@/src/components/molecules";
import { Box, Icon, Text } from "@/src/components/ui/primitives";
import { useAuthStore, useContentModerationStore } from "@/src/stores";
import {
  usePowQueueStore,
  generateActionId,
} from "@/src/services/pow-queue";

const emptyInfoImage = require("@/assets/images/empty-info.png");

type BlockedTab = "users" | "posts" | "topics";

const TABS: { key: BlockedTab; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "posts", label: "Posts" },
  { key: "topics", label: "Topics" },
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
      <SkeletonBox width={40} height={40} borderRadius={20} />
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
    topics: "No blocked topics",
  };
  const subtitles: Record<BlockedTab, string> = {
    users: "Users you block will appear here. You can unblock them anytime.",
    posts: "Posts you block will appear here. You can unblock them anytime.",
    topics: "Topics you block will appear here. You can unblock them anytime.",
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
      <Avatar size="md" seed={address} rounded="full" />
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
      onPress={() => router.push(`/topic/${topic}`)}
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
  const unblockTopicMutation = useUnblockTopic();
  const unblockTopicOptimistic = useContentModerationStore((s) => s.unblockTopic);
  const enqueue = usePowQueueStore((state) => state.enqueue);

  const [activeTab, setActiveTab] = useState<BlockedTab>("users");
  const [confirmTarget, setConfirmTarget] = useState<{
    type: "user" | "post" | "topic";
    id: string;
  } | null>(null);

  const blockedUsers = useMemo(
    () => blockedData?.blocked_users ?? [],
    [blockedData?.blocked_users],
  );
  const blockedPosts = useMemo(
    () => blockedData?.blocked_posts ?? [],
    [blockedData?.blocked_posts],
  );
  const blockedTopics = useMemo(
    () => blockedData?.blocked_topics ?? [],
    [blockedData?.blocked_topics],
  );

  const tabCounts: Record<BlockedTab, number> = useMemo(
    () => ({
      users: blockedUsers.length,
      posts: blockedPosts.length,
      topics: blockedTopics.length,
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

  const handleRequestUnblockTopic = useCallback((topic: string) => {
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
        updated.blocked_topics = (prev.blocked_topics ?? []).filter((t) => t !== id);
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

    if (type === "topic") {
      unblockTopicOptimistic(id);
    }

    const previousData = optimisticallyRemoveFromList(type, id);

    enqueue({
      id: actionId,
      type: "unblock",
      label,
      execute: async () => {
        if (type === "user") {
          return unblockUserMutation.mutateAsync(id);
        } else if (type === "post") {
          return unblockPostMutation.mutateAsync(id);
        } else {
          return unblockTopicMutation.mutateAsync(id);
        }
      },
      onSuccess: () => {
        refetch();
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
  }, [confirmTarget, unblockUserMutation, unblockPostMutation, unblockTopicMutation, unblockTopicOptimistic, enqueue, refetch, optimisticallyRemoveFromList, walletAddress, queryClient]);

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
      <BlockedTopicRow topic={item} onUnblock={handleRequestUnblockTopic} />
    ),
    [handleRequestUnblockTopic],
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
    if (isLoading) return <ListSkeleton tab="topics" />;
    return <EmptyState tab="topics" />;
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

        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tabCounts[tab.key];
            const hasCount = !isLoading && blockedData;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleTabPress(tab.key)}
                style={styles.tab}
              >
                <Text
                  size="sm"
                  weight={isActive ? "bold" : "medium"}
                  style={{
                    color: isActive
                      ? theme.colors.text.default
                      : theme.colors.text.subtle,
                  }}
                >
                  {tab.label}
                  {hasCount ? ` (${count})` : ""}
                </Text>
                {isActive && (
                  <View
                    style={[
                      styles.tabIndicator,
                      { backgroundColor: theme.colors.text.default },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={handlePageSelected}
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

        <View key="topics" style={{ flex: 1 }}>
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
      </PagerView>

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
    right: 0,
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
