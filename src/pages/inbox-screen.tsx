import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/hooks/use-router";
import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, InteractionManager, Platform, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";

import { useInfiniteInbox } from "@/src/api/read/hooks/use-inbox";
import { queryKeys } from "@/src/api/read/query-keys";
import { triggerHaptic } from "@/src/components/utils/haptics";
import type { CommentsResponse, InboxReply, PostWithChildren } from "@/src/api/types";
import { InboxItem } from "@/src/components/molecules/inbox-item";
import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { Box, Text } from "@/src/components/ui/primitives";
import { useAuthStore } from "@/src/stores";
import { useInboxStore } from "@/src/stores/inbox-store";
import { useShallow } from "zustand/react/shallow";
import { markRepliesAsNotified } from "@/src/services/inbox-notified-ids";
import { markInboxViewed } from "@/src/api/write/endpoints/inbox";
import { walletService } from "@/src/services/wallet-service";

const emptyInfoImage = require("@/assets/images/empty-info.png");

const MemoizedInboxItem = InboxItem;

function buildInboxCommentPost(reply: InboxReply): PostWithChildren {
  return {
    post_id: reply.reply_id,
    user_id: reply.reply_owner,
    username: reply.reply_username || reply.reply_owner,
    author_level: reply.reply_author_level,
    timestamp: reply.reply_timestamp,
    topic: "",
    root_topic: "",
    root_post_id: reply.root_post_id,
    title: "",
    content: reply.reply_content,
    tag: "",
    edited_at: 0,
    thumbnail: "",
    points: 0,
    comments: 0,
    user_vote: 0,
    user_weight: 0,
    children: [],
  };
}

function buildInboxParentPost(reply: InboxReply): PostWithChildren | null {
  if (!reply.parent_id || !reply.parent_content) return null;

  return {
    post_id: reply.parent_id,
    user_id: reply.parent_owner,
    username: reply.parent_owner,
    timestamp: reply.reply_timestamp,
    topic: "",
    root_topic: "",
    root_post_id: reply.root_post_id,
    title: "",
    content: reply.parent_content,
    tag: "",
    edited_at: 0,
    thumbnail: "",
    points: 0,
    comments: 1,
    user_vote: 0,
    user_weight: 0,
    children: [],
  };
}

