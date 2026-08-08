import * as Sentry from "@sentry/react-native";
import { useFocusEffect, useIsFocused } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import { useNodeConfig, useUserFollowed } from "@/src/api";
import { ModerationReminderCard, type Post } from "@/src/components/molecules";
import {
  shouldAutoplayVideo,
  useAuthGuard,
  useEasUpdate,
  useLatestRef,
  useNetworkType,
} from "@/src/hooks";
import { buildFollowedTopicSet } from "@/src/domain/topics";
import { useRouter } from "@/src/navigation/guarded-router";
import { useScrollAnimationContext } from "@/src/providers/scroll-animation-context";
import { useSideMenu } from "@/src/providers/side-menu-provider";
import { useToast } from "@/src/providers/toast-provider";
import { markSeen } from "@/src/services/seen-posts";
import {
  storage,
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useSavedPostsStore,
  useTimeTickStore,
} from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { navigateToEditPost } from "@/src/utils/edit-post";
import { usePostActionController } from "../post/use-post-action-controller";
import type { HomeTabbedFeedRef } from "./home-tabbed-feed";
import {
  applyFollowUserOverrides,
  getHomeFeedSyncContext,
  getHomeFeedTabIndex,
  getHomeFeedType,
  getModerationReminderVisibility,
  HOME_FEED_OPTIONS,
} from "./home-screen-state";

const MODERATION_REMINDER_MIN_AGE_MS = 10 * 60 * 1000;
const MODERATION_REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type NewPostAvatar = { userId: string; username: string };

