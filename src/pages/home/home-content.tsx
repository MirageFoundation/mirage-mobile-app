import { navigateToEditPost } from "@/src/utils/edit-post";
import { markSeen } from "@/src/services/seen-posts";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, View, type AppStateStatus } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import {
  useNodeConfig,
  useUserFollowed,
} from "@/src/api";

import {
AdultContentPopup,
FeedHeader,
ModerationReminderCard,
NewPostsButton,
type Post,
UpdateBanner,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { useSideMenu } from "@/src/providers/side-menu-provider";
import { storage } from "@/src/stores";
import {
  useAuthGuard,
  useEasUpdate,
  useNetworkType,
  shouldAutoplayVideo,
  useLatestRef,
} from "@/src/hooks";
import {
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { HEADER_HEIGHT } from "@/src/providers/scroll-animation-context";
import { useToast } from "@/src/providers/toast-provider";
import { HomeTabbedFeed, type HomeTabbedFeedRef } from "./home-tabbed-feed";
import { FeedPostCardRuntimeProvider } from "./feed-post-card-runtime";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useSavedPostsStore,
  useTimeTickStore,
} from "@/src/stores";
import { LoggedOutHome } from "../logged-out-home";
import { PostActionOverlays } from "../post/post-action-overlays";
import { usePostActionController } from "../post/use-post-action-controller";
import { styles } from "./home-styles";

const MODERATION_REMINDER_MIN_AGE_MS = 10 * 60 * 1000;
const MODERATION_REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function HomeScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    headerAnimatedStyle,
    showBars,
  } = useScrollAnimationContext();
  const { requireAuth } = useAuthGuard();
  const toast = useToast();
  const easUpdate = useEasUpdate();


  const backgroundTimeRef = useRef<number | null>(null);
  const [isFeedRefreshing, setIsFeedRefreshing] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<{ userId: string; username: string }[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);

  const handleRefreshingChange = useCallback((refreshing: boolean) => {
    setIsFeedRefreshing(refreshing);
  }, []);

  const handleNewPostsChange = useCallback((hasNew: boolean, avatars: { userId: string; username: string }[], count: number) => {
    setHasNewPosts(hasNew);
    setNewPostAvatars(avatars);
    setNewPostCount(count);
  }, []);

  const [isBannerLoading, setIsBannerLoading] = useState(false);

  const handleNewPostsPress = useCallback(async () => {
    setIsBannerLoading(true);
    await tabbedFeedRef.current?.handleNewPostsPress();
    setIsBannerLoading(false);
    setHasNewPosts(false);
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        if (!backgroundTimeRef.current) {
          backgroundTimeRef.current = Date.now();
          storage.set("app_was_backgrounded", "true");
          storage.set("app_last_foreground_time", Date.now().toString());
        }
        return;
      }
      if (nextState === "active" && backgroundTimeRef.current) {
        backgroundTimeRef.current = null;
        storage.remove("app_was_backgrounded");
        useTimeTickStore.getState().bump();
        setTimeout(() => {
          tabbedFeedRef.current?.checkNewPosts();
        }, 500);
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [showBars]);

  const tabbedFeedRef = useRef<HomeTabbedFeedRef>(null);

  useEffect(() => {
    const switchToLatest = useHomePostCardStore.getState().skipNextRefresh;
    if (switchToLatest) {
      useHomePostCardStore.getState().setSkipNextRefresh(false);
      setFeedTabIndex(1);
    }
    showBars();
    const wasBackgrounded = storage.getString("app_was_backgrounded");
    storage.remove("app_was_backgrounded");
    if (wasBackgrounded) {
      const timer = setTimeout(() => {
        tabbedFeedRef.current?.checkNewPosts();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showBars]);

  const { openSideMenu } = useSideMenu();

  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const [feedTabIndex, setFeedTabIndex] = useState(0);

  const FEED_OPTIONS = useMemo(() => [
    { label: "Magic", value: "magic" },
    { label: "Latest", value: "latest" },
  ], []);

  const handleFeedTypeChange = useCallback((value: string) => {
    setFeedTabIndex(value === "magic" ? 0 : 1);
  }, []);

  const currentFeedSyncContext = feedTabIndex === 0 ? "home:magic" : "home:latest";

  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);
  const hidePost = useContentModerationStore((s) => s.hidePost);
  const unhidePost = useContentModerationStore((s) => s.unhidePost);
  const blockUser = useContentModerationStore((s) => s.blockUser);
  const blockTopicOptimistic = useContentModerationStore((s) => s.blockTopic);

  const hasSeenAdultPrompt = usePreferencesStore((s) => s.hasSeenAdultPrompt);
  const setHasSeenAdultPrompt = usePreferencesStore(
    (s) => s.setHasSeenAdultPrompt
  );
  const adultPromptDismissedAt = usePreferencesStore(
    (s) => s.adultPromptDismissedAt
  );
  const setAdultPromptDismissedAt = usePreferencesStore(
    (s) => s.setAdultPromptDismissedAt
  );
  const moderationReminderUnderstoodByUser = usePreferencesStore(
    (s) => s.moderationReminderUnderstoodByUser
  );
  const moderationReminderSnoozedUntilByUser = usePreferencesStore(
    (s) => s.moderationReminderSnoozedUntilByUser
  );
  const dismissModerationReminder = usePreferencesStore(
    (s) => s.dismissModerationReminder
  );
  const snoozeModerationReminder = usePreferencesStore(
    (s) => s.snoozeModerationReminder
  );
  const setAdultContent = usePreferencesStore((s) => s.setAdultContent);
  const shareServer = usePreferencesStore((s) => s.apiServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((s) => s.videoAutoplayNetwork);
  const currentUser = useAuthStore((s) => s.user);
  const timeTick = useTimeTickStore((s) => s.tick);

  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: nodeConfig } = useNodeConfig();
  const openBrowsingEnabled = nodeConfig?.open_browsing_enabled ?? false;

  const networkType = useNetworkType();

  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData]
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData]
  );
  const [followUserOverrides, setFollowUserOverrides] = useState<Record<string, boolean>>({});
  const setFollowUserOverride = useCallback((userId: string, isFollowing: boolean) => {
    setFollowUserOverrides((current) => ({ ...current, [userId]: isFollowing }));
  }, []);
  const clearFollowUserOverride = useCallback((userId: string) => {
    setFollowUserOverrides((current) => {
      const { [userId]: _, ...rest } = current;
      return rest;
    });
  }, []);
  const displayFollowedUsers = useMemo(() => {
    const overrides = Object.entries(followUserOverrides);
    if (overrides.length === 0) return followedUsers;

    const next = new Set(followedUsers);
    overrides.forEach(([userId, isFollowing]) => {
      if (isFollowing) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
    });
    return Array.from(next);
  }, [followedUsers, followUserOverrides]);

  const showAdultPopup = !!currentUser && !hasSeenAdultPrompt;
  const moderationReminderShownForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUser || !hasSeenAdultPrompt || showAdultPopup) return;
    if (adultPromptDismissedAt > 0) return;
    const dismissedAt = Date.now();
    setAdultPromptDismissedAt(dismissedAt);
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Adult prompt dismissal timestamp backfilled",
      level: "info",
      data: {
        userId: currentUser.id,
        dismissedAt,
      },
    });
  }, [
    adultPromptDismissedAt,
    currentUser,
    hasSeenAdultPrompt,
    setAdultPromptDismissedAt,
    showAdultPopup,
  ]);

  const currentUserId = currentUser?.id ?? "";
  const moderationReminderUnderstood = currentUserId
    ? moderationReminderUnderstoodByUser[currentUserId] === true
    : false;
  const moderationReminderSnoozedUntil = currentUserId
    ? moderationReminderSnoozedUntilByUser[currentUserId] ?? 0
    : 0;
  void timeTick;
  const nowMs = Date.now();
  const adultPromptAgeMs = adultPromptDismissedAt > 0
    ? nowMs - adultPromptDismissedAt
    : 0;
  const showModerationReminder = !!currentUserId
    && hasSeenAdultPrompt
    && !showAdultPopup
    && adultPromptDismissedAt > 0
    && adultPromptAgeMs >= MODERATION_REMINDER_MIN_AGE_MS
    && !moderationReminderUnderstood
    && moderationReminderSnoozedUntil <= nowMs;

  useEffect(() => {
    if (!showModerationReminder || !currentUserId) {
      moderationReminderShownForRef.current = null;
      return;
    }

    if (moderationReminderShownForRef.current === currentUserId) return;
    moderationReminderShownForRef.current = currentUserId;

    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Moderation reminder shown",
      level: "info",
      data: {
        userId: currentUserId,
        adultPromptAgeMs,
        snoozedUntil: moderationReminderSnoozedUntil,
      },
    });
  }, [
    adultPromptAgeMs,
    currentUserId,
    moderationReminderSnoozedUntil,
    showModerationReminder,
  ]);

  const handleChooseModerationAgents = useCallback(() => {
    if (!currentUserId) return;
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Choose agents pressed",
      level: "info",
      data: { userId: currentUserId },
    });
    dismissModerationReminder(currentUserId);
    router.push("/agents");
  }, [currentUserId, dismissModerationReminder, router]);

  const handleDismissModerationReminder = useCallback(() => {
    if (!currentUserId) return;
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Moderation reminder dismissed",
      level: "info",
      data: { userId: currentUserId },
    });
    dismissModerationReminder(currentUserId);
  }, [currentUserId, dismissModerationReminder]);

  const handleSnoozeModerationReminder = useCallback(() => {
    if (!currentUserId) return;
    const snoozedUntil = Date.now() + MODERATION_REMINDER_SNOOZE_MS;
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Moderation reminder snoozed",
      level: "info",
      data: {
        userId: currentUserId,
        snoozedUntil,
      },
    });
    snoozeModerationReminder(
      currentUserId,
      snoozedUntil
    );
  }, [currentUserId, snoozeModerationReminder]);

  const moderationReminderHeader = useMemo(() => {
    if (!showModerationReminder) return null;
    return (
      <ModerationReminderCard
        onChooseAgents={handleChooseModerationAgents}
        onUnderstand={handleDismissModerationReminder}
        onRemindLater={handleSnoozeModerationReminder}
      />
    );
  }, [
    handleChooseModerationAgents,
    handleDismissModerationReminder,
    handleSnoozeModerationReminder,
    showModerationReminder,
  ]);

  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);
  const shouldScrollToTop = useHomePostCardStore((state) => state.shouldScrollToTop);
  const clearScrollToTop = useHomePostCardStore((state) => state.clearScrollToTop);
  const sideMenuOpen = useHomePostCardStore((state) => state.sideMenuOpen);

  const savedPostIds = useMemo(
    () => new Set(savedPosts.map((post) => post.id)),
    [savedPosts],
  );
  const postActions = usePostActionController({
    currentUserId: currentUser?.id,
    followedUsers: displayFollowedUsers,
    followedTopics,
    savedPostIds,
    onFollowUserOptimistic: setFollowUserOverride,
    onFollowUserRollback: clearFollowUserOverride,
    onVoteOptimistic: useCallback((targetId, result) => {
      markSeen(targetId, "vote");
      setVoteOverride(targetId, {
        hasLiked: result.hasLiked,
        hasDisliked: result.hasDisliked,
        likes: result.newLikes,
      });
    }, [setVoteOverride]),
    onVoteRollback: useCallback((targetId) => {
      clearVoteOverride(targetId);
    }, [clearVoteOverride]),
    onBlockConfirmed: useCallback((pending) => {
      if (pending.type === "user") blockUser(pending.id);
      else if (pending.type === "post") hidePost(pending.id);
      else if (pending.type === "topic") {
        blockTopicOptimistic(pending.id);
        showBars();
      }
    }, [blockTopicOptimistic, blockUser, hidePost, showBars]),
    onDeleteConfirmed: hidePost,
    onDeleteRollback: unhidePost,
    onReportSubmitted: hidePost,
    onEditPost: useCallback((post) => navigateToEditPost(router, post), [router]),
    onToggleSave: useCallback(
      (post) => useSavedPostsStore.getState().toggleSavePost(post),
      [],
    ),
    onSaveChanged: useCallback((saved) => {
      toast.success(
        saved ? "Post saved" : "Post unsaved",
        saved ? "You can find it in your saved items." : "Removed from saved items.",
      );
    }, [toast]),
    onCopyText: useCallback(() => {
      toast.success("Copied", "Text copied to clipboard.");
    }, [toast]),
    onShowFewer: useCallback((post) => {
      console.log("Show fewer posts like:", post?.id);
      toast.success("Got it", "We'll show fewer posts like this.");
    }, [toast]),
  });
  const {
    openOptions: openPostOptions,
    followUser: handleFollowPress,
    followTopic: handleFollowTopicFromCard,
    upvote: handleUpvote,
    downvote: handleDownvote,
    blockUser: handleBlockUserFromCard,
    blockPost: handleBlockPostFromCard,
    blockTopic: handleBlockTopicFromCard,
    report: handleReportFromCard,
  } = postActions.cardActions;
  const handleGuardedFollowPress = useCallback(
    (authorId: string, username: string, isFollowing: boolean) => {
      requireAuth(() => handleFollowPress(authorId, username, isFollowing));
    },
    [handleFollowPress, requireAuth],
  );
  const handleGuardedFollowTopicFromCard = useCallback(
    (topic: string, isFollowed: boolean) => {
      requireAuth(() => handleFollowTopicFromCard(topic, isFollowed));
    },
    [handleFollowTopicFromCard, requireAuth],
  );
  const handleGuardedUpvote = useCallback(
    (postId: string, liked: boolean, disliked: boolean, likes: number) => {
      requireAuth(() => handleUpvote(postId, liked, disliked, likes));
    },
    [handleUpvote, requireAuth],
  );
  const handleGuardedDownvote = useCallback(
    (postId: string, liked: boolean, disliked: boolean, likes: number) => {
      requireAuth(() => handleDownvote(postId, liked, disliked, likes));
    },
    [handleDownvote, requireAuth],
  );

  const handleEnableAdultContent = useCallback(() => {
    const dismissedAt = Date.now();
    setAdultContent(true);
    setHasSeenAdultPrompt();
    setAdultPromptDismissedAt(dismissedAt);
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: "iOS: Adult content enabled via popup",
      level: "info",
    });
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Adult prompt dismissed before reminder timer",
      level: "info",
      data: {
        action: "enabled_adult_content",
        userId: currentUserId,
        dismissedAt,
      },
    });
  }, [
    currentUserId,
    setAdultContent,
    setAdultPromptDismissedAt,
    setHasSeenAdultPrompt,
  ]);

  const handleDeclineAdultContent = useCallback(() => {
    const dismissedAt = Date.now();
    setAdultContent(false);
    setHasSeenAdultPrompt();
    setAdultPromptDismissedAt(dismissedAt);
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: "iOS: Adult content declined via popup",
      level: "info",
    });
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Adult prompt dismissed before reminder timer",
      level: "info",
      data: {
        action: "declined_adult_content",
        userId: currentUserId,
        dismissedAt,
      },
    });
  }, [
    currentUserId,
    setAdultContent,
    setAdultPromptDismissedAt,
    setHasSeenAdultPrompt,
  ]);

  const revealedPostsRef = useRef<Set<string>>(new Set());
  const isNavigatingRef = useRef(false);

  const handlePostPress = useCallback(
    (postId: string) => {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      setTimeout(() => { isNavigatingRef.current = false; }, 500);
      markSeen(postId, "open");
      const isRevealed = revealedPostsRef.current.has(postId);
      const params = new URLSearchParams({ syncContext: currentFeedSyncContext });
      if (isRevealed) {
        params.set("reveal", "true");
      }
      router.push(`/post/${postId}?${params.toString()}`);
    },
    [currentFeedSyncContext, router]
  );

  const handleAuthorPress = useCallback((authorId: string) => {
    router.push(`/user/${authorId}`);
  }, [router]);

  const handleTopicPress = useCallback((topic: string) => {
    router.push(`/topic/${encodeURIComponent(topic)}`);
  }, [router]);

  const handleMorePress = useCallback((post: Post) => {
    requireAuth(() => {
      openPostOptions(post);
    });
  }, [openPostOptions, requireAuth]);

  const handleCommentPress = useCallback(
    (postId: string) => {
      markSeen(postId, "open");
      router.push(`/post/${postId}?syncContext=${encodeURIComponent(currentFeedSyncContext)}`);
    },
    [currentFeedSyncContext, router]
  );

  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((prev) => {
      const newSet = new Set(prev);
      newSet.add(postId);
      revealedPostsRef.current = newSet;
      return newSet;
    });
  }, []);

  const isHomeFocused = useIsFocused();
  useEffect(() => {
    if (!shouldScrollToTop) return;
    // Wait until the Home tab is actually focused before scrolling.
    // On Android, scroll commands issued to an unfocused FlashList are dropped,
    // so scrolling before the tab becomes visible (e.g. right after creating a
    // post from the Create tab) never took effect.
    if (!isHomeFocused) return;
    // FlashList sometimes shows a blank viewport when the screen becomes
    // focused after a tab change (e.g. returning to Home after creating a
    // post). Issuing scrollToTop at several beats — including after a
    // longer delay — forces the list to re-render its cells without
    // requiring the user to touch the screen.
    const delay = Platform.OS === "android" ? 150 : 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const runScroll = () => {
      tabbedFeedRef.current?.scrollToTop(undefined, { animated: false });
    };
    timers.push(setTimeout(runScroll, delay));
    timers.push(setTimeout(runScroll, delay + 120));
    timers.push(setTimeout(() => {
      runScroll();
      clearScrollToTop();
    }, delay + 350));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [shouldScrollToTop, isHomeFocused, clearScrollToTop]);

  const followedUsersSet = useMemo(() => new Set(followedUsers), [followedUsers]);
  const followedTopicsSet = useMemo(() => new Set(followedTopics), [followedTopics]);

  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType]
  );

  useFocusEffect(
    useCallback(() => {
      useTimeTickStore.getState().bump();
    }, []),
  );

  const handlersRef = useLatestRef({
    handlePostPress,
    handleAuthorPress,
    handleTopicPress,
    handleMorePress,
    handleGuardedUpvote,
    handleGuardedDownvote,
    handleCommentPress,
    handleGuardedFollowPress,
    handleGuardedFollowTopicFromCard,
    handleRevealContent,
    handleBlockUserFromCard,
    handleBlockPostFromCard,
    handleBlockTopicFromCard,
    handleReportFromCard,
  });

  const feedRuntimeConfig = useMemo(() => ({
    currentUserId: currentUser?.id,
    followedUsers: followedUsersSet,
    followedTopics: followedTopicsSet,
    followUserOverrides,
    revealedPosts,
    shareServer,
    allowAutoplay,
    active: isHomeFocused && !sideMenuOpen,
    handlers: {
      onPostPress: (postId: string) => handlersRef.current.handlePostPress(postId),
      onAuthorPress: (authorId: string) => handlersRef.current.handleAuthorPress(authorId),
      onTopicPress: (topic: string) => handlersRef.current.handleTopicPress(topic),
      onMorePress: (post: Post) => handlersRef.current.handleMorePress(post),
      onLikePress: (postId: string, liked: boolean, disliked: boolean, likes: number) =>
        handlersRef.current.handleGuardedUpvote(postId, liked, disliked, likes),
      onDislikePress: (postId: string, liked: boolean, disliked: boolean, likes: number) =>
        handlersRef.current.handleGuardedDownvote(postId, liked, disliked, likes),
      onCommentPress: (postId: string) => handlersRef.current.handleCommentPress(postId),
      onFollowUser: (authorId: string, username: string, isFollowing: boolean) =>
        handlersRef.current.handleGuardedFollowPress(authorId, username, isFollowing),
      onFollowTopic: (topic: string, isFollowed: boolean) =>
        handlersRef.current.handleGuardedFollowTopicFromCard(topic, isFollowed),
      onRevealContent: (postId: string) => handlersRef.current.handleRevealContent(postId),
      onBlockUser: (postId: string, authorId: string, username: string) =>
        handlersRef.current.handleBlockUserFromCard(postId, authorId, username),
      onBlockPost: (postId: string) => handlersRef.current.handleBlockPostFromCard(postId),
      onBlockTopic: (postId: string, topic: string) =>
        handlersRef.current.handleBlockTopicFromCard(postId, topic),
      onReport: (postId: string) => handlersRef.current.handleReportFromCard(postId),
    },
  }), [
    allowAutoplay,
    currentUser?.id,
    followedTopicsSet,
    followedUsersSet,
    followUserOverrides,
    handlersRef,
    isHomeFocused,
    revealedPosts,
    shareServer,
    sideMenuOpen,
  ]);

  if (!isLoggedIn && !isInitializing && !openBrowsingEnabled) {
    return <LoggedOutHome />;
  }

  return (
    <FeedPostCardRuntimeProvider config={feedRuntimeConfig}>
    <Box flex background="base">
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      <FeedHeader
        title="Mirage"
        onMenuPress={openSideMenu}
        onSearchPress={() => router.push("/search")}
        animatedStyle={headerAnimatedStyle}
        feedType={feedTabIndex === 0 ? "magic" : "latest"}
        feedOptions={FEED_OPTIONS}
        onFeedTypeChange={handleFeedTypeChange}
        borderBottomColor={
          showModerationReminder
            ? `${theme.colors.error[500]}40`
            : undefined
        }
      />

      <HomeTabbedFeed
        ref={tabbedFeedRef}
        key={shareServer}
        feedType="home"
        activeTabIndex={feedTabIndex}
        ListHeaderExtra={moderationReminderHeader}
        onNewPostsChange={handleNewPostsChange}
      />

      <NewPostsButton
        visible={hasNewPosts}
        onPress={handleNewPostsPress}
        topOffset={insets.top + 44}
        avatars={newPostAvatars}
        newPostCount={newPostCount}
        loading={isBannerLoading}
      />

      <UpdateBanner
        status={easUpdate.status}
        onInstall={easUpdate.install}
        onDismiss={easUpdate.dismiss}
      />

      <AdultContentPopup
        visible={showAdultPopup}
        onEnable={handleEnableAdultContent}
        onDecline={handleDeclineAdultContent}
        onGoToSettings={() => router.push("/settings")}
      />

      <PostActionOverlays controller={postActions} />
    </Box>
    </FeedPostCardRuntimeProvider>
  );
}