export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const router = useRouter();
  const queryClient = useQueryClient();
  useLocalSearchParams<{
    fromNotification?: string;
    replyId?: string;
  }>();
  const isLoggedIn = !!useAuthStore((s) => s.user);
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const {
    markAsViewed,
    highlightBaselineAt,
    readReplyIds,
    markReplyAsRead,
    advanceHighlightBaseline,
    setInboxActive,
    notificationTarget,
    clearNotificationTarget,
  } = useInboxStore(
    useShallow((s) => ({
      markAsViewed: s.markAsViewed,
      highlightBaselineAt: s.highlightBaselineAt,
      readReplyIds: s.readReplyIds,
      markReplyAsRead: s.markReplyAsRead,
      advanceHighlightBaseline: s.advanceHighlightBaseline,
      setInboxActive: s.setInboxActive,
      notificationTarget: s.notificationTarget,
      clearNotificationTarget: s.clearNotificationTarget,
    })),
  );
  const readReplyIdsSet = useMemo(() => new Set(readReplyIds), [readReplyIds]);
  const listRef = useRef<FlatList<InboxReply>>(null);
  const applyViewedTimestamp = useCallback(
    (timestamp?: number) => {
      const resolved =
        typeof timestamp === "number" && timestamp > 0
          ? timestamp
          : Math.floor(Date.now() / 1000);
      markAsViewed(resolved);
    },
    [markAsViewed],
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteInbox({ limit: 25 });

  const replies = useMemo(() => {
    const items: InboxReply[] = [];
    const seen = new Set<string>();
    for (const page of data?.pages ?? []) {
      for (const reply of page?.replies ?? []) {
        if (!reply?.reply_id || seen.has(reply.reply_id)) continue;
        seen.add(reply.reply_id);
        items.push(reply);
      }
    }
    return items;
  }, [data]);

  const activeNotificationId = notificationTarget?.notificationId;
  const targetReplyId = notificationTarget?.replyId;
  const previewReply = notificationTarget?.previewReply ?? null;
  const hasFetchedTargetReply = useMemo(
    () => (targetReplyId ? replies.some((item) => item.reply_id === targetReplyId) : false),
    [replies, targetReplyId],
  );
  const visibleReplies = useMemo(() => {
    if (!previewReply || replies.some((item) => item.reply_id === previewReply.reply_id)) {
      return replies;
    }
    return [previewReply, ...replies];
  }, [previewReply, replies]);

  const fromNotificationRef = useRef(activeNotificationId);
  fromNotificationRef.current = activeNotificationId;
  const [isNotificationLoading, setIsNotificationLoading] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setInboxActive(true);
      markAsViewed();
      if (!fromNotificationRef.current) {
        refetch();
      }
      Notifications.dismissAllNotificationsAsync();
      Notifications.setBadgeCountAsync(0);
      const task = InteractionManager.runAfterInteractions(() => {
        if (walletAddress) {
          walletService.getWallet().then((wallet) => {
            if (!wallet) return;
            markInboxViewed(wallet)
              .then((res) => {
                applyViewedTimestamp(res.inbox_last_viewed_at);
              })
              .catch(() => {
                Sentry.addBreadcrumb({
                  category: "inbox",
                  message: "Failed to mark inbox as viewed",
                  level: "warning",
                });
                applyViewedTimestamp();
              });
          });
        }
      });
      return () => {
        task.cancel();
        setInboxActive(false);
      };
    }, [applyViewedTimestamp, refetch, walletAddress, markAsViewed, setInboxActive]),
  );

  useEffect(() => {
    if (visibleReplies.length > 0) {
      markRepliesAsNotified(visibleReplies.map((r) => r.reply_id));
    }
  }, [visibleReplies]);

  useEffect(() => {
    if (!activeNotificationId) {
      setIsNotificationLoading(false);
      return;
    }

    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });

    if (hasFetchedTargetReply) {
      setIsNotificationLoading(false);
      clearNotificationTarget(activeNotificationId);
      return;
    }

    setIsNotificationLoading(true);
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = targetReplyId ? 6 : 1;

    const runFetch = async () => {
      if (cancelled) return;
      attempts += 1;
      await refetch();
      if (cancelled) return;
      if (attempts >= maxAttempts) {
        setIsNotificationLoading(false);
        return;
      }
      timeoutId = setTimeout(() => {
        void runFetch();
      }, 700);
    };

    void runFetch();

    return () => {
      cancelled = true;
      setIsNotificationLoading(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    activeNotificationId,
    clearNotificationTarget,
    hasFetchedTargetReply,
    refetch,
    targetReplyId,
  ]);

  useEffect(() => {
    if (!activeNotificationId || !hasFetchedTargetReply) {
      return;
    }
    clearNotificationTarget(activeNotificationId);
  }, [activeNotificationId, clearNotificationTarget, hasFetchedTargetReply]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const handleMarkAllAsSeen = useCallback(() => {
    triggerHaptic("light");
    advanceHighlightBaseline();
  }, [advanceHighlightBaseline]);

  const routerRef = useRef(router);
  routerRef.current = router;

  const seedFocusedCommentFromInbox = useCallback(
    (reply: InboxReply) => {
      const address = walletAddress ?? undefined;
      const comment = buildInboxCommentPost(reply);
      const parent = buildInboxParentPost(reply);
      const cachedRootPost = queryClient.getQueryData<CommentsResponse>(
        queryKeys.comments(reply.root_post_id, address),
      )?.root;
      const focusedCommentData: CommentsResponse = {
        root: comment,
        children: [],
      };

      queryClient.setQueryData(
        queryKeys.comments(reply.reply_id, address),
        focusedCommentData,
      );

      if (parent) {
        queryClient.setQueryData(queryKeys.commentContext(reply.reply_id, 5), {
          comment_id: reply.reply_id,
          context: [parent],
        });

        if (reply.parent_id === reply.root_post_id) {
          queryClient.setQueryData(queryKeys.comments(reply.root_post_id, address), {
            root: cachedRootPost ?? parent,
            children: [comment],
          });
        }
      }
    },
    [queryClient, walletAddress],
  );

  const handleItemPress = useCallback(
    (reply: InboxReply) => {
      markReplyAsRead(reply.reply_id);

      if (reply.type === "donation") {
        routerRef.current.navigate("/(tabs)/profile");
        return;
      }

      if (reply.type === "follow" && reply.reply_owner) {
        routerRef.current.push(`/user/${reply.reply_owner}`);
        return;
      }

      if (reply.type === "subscription_gift") {
        if (Platform.OS === "android") {
          routerRef.current.push("/subscription");
          return;
        }

        routerRef.current.navigate("/(tabs)/profile");
        return;
      }

      Sentry.addBreadcrumb({
        category: "inbox",
        message: "Inbox reply opened focused comment detail",
        level: "info",
        data: {
          replyId: reply.reply_id,
          rootPostId: reply.root_post_id,
          parentId: reply.parent_id,
          type: reply.type ?? "reply",
        },
      });
      seedFocusedCommentFromInbox(reply);
      routerRef.current.push(`/post/${reply.reply_id}?depth=5`);
    },
    [markReplyAsRead, seedFocusedCommentFromInbox],
  );

  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);

  const handleEndReached = useCallback(() => {
    const now = Date.now();
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchingRef.current &&
      now - lastFetchTime.current > 1000
    ) {
      lastFetchTime.current = now;
      isFetchingRef.current = true;
      fetchNextPage().finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const keyExtractor = useCallback((item: InboxReply) => item.reply_id, []);

  const renderItem = useCallback(
    ({ item }: { item: InboxReply }) => {
      const isUnread =
        item.reply_timestamp > highlightBaselineAt &&
        !readReplyIdsSet.has(item.reply_id);
      return (
        <MemoizedInboxItem
          reply={item}
          onPress={handleItemPress}
          isUnread={isUnread}
        />
      );
    },
    [handleItemPress, readReplyIdsSet, highlightBaselineAt],
  );

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return <ProfilePostsSkeleton count={6} type="comments" />;
    }

    if (!isLoggedIn) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="log-in-outline"
            size={48}
            color={theme.colors.text.subtle}
          />
          <Text
            size="md"
            weight="medium"
            mode="subtle"
            style={styles.emptyTitle}
          >
            Sign in to see your inbox
          </Text>
          <Text size="sm" mode="subtle" style={styles.emptySubtitle}>
            Replies to your posts and comments will appear here
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <ExpoImage
          source={emptyInfoImage}
          style={styles.emptyImage}
          contentFit="contain"
        />
        <Text size="xxl" weight="bold" style={styles.emptyTitle}>
          No replies yet
        </Text>
        <Text size="lg" mode="subtle" style={styles.emptySubtitle}>
          When someone replies to your posts or comments, it will show up here
        </Text>
      </View>
    );
  }, [isLoading, isLoggedIn, theme.colors.text.subtle]);

  const ListFooterComponent = useCallback(() => {
    if (isFetchingNextPage) {
      return <ProfilePostsSkeleton count={2} type="comments" />;
    }
    return <View style={{ height: 80 }} />;
  }, [isFetchingNextPage]);

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name="mail-outline"
            size={22}
            color={theme.colors.text.default}
          />
          <Text size="xl" weight="bold">
            Inbox
          </Text>
        </View>
        <Pressable
          onPress={handleMarkAllAsSeen}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <View style={styles.markSeenButton}>
            <Ionicons name="checkmark-done-outline" size={18} color={theme.colors.text.subtle} />
            <Text size="md" weight="semibold" mode="subtle">
              Mark as seen
            </Text>
          </View>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={visibleReplies}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          isNotificationLoading ? (
            <ActivityIndicator
              style={{ paddingVertical: 12 }}
              color={theme.colors.primary[500]}
            />
          ) : null
        }
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 20,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary[500]}
          />
        }
        removeClippedSubviews={Platform.OS === "android"}
        maxToRenderPerBatch={Platform.OS === "android" ? 6 : 8}
        windowSize={Platform.OS === "android" ? 7 : 9}
        initialNumToRender={Platform.OS === "android" ? 6 : 8}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  markSeenButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  emptyImage: {
    width: 180,
    height: 180,
  },
  emptyTitle: {
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: theme.spacing.xs,
    textAlign: "center",
    lineHeight: 20,
  },
}));
