import { Ionicons } from "@expo/vector-icons";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { InboxReply } from "@/src/api/types";
import { InboxItem } from "@/src/components/molecules/inbox-item";
import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { Box, Text } from "@/src/components/ui/primitives";
import { InboxEmptyState } from "@/src/pages/inbox/inbox-empty-state";
import { isInboxReplyUnread } from "@/src/pages/inbox/inbox-state";
import { useInboxController } from "@/src/pages/inbox/use-inbox-controller";

export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const controller = useInboxController();

  const renderItem = useCallback(
    ({ item }: { item: InboxReply }) => (
      <InboxItem
        reply={item}
        onPress={controller.handleItemPress}
        isUnread={isInboxReplyUnread(
          item,
          controller.highlightBaselineAt,
          controller.readReplyIdsSet,
        )}
      />
    ),
    [
      controller.handleItemPress,
      controller.highlightBaselineAt,
      controller.readReplyIdsSet,
    ],
  );

  const renderEmptyState = useCallback(
    () => (
      <InboxEmptyState
        isLoading={controller.isLoading}
        isError={controller.isError}
        hasInitialLoadTimedOut={controller.hasInitialLoadTimedOut}
        isLoggedIn={controller.isLoggedIn}
        onRetry={controller.handleRetry}
      />
    ),
    [
      controller.handleRetry,
      controller.hasInitialLoadTimedOut,
      controller.isError,
      controller.isLoading,
      controller.isLoggedIn,
    ],
  );

  const renderFooter = useCallback(
    () =>
      controller.isFetchingNextPage ? (
        <ProfilePostsSkeleton count={2} type="comments" />
      ) : (
        <View style={styles.footerSpace} />
      ),
    [controller.isFetchingNextPage],
  );

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="mail-outline" size={22} color={theme.colors.text.default} />
          <Text size="xl" weight="bold">
            Inbox
          </Text>
        </View>
        <Pressable
          onPress={controller.handleMarkAllAsSeen}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <View style={styles.markSeenButton}>
            <Ionicons
              name="checkmark-done-outline"
              size={18}
              color={theme.colors.text.subtle}
            />
            <Text size="md" weight="semibold" mode="subtle">
              Mark as seen
            </Text>
          </View>
        </Pressable>
      </View>

      <FlatList
        ref={controller.listRef}
        data={controller.visibleReplies}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          controller.isNotificationLoading ? (
            <ActivityIndicator
              style={styles.notificationLoader}
              color={theme.colors.primary[500]}
            />
          ) : null
        }
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderFooter}
        onEndReached={controller.handleEndReached}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 20,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={controller.isRefreshing}
            onRefresh={controller.handleRefresh}
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

function keyExtractor(item: InboxReply) {
  return item.reply_id;
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
  notificationLoader: {
    paddingVertical: 12,
  },
  footerSpace: {
    height: 80,
  },
}));