export function useHomeScreenController() {
  const router = useRouter();
  const { headerAnimatedStyle, showBars } = useScrollAnimationContext();
  const { requireAuth } = useAuthGuard();
  const { openSideMenu } = useSideMenu();
  const toast = useToast();
  const easUpdate = useEasUpdate();
  const tabbedFeedRef = useRef<HomeTabbedFeedRef>(null);
  const backgroundTimeRef = useRef<number | null>(null);
  const revealedPostsRef = useRef<Set<string>>(new Set());
  const isNavigatingRef = useRef(false);
  const moderationReminderShownForRef = useRef<string | null>(null);

  const [feedTabIndex, setFeedTabIndex] = useState(0);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<NewPostAvatar[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);
  const [isBannerLoading, setIsBannerLoading] = useState(false);
  const [followUserOverrides, setFollowUserOverrides] = useState<Record<string, boolean>>({});
  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const savedPosts = useSavedPostsStore((state) => state.savedPosts);
  const hiddenPostIds = useContentModerationStore((state) => state.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((state) => state.blockedUserIds);
  const hidePost = useContentModerationStore((state) => state.hidePost);
  const unhidePost = useContentModerationStore((state) => state.unhidePost);
  const blockUser = useContentModerationStore((state) => state.blockUser);
  const blockTopicOptimistic = useContentModerationStore((state) => state.blockTopic);
  const hasSeenAdultPrompt = usePreferencesStore((state) => state.hasSeenAdultPrompt);
  const setHasSeenAdultPrompt = usePreferencesStore((state) => state.setHasSeenAdultPrompt);
  const adultPromptDismissedAt = usePreferencesStore((state) => state.adultPromptDismissedAt);
  const setAdultPromptDismissedAt = usePreferencesStore((state) => state.setAdultPromptDismissedAt);
  const reminderUnderstoodByUser = usePreferencesStore(
    (state) => state.moderationReminderUnderstoodByUser,
  );
  const reminderSnoozedUntilByUser = usePreferencesStore(
    (state) => state.moderationReminderSnoozedUntilByUser,
  );
  const dismissModerationReminder = usePreferencesStore(
    (state) => state.dismissModerationReminder,
  );
  const snoozeModerationReminder = usePreferencesStore(
    (state) => state.snoozeModerationReminder,
  );
  const setAdultContent = usePreferencesStore((state) => state.setAdultContent);
  const shareServer = usePreferencesStore((state) => state.apiServer);
  const autoPlayVideos = usePreferencesStore((state) => state.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((state) => state.videoAutoplayNetwork);
  const currentUser = useAuthStore((state) => state.user);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const timeTick = useTimeTickStore((state) => state.tick);
  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);
  const shouldScrollToTop = useHomePostCardStore((state) => state.shouldScrollToTop);
  const clearScrollToTop = useHomePostCardStore((state) => state.clearScrollToTop);
  const sideMenuOpen = useHomePostCardStore((state) => state.sideMenuOpen);

  void hiddenPostIds;
  void blockedUserIds;
  void timeTick;

  const { data: nodeConfig } = useNodeConfig();
  const { data: followedData } = useUserFollowed();
  const networkType = useNetworkType();
  const isHomeFocused = useIsFocused();
  const followedUsers = useMemo(() => followedData?.followed_users ?? [], [followedData]);
  const followedTopics = useMemo(() => followedData?.followed_topics ?? [], [followedData]);
  const displayFollowedUsers = useMemo(
    () => applyFollowUserOverrides(followedUsers, followUserOverrides),
    [followedUsers, followUserOverrides],
  );
  const followedUsersSet = useMemo(() => new Set(followedUsers), [followedUsers]);
  const followedTopicsSet = useMemo(
    () => buildFollowedTopicSet(followedTopics),
    [followedTopics],
  );
  const savedPostIds = useMemo(
    () => new Set(savedPosts.map((post) => post.id)),
    [savedPosts],
  );
  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, networkType, videoAutoplayNetwork],
  );
  const currentFeedSyncContext = getHomeFeedSyncContext(feedTabIndex);

  const setFollowUserOverride = useCallback((userId: string, isFollowing: boolean) => {
    setFollowUserOverrides((current) => ({ ...current, [userId]: isFollowing }));
  }, []);
  const clearFollowUserOverride = useCallback((userId: string) => {
    setFollowUserOverrides((current) => {
      const { [userId]: _, ...rest } = current;
      return rest;
    });
  }, []);

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
    onVoteRollback: useCallback((targetId) => clearVoteOverride(targetId), [clearVoteOverride]),
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
    openOptions,
    followUser,
    followTopic,
    upvote,
    downvote,
    blockUser: blockUserFromCard,
    blockPost,
    blockTopic,
    report,
  } = postActions.cardActions;

  const handlePostPress = useCallback((postId: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => { isNavigatingRef.current = false; }, 500);
    markSeen(postId, "open");
    const params = new URLSearchParams({ syncContext: currentFeedSyncContext });
    if (revealedPostsRef.current.has(postId)) params.set("reveal", "true");
    router.push(`/post/${postId}?${params.toString()}`);
  }, [currentFeedSyncContext, router]);
  const handleAuthorPress = useCallback(
    (authorId: string) => router.push(`/user/${authorId}`),
    [router],
  );
  const handleTopicPress = useCallback(
    (topic: string) => router.push(`/topic/${encodeURIComponent(topic)}`),
    [router],
  );
  const handleMorePress = useCallback(
    (post: Post) => requireAuth(() => openOptions(post)),
    [openOptions, requireAuth],
  );
  const handleCommentPress = useCallback((postId: string) => {
    markSeen(postId, "open");
    router.push(`/post/${postId}?syncContext=${encodeURIComponent(currentFeedSyncContext)}`);
  }, [currentFeedSyncContext, router]);
  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((current) => {
      const next = new Set(current);
      next.add(postId);
      revealedPostsRef.current = next;
      return next;
    });
  }, []);
  const guardedFollowUser = useCallback(
    (authorId: string, username: string, isFollowing: boolean) =>
      requireAuth(() => followUser(authorId, username, isFollowing)),
    [followUser, requireAuth],
  );
  const guardedFollowTopic = useCallback(
    (topic: string, isFollowed: boolean) => requireAuth(() => followTopic(topic, isFollowed)),
    [followTopic, requireAuth],
  );
  const guardedUpvote = useCallback(
    (postId: string, liked: boolean, disliked: boolean, likes: number) =>
      requireAuth(() => upvote(postId, liked, disliked, likes)),
    [requireAuth, upvote],
  );
  const guardedDownvote = useCallback(
    (postId: string, liked: boolean, disliked: boolean, likes: number) =>
      requireAuth(() => downvote(postId, liked, disliked, likes)),
    [downvote, requireAuth],
  );

  const handlersRef = useLatestRef({
    handlePostPress,
    handleAuthorPress,
    handleTopicPress,
    handleMorePress,
    guardedUpvote,
    guardedDownvote,
    handleCommentPress,
    guardedFollowUser,
    guardedFollowTopic,
    handleRevealContent,
    blockUserFromCard,
    blockPost,
    blockTopic,
    report,
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
        handlersRef.current.guardedUpvote(postId, liked, disliked, likes),
      onDislikePress: (postId: string, liked: boolean, disliked: boolean, likes: number) =>
        handlersRef.current.guardedDownvote(postId, liked, disliked, likes),
      onCommentPress: (postId: string) => handlersRef.current.handleCommentPress(postId),
      onFollowUser: (authorId: string, username: string, isFollowing: boolean) =>
        handlersRef.current.guardedFollowUser(authorId, username, isFollowing),
      onFollowTopic: (topic: string, isFollowed: boolean) =>
        handlersRef.current.guardedFollowTopic(topic, isFollowed),
      onRevealContent: (postId: string) => handlersRef.current.handleRevealContent(postId),
      onBlockUser: (postId: string, authorId: string, username: string) =>
        handlersRef.current.blockUserFromCard(postId, authorId, username),
      onBlockPost: (postId: string) => handlersRef.current.blockPost(postId),
      onBlockTopic: (postId: string, topic: string) =>
        handlersRef.current.blockTopic(postId, topic),
      onReport: (postId: string) => handlersRef.current.report(postId),
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

  const showAdultPopup = Boolean(currentUser) && !hasSeenAdultPrompt;
  const currentUserId = currentUser?.id ?? "";
  // Lowercased lookups match the store's normalized keys (BUG-016).
  const reminderUserKey = currentUserId.toLowerCase();
  const reminderUnderstood = reminderUserKey
    ? reminderUnderstoodByUser[reminderUserKey] === true
    : false;
  const reminderSnoozedUntil = reminderUserKey
    ? reminderSnoozedUntilByUser[reminderUserKey] ?? 0
    : 0;
  const nowMs = Date.now();
  const adultPromptAgeMs = adultPromptDismissedAt > 0 ? nowMs - adultPromptDismissedAt : 0;
  const showModerationReminder = getModerationReminderVisibility({
    currentUserId,
    hasSeenAdultPrompt,
    showAdultPopup,
    adultPromptDismissedAt,
    moderationReminderUnderstood: reminderUnderstood,
    moderationReminderSnoozedUntil: reminderSnoozedUntil,
    nowMs,
    minimumAgeMs: MODERATION_REMINDER_MIN_AGE_MS,
  });

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
        setTimeout(() => tabbedFeedRef.current?.checkNewPosts(), 500);
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [showBars]);

  useEffect(() => {
    if (useHomePostCardStore.getState().skipNextRefresh) {
      useHomePostCardStore.getState().setSkipNextRefresh(false);
      setFeedTabIndex(1);
    }
    showBars();
    const wasBackgrounded = storage.getString("app_was_backgrounded");
    storage.remove("app_was_backgrounded");
    if (!wasBackgrounded) return;
    const timer = setTimeout(() => tabbedFeedRef.current?.checkNewPosts(), 300);
    return () => clearTimeout(timer);
  }, [showBars]);

  useEffect(() => {
    if (!currentUser || !hasSeenAdultPrompt || showAdultPopup || adultPromptDismissedAt > 0) return;
    const dismissedAt = Date.now();
    setAdultPromptDismissedAt(dismissedAt);
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Adult prompt dismissal timestamp backfilled",
      level: "info",
      data: { userId: currentUser.id, dismissedAt },
    });
  }, [
    adultPromptDismissedAt,
    currentUser,
    hasSeenAdultPrompt,
    setAdultPromptDismissedAt,
    showAdultPopup,
  ]);

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
        snoozedUntil: reminderSnoozedUntil,
      },
    });
  }, [adultPromptAgeMs, currentUserId, reminderSnoozedUntil, showModerationReminder]);

  useEffect(() => {
    if (!shouldScrollToTop || !isHomeFocused) return;
    const delay = Platform.OS === "android" ? 150 : 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const scroll = () => tabbedFeedRef.current?.scrollToTop(undefined, { animated: false });
    timers.push(setTimeout(scroll, delay));
    timers.push(setTimeout(scroll, delay + 120));
    timers.push(setTimeout(() => {
      scroll();
      clearScrollToTop();
    }, delay + 350));
    return () => timers.forEach(clearTimeout);
  }, [clearScrollToTop, isHomeFocused, shouldScrollToTop]);

  useFocusEffect(useCallback(() => {
    useTimeTickStore.getState().bump();
  }, []));

  const handleFeedTypeChange = useCallback((value: string) => {
    setFeedTabIndex(getHomeFeedTabIndex(value));
  }, []);
  const handleNewPostsChange = useCallback((
    hasNew: boolean,
    avatars: NewPostAvatar[],
    count: number,
  ) => {
    setHasNewPosts(hasNew);
    setNewPostAvatars(avatars);
    setNewPostCount(count);
  }, []);
  const handleNewPostsPress = useCallback(async () => {
    setIsBannerLoading(true);
    try {
      await tabbedFeedRef.current?.handleNewPostsPress();
      setHasNewPosts(false);
    } finally {
      setIsBannerLoading(false);
    }
  }, []);
  const chooseModerationAgents = useCallback(() => {
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
  const dismissReminder = useCallback(() => {
    if (!currentUserId) return;
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Moderation reminder dismissed",
      level: "info",
      data: { userId: currentUserId },
    });
    dismissModerationReminder(currentUserId);
  }, [currentUserId, dismissModerationReminder]);
  const snoozeReminder = useCallback(() => {
    if (!currentUserId) return;
    const snoozedUntil = Date.now() + MODERATION_REMINDER_SNOOZE_MS;
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Moderation reminder snoozed",
      level: "info",
      data: { userId: currentUserId, snoozedUntil },
    });
    snoozeModerationReminder(currentUserId, snoozedUntil);
  }, [currentUserId, snoozeModerationReminder]);
  const moderationReminderHeader = useMemo(() => {
    if (!showModerationReminder) return null;
    return (
      <ModerationReminderCard
        onChooseAgents={chooseModerationAgents}
        onUnderstand={dismissReminder}
        onRemindLater={snoozeReminder}
      />
    );
  }, [chooseModerationAgents, dismissReminder, showModerationReminder, snoozeReminder]);

  const updateAdultPreference = useCallback((enabled: boolean) => {
    const dismissedAt = Date.now();
    setAdultContent(enabled);
    setHasSeenAdultPrompt();
    setAdultPromptDismissedAt(dismissedAt);
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: enabled
        ? "iOS: Adult content enabled via popup"
        : "iOS: Adult content declined via popup",
      level: "info",
    });
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Adult prompt dismissed before reminder timer",
      level: "info",
      data: {
        action: enabled ? "enabled_adult_content" : "declined_adult_content",
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

  return {
    showLoggedOutHome: !isLoggedIn && !isInitializing && !(nodeConfig?.open_browsing_enabled ?? false),
    feedRuntimeConfig,
    tabbedFeedRef,
    shareServer,
    headerAnimatedStyle,
    feedTabIndex,
    feedType: getHomeFeedType(feedTabIndex),
    feedOptions: HOME_FEED_OPTIONS,
    handleFeedTypeChange,
    openSideMenu,
    openSearch: () => router.push("/search"),
    showModerationReminder,
    moderationReminderHeader,
    handleNewPostsChange,
    // Hide the banner whenever this screen isn't focused (e.g. a post detail
    // is open above the feed) so it can't render over or steal taps from
    // other screens (BUG-035).
    hasNewPosts: hasNewPosts && isHomeFocused,
    handleNewPostsPress,
    newPostAvatars,
    newPostCount,
    isBannerLoading,
    easUpdate,
    showAdultPopup,
    enableAdultContent: () => updateAdultPreference(true),
    declineAdultContent: () => updateAdultPreference(false),
    openSettings: () => router.push("/settings"),
    postActions,
  };
}
