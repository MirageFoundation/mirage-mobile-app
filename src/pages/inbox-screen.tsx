import { useRouter } from "expo-router";
import { memo, useCallback, useMemo, useRef, useState } from "react";
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
import { getNotifiedIds, getSeedTimestamp } from "@/src/services/inbox-notifications";

const emptyInfoImage = require("@/assets/images/empty-info.png");

const MemoizedInboxItem = memo(InboxItem);

export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const router = useRouter();
  const isLoggedIn = !!useAuthStore((s) => s.user);
  const unreadReplyIds = useInboxStore((s) => s.unreadReplyIds);
  const markAllAsRead = useInboxStore((s) => s.markAllAsRead);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useInfiniteInbox({ limit: 25 });

  const replies = useMemo(
    () => data?.pages?.flatMap((page) => page?.replies ?? []) ?? [],
    [data],
  );

  const visibleReplies = useMemo(() => {
    const notified = getNotifiedIds();
    const seedTs = getSeedTimestamp();
    if (seedTs === 0) return replies;
    return replies.filter(
      (r) => r.reply_timestamp <= seedTs || notified.has(r.reply_id),
    );
  }, [replies]);

  useFocusEffect(
    useCallback(() => {
      refetch();
      return () => {
        markAllAsRead();
      };
    }, [refetch, markAllAsRead]),
  );

  const unreadSet = useMemo(
    () => new Set(unreadReplyIds),
    [unreadReplyIds],
  );

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
      router.push(`/post/${rootPostId}?highlight=${replyId}`);
    },
    [router],
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
      const isUnread = unreadSet.has(item.reply_id);
      return (
        <MemoizedInboxItem
          reply={item}
          onPress={handleItemPress}
          isUnread={isUnread}
        />
      );
    },
    [handleItemPress, unreadSet],
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
        data={visibleReplies}
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
