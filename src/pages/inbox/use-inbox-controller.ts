import { useLocalSearchParams } from "expo-router";
import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, InteractionManager, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";

import { useInfiniteInbox } from "@/src/api/read/hooks/use-inbox";
import type { InboxReply } from "@/src/api/types";
import { markInboxViewed } from "@/src/api/write/endpoints/inbox";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { confirmInboxNotificationNavigation } from "@/src/services/inbox-notifications";
import { markRepliesAsNotified } from "@/src/services/inbox-notified-ids";
import { walletService } from "@/src/services/wallet-service";
import { useAuthStore } from "@/src/stores";
import { useInboxStore } from "@/src/stores/inbox-store";
import { useShallow } from "zustand/react/shallow";
import { flattenInboxReplies, prependInboxPreview } from "./inbox-state";
import { useInboxItemNavigation } from "./use-inbox-item-navigation";

export function useInboxController() {
  const {
    fromNotification: routeNotificationId,
    replyId: routeReplyId,
    openReply: routeOpenReply,
  } = useLocalSearchParams<{
    fromNotification?: string;
    replyId?: string;
    openReply?: string;
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
    isError,
    error,
    isFetching,
    isLoading,
    refetch,
  } = useInfiniteInbox({ limit: 25 });
  const [hasInitialLoadTimedOut, setHasInitialLoadTimedOut] = useState(false);
  const hasCapturedInitialLoadTimeoutRef = useRef(false);
  const hasCapturedInitialLoadErrorRef = useRef(false);

  useEffect(() => {
    if (!isError) {
      hasCapturedInitialLoadErrorRef.current = false;
      return;
    }
    if (hasCapturedInitialLoadErrorRef.current) return;
    hasCapturedInitialLoadErrorRef.current = true;
    Sentry.addBreadcrumb({
      category: "inbox",
      message: "Inbox initial load failed",
      level: "warning",
      data: {
        platform: Platform.OS,
        errorMessage: error instanceof Error ? error.message : String(error ?? ""),
      },
    });
    Sentry.captureMessage("Inbox initial load failed", {
      level: "warning",
      tags: {
        feature: "inbox",
        operation: "initial-load",
        platform: Platform.OS,
        outcome: "error",
      },
      extra: {
        walletAddress: walletAddress ? `${walletAddress.slice(0, 12)}…` : null,
        errorName: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : String(error ?? ""),
      },
    });
  }, [error, isError, walletAddress]);

  useEffect(() => {
    if (!isLoading) {
      setHasInitialLoadTimedOut(false);
      hasCapturedInitialLoadTimeoutRef.current = false;
      return;
    }

    const timeoutId = setTimeout(() => {
      setHasInitialLoadTimedOut(true);
      if (hasCapturedInitialLoadTimeoutRef.current) return;
      hasCapturedInitialLoadTimeoutRef.current = true;
      Sentry.addBreadcrumb({
        category: "inbox",
        message: "Inbox initial load timed out",
        level: "warning",
        data: {
          platform: Platform.OS,
          isFetching,
          isError,
        },
      });
      Sentry.captureMessage("Inbox initial load timed out", {
        level: "warning",
        tags: {
          feature: "inbox",
          operation: "initial-load",
          platform: Platform.OS,
          outcome: "timeout",
        },
        extra: {
          walletAddress: walletAddress ? `${walletAddress.slice(0, 12)}…` : null,
          isFetching,
          isError,
          errorMessage: String(error ?? ""),
        },
      });
    }, Platform.OS === "android" ? 10_000 : 15_000);

    return () => clearTimeout(timeoutId);
  }, [error, isError, isFetching, isLoading, walletAddress]);

  const replies = useMemo(() => flattenInboxReplies(data?.pages), [data]);

  const activeNotificationId = notificationTarget?.notificationId ?? routeNotificationId;
  const arrivalNotificationId = activeNotificationId;
  const targetReplyId = notificationTarget?.replyId ?? routeReplyId;
  const previewReply = notificationTarget?.previewReply ?? null;
  const hasFetchedTargetReply = useMemo(
    () => (targetReplyId ? replies.some((item) => item.reply_id === targetReplyId) : false),
    [replies, targetReplyId],
  );
  const visibleReplies = useMemo(
    () => prependInboxPreview(replies, previewReply),
    [previewReply, replies],
  );

  useEffect(() => {
    if (activeNotificationId) {
      Sentry.addBreadcrumb({
        category: "inbox",
        message: "Inbox notification state changed",
        level: "info",
        data: {
          routeNotificationId,
          routeReplyId,
          routeOpenReply,
          activeNotificationId,
          targetReplyId,
          hasPreviewReply: !!previewReply,
          repliesCount: replies.length,
          visibleRepliesCount: visibleReplies.length,
          hasFetchedTargetReply,
        },
      });
    }
    console.log("[InboxNotifFlow] inbox state", {
      routeNotificationId,
      routeReplyId,
      routeOpenReply,
      activeNotificationId,
      targetReplyId,
      hasPreviewReply: !!previewReply,
      repliesCount: replies.length,
      visibleRepliesCount: visibleReplies.length,
      hasFetchedTargetReply,
    });
  }, [
    activeNotificationId,
    hasFetchedTargetReply,
    previewReply,
    replies.length,
    routeNotificationId,
    routeOpenReply,
    routeReplyId,
    targetReplyId,
    visibleReplies.length,
  ]);

  const confirmedNotificationArrivalsRef = useRef(new Set<string>());
  const autoOpenedNotificationRepliesRef = useRef(new Set<string>());
  useFocusEffect(
    useCallback(() => {
      if (!arrivalNotificationId) return;
      if (confirmedNotificationArrivalsRef.current.has(arrivalNotificationId)) return;
      confirmedNotificationArrivalsRef.current.add(arrivalNotificationId);
      confirmInboxNotificationNavigation(arrivalNotificationId, {
        hasTargetReply: !!targetReplyId,
        hasFetchedTargetReply,
        hasPreviewReply: !!previewReply,
        visibleReplyCount: visibleReplies.length,
        platform: Platform.OS,
      });
    }, [
      arrivalNotificationId,
      hasFetchedTargetReply,
      previewReply,
      targetReplyId,
      visibleReplies.length,
    ]),
  );

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
        const targetFetchData = {
          notificationId: activeNotificationId,
          targetReplyId,
          attempts,
          maxAttempts,
          hasFetchedTargetReply,
          hasPreviewReply: !!previewReply,
          visibleRepliesCount: visibleReplies.length,
          routeOpenReply,
          platform: Platform.OS,
        };
        if (targetReplyId) {
          Sentry.captureMessage("Inbox notification target fetch exhausted", {
            level: "warning",
            tags: {
              feature: "inbox-notifications",
              operation: "inbox-target-fetch",
            },
            extra: targetFetchData,
          });
        } else {
          Sentry.addBreadcrumb({
            category: "inbox-notifications",
            message: "Inbox notification had no reply target to fetch",
            level: "info",
            data: targetFetchData,
          });
        }
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
    previewReply,
    refetch,
    routeOpenReply,
    targetReplyId,
    visibleReplies.length,
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

  const handleItemPress = useInboxItemNavigation({
    walletAddress,
    fromNotificationRef,
    markReplyAsRead,
  });

  useEffect(() => {
    if (routeOpenReply === "0") {
      console.log("[InboxNotifFlow] inbox auto-open skipped by route flag", {
        activeNotificationId,
        targetReplyId,
      });
      Sentry.addBreadcrumb({
        category: "inbox",
        message: "Inbox auto-open skipped by route flag",
        level: "info",
        data: { activeNotificationId, targetReplyId, routeOpenReply },
      });
      return;
    }
    if (!activeNotificationId || !targetReplyId) return;
    const targetReply = visibleReplies.find((reply) => reply.reply_id === targetReplyId);
    const isActionNotification =
      targetReply?.type === "donation" ||
      targetReply?.type === "follow" ||
      targetReply?.type === "subscription_gift";
    if (targetReply && isActionNotification) {
      const autoOpenKey = `${activeNotificationId}:${targetReplyId}`;
      const autoOpenedNotificationReplies = autoOpenedNotificationRepliesRef.current;
      if (autoOpenedNotificationReplies.has(autoOpenKey)) {
        console.log("[InboxNotifFlow] inbox action notification already handled", { autoOpenKey });
        return;
      }
      autoOpenedNotificationReplies.add(autoOpenKey);
      console.log("[InboxNotifFlow] inbox action notification -> target", {
        activeNotificationId,
        targetReplyId,
        type: targetReply.type,
        replyOwner: targetReply.reply_owner,
      });
      Sentry.addBreadcrumb({
        category: "inbox-notifications",
        message: "Inbox action notification opened",
        level: "info",
        data: {
          notificationId: activeNotificationId,
          replyId: targetReply.reply_id,
          type: targetReply.type,
          replyOwner: targetReply.reply_owner,
          routeOpenReply,
          visibleRepliesCount: visibleReplies.length,
        },
      });

      let didRun = false;
      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        didRun = true;
        clearNotificationTarget(activeNotificationId);
        handleItemPress(targetReply);
      });

      return () => {
        cancelled = true;
        task.cancel();
        if (!didRun) {
          autoOpenedNotificationReplies.delete(autoOpenKey);
        }
      };
    }
    if (!targetReply || (!targetReply.reply_content?.trim() && !hasFetchedTargetReply)) {
      console.log("[InboxNotifFlow] inbox auto-open waiting for target reply", {
        activeNotificationId,
        targetReplyId,
        visibleRepliesCount: visibleReplies.length,
        hasTargetReply: !!targetReply,
        hasFetchedTargetReply,
      });
      Sentry.addBreadcrumb({
        category: "inbox",
        message: "Inbox auto-open waiting for target reply",
        level: "warning",
        data: {
          activeNotificationId,
          targetReplyId,
          visibleRepliesCount: visibleReplies.length,
          hasTargetReply: !!targetReply,
          hasFetchedTargetReply,
          hasPreviewReply: !!previewReply,
        },
      });
      return;
    }
    if (
      targetReply.type === "donation" ||
      targetReply.type === "follow" ||
      targetReply.type === "subscription_gift"
    ) {
      return;
    }

    const autoOpenKey = `${activeNotificationId}:${targetReplyId}`;
    const autoOpenedNotificationReplies = autoOpenedNotificationRepliesRef.current;
    if (autoOpenedNotificationReplies.has(autoOpenKey)) {
      console.log("[InboxNotifFlow] inbox auto-open already handled", { autoOpenKey });
      return;
    }
    autoOpenedNotificationReplies.add(autoOpenKey);
    console.log("[InboxNotifFlow] inbox auto-open -> detail", {
      activeNotificationId,
      targetReplyId,
      rootPostId: targetReply.root_post_id,
    });
    Sentry.addBreadcrumb({
      category: "inbox-notifications",
      message: "Inbox fallback auto-opening notification reply",
      level: "info",
      data: {
        notificationId: activeNotificationId,
        replyId: targetReply.reply_id,
        rootPostId: targetReply.root_post_id,
        routeOpenReply,
        visibleRepliesCount: visibleReplies.length,
        hasPreviewReply: !!previewReply,
      },
    });

    Sentry.addBreadcrumb({
      category: "inbox",
      message: "Auto-opening notification reply from inbox",
      level: "info",
      data: {
        notificationId: activeNotificationId,
        replyId: targetReply.reply_id,
        rootPostId: targetReply.root_post_id,
        type: targetReply.type ?? "reply",
      },
    });

    let didRun = false;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      didRun = true;
      clearNotificationTarget(activeNotificationId);
      handleItemPress(targetReply);
    });

    return () => {
      cancelled = true;
      task.cancel();
      if (!didRun) {
        autoOpenedNotificationReplies.delete(autoOpenKey);
      }
    };
  }, [
    activeNotificationId,
    clearNotificationTarget,
    handleItemPress,
    hasFetchedTargetReply,
    previewReply,
    routeOpenReply,
    targetReplyId,
    visibleReplies,
  ]);

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

  const handleRetry = useCallback(() => {
    Sentry.addBreadcrumb({
      category: "inbox",
      message: "Inbox error fallback retry tapped",
      level: "info",
      data: {
        platform: Platform.OS,
        hasInitialLoadTimedOut,
        isError,
      },
    });
    setHasInitialLoadTimedOut(false);
    void refetch();
  }, [hasInitialLoadTimedOut, isError, refetch]);

  return {
    listRef,
    visibleReplies,
    highlightBaselineAt,
    readReplyIdsSet,
    isLoggedIn,
    isLoading,
    isError,
    hasInitialLoadTimedOut,
    isNotificationLoading,
    isFetchingNextPage,
    isRefreshing,
    handleItemPress,
    handleMarkAllAsSeen,
    handleRefresh,
    handleEndReached,
    handleRetry,
  };
}
