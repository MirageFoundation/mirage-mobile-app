import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { useInfiniteInbox } from "@/src/api/read/hooks/use-inbox";
import type { InboxReply } from "@/src/api/types";
import { InboxItem } from "@/src/components/molecules/inbox-item";
import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { Box, Text } from "@/src/components/ui/primitives";
import { useAuthStore } from "@/src/stores";
import { useInboxStore } from "@/src/stores/inbox-store";
import { useShallow } from "zustand/react/shallow";
import { markRepliesAsNotified } from "@/src/services/inbox-notifications";
import { markInboxViewed } from "@/src/api/write/endpoints/inbox";

const emptyInfoImage = require("@/assets/images/empty-info.png");

const MemoizedInboxItem = memo(InboxItem);

export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const router = useRouter();
  const { fromNotification } = useLocalSearchParams<{
    fromNotification?: string;
  }>();
  const isLoggedIn = !!useAuthStore((s) => s.user);
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const { markAsViewed, highlightBaselineAt, readReplyIds, markReplyAsRead } =
    useInboxStore(
      useShallow((s) => ({
        markAsViewed: s.markAsViewed,
        highlightBaselineAt: s.highlightBaselineAt,
        readReplyIds: s.readReplyIds,
        markReplyAsRead: s.markReplyAsRead,
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
    isRefetching,
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

  useFocusEffect(
    useCallback(() => {
      markAsViewed();
      refetch();
      if (walletAddress) {
        markInboxViewed(walletAddress)
          .then((res) => {
            applyViewedTimestamp(res.inbox_last_viewed_at);
          })
          .catch(() => {
            applyViewedTimestamp();
          });
      }
      return () => {};
    }, [applyViewedTimestamp, refetch, walletAddress, markAsViewed]),
  );

  useEffect(() => {
    if (replies.length > 0) {
      markRepliesAsNotified(replies.map((r) => r.reply_id));
    }
  }, [replies]);

  useEffect(() => {
    if (!fromNotification) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    refetch();
  }, [fromNotification, refetch]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const handleItemPress = useCallback(
    (rootPostId: string, replyId: string) => {
      markReplyAsRead(replyId);
      router.push(`/post/${rootPostId}?highlight=${replyId}`);
    },
    [router, markReplyAsRead],
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
        <Image
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
        <Ionicons
          name="mail-outline"
          size={22}
          color={theme.colors.text.default}
        />
        <Text size="xl" weight="bold">
          Inbox
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={replies}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
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
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
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
