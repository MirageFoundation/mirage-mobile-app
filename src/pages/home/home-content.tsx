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
ConfirmationPopup,
FeedHeader,
ModerationReminderCard,
NewPostsButton,
type Post,
 PostOptionsSheet,
 type PostOptionsSheetRef,
 AwardPickerSheet,
 type AwardPickerSheetRef,
 GiftMirageSheet,
 type GiftMirageSheetRef,
 GiftSubscriptionSheet,
 type GiftSubscriptionSheetRef,
 ReportSheet,
 type ReportSheetRef,
UpdateBanner,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { useSideMenu } from "@/src/providers/side-menu-provider";
import { storage } from "@/src/stores";
import {
  useAuthGuard,
  useBlockHandler,
  getBlockConfirmationMessage,
  useDeleteHandler,
  useEasUpdate,
  useFollowHandler,
  useNetworkType,
  useReportHandler,
  useVoteHandler,
  shouldAutoplayVideo,
  useLatestRef,
  type VoteResult,
} from "@/src/hooks";
import {
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { HEADER_HEIGHT } from "@/src/providers/scroll-animation-context";
import { useToast } from "@/src/providers/toast-provider";
import { HomeTabbedFeed, type HomeTabbedFeedRef } from "./home-tabbed-feed";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useSavedPostsStore,
  useTimeTickStore,
} from "@/src/stores";
import { LoggedOutHome } from "../logged-out-home";
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

  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const awardPickerSheetRef = useRef<AwardPickerSheetRef>(null);
  const giftMirageSheetRef = useRef<GiftMirageSheetRef>(null);
  const giftSubscriptionSheetRef = useRef<GiftSubscriptionSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);

  const { openSideMenu } = useSideMenu();

  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
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
  const followUserOverrides = useHomePostCardStore((state) => state.followUserOverrides);
  const setFollowUserOverride = useHomePostCardStore((state) => state.setFollowUserOverride);
  const clearFollowUserOverride = useHomePostCardStore((state) => state.clearFollowUserOverride);
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

  const { handleFollowUser: handleFollowPress, handleFollowTopic: handleFollowTopicFromCard } = useFollowHandler({
    onOptimisticFollowUser: (userId, isFollowing) => {
      setFollowUserOverride(userId, isFollowing);
    },
    onRollbackFollowUser: (userId) => {
      clearFollowUserOverride(userId);
    },
  });
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

  const { handleUpvote, handleDownvote } = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
      markSeen(targetId, "vote");
      setVoteOverride(targetId, {
        hasLiked: result.hasLiked,
        hasDisliked: result.hasDisliked,
        likes: result.newLikes,
      });
    }, [setVoteOverride]),
    onRollback: useCallback(
      (
        targetId: string,
        previousState: {
          hasLiked: boolean;
          hasDisliked: boolean;
          likes: number;
        }
      ) => {
        clearVoteOverride(targetId);
      },
      [clearVoteOverride]
    ),
  });
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
      setSelectedPost(post);
      postOptionsSheetRef.current?.present();
    });
  }, [requireAuth]);

  const blockHandler = useBlockHandler({});
  const reportHandler = useReportHandler({});

  const deleteHandler = useDeleteHandler({
    onRollback: (targetId, targetType) => {
      if (targetType === "post") {
        unhidePost(targetId);
      }
    },
  });

  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending) {
      if (pending.type === "user") {
        blockUser(pending.id);
      } else if (pending.type === "post") {
        hidePost(pending.id);
      } else if (pending.type === "topic") {
        blockTopicOptimistic(pending.id);
        showBars();
      }
    }
    blockHandler.confirmBlock();
  }, [blockHandler, blockUser, hidePost, blockTopicOptimistic, showBars]);

  const handleConfirmDelete = useCallback(() => {
    const pending = deleteHandler.pendingTarget;
    if (pending) {
      hidePost(pending.id);
    }
    deleteHandler.confirmDelete();
  }, [deleteHandler, hidePost]);

  const handleReportSubmitWithOptimistic = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending) {
        hidePost(pending.id);
      }
      reportSheetRef.current?.dismiss();
      reportHandler.submitReport(reason);
    },
    [reportHandler, hidePost]
  );

  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet]);

  const handleReport = useCallback(() => {
    requireAuth(() => {
      if (selectedPost) {
        reportHandler.requestReport(selectedPost.id, "post");
      }
    });
  }, [selectedPost, reportHandler, requireAuth]);

  const handleBlockUser = useCallback(() => {
    requireAuth(() => {
      if (selectedPost) {
        blockHandler.requestBlockUser(
          selectedPost.author.id,
          selectedPost.author.username
        );
      }
    });
  }, [selectedPost, blockHandler, requireAuth]);

  const handleHidePost = useCallback(() => {
    requireAuth(() => {
      if (selectedPost) {
        blockHandler.requestBlockPost(selectedPost.id);
      }
    });
  }, [selectedPost, blockHandler, requireAuth]);

  const handleBlockUserFromCard = useCallback(
    (postId: string, authorId: string, authorUsername: string) => {
      requireAuth(() => blockHandler.requestBlockUser(authorId, authorUsername));
    },
    [blockHandler, requireAuth]
  );

  const handleBlockPostFromCard = useCallback(
    (postId: string) => {
      requireAuth(() => blockHandler.requestBlockPost(postId));
    },
    [blockHandler, requireAuth]
  );

  const handleBlockTopicFromCard = useCallback(
    (_postId: string, topic: string) => {
      requireAuth(() => blockHandler.requestBlockTopic(topic));
    },
    [blockHandler, requireAuth]
  );

  const handleReportFromCard = useCallback(
    (postId: string) => {
      requireAuth(() => reportHandler.requestReport(postId, "post"));
    },
    [reportHandler, requireAuth]
  );

  const handleEditPost = useCallback(() => {
    requireAuth(() => {
      if (!selectedPost) return;
      navigateToEditPost(router, selectedPost);
    });
  }, [selectedPost, router, requireAuth]);

  const handleDeletePost = useCallback(() => {
    requireAuth(() => {
      if (selectedPost) {
        deleteHandler.requestDelete(selectedPost.id, "post");
      }
    });
  }, [selectedPost, deleteHandler, requireAuth]);

  const handleSavePost = useCallback(() => {
    if (!selectedPost) return;
    const saved = useSavedPostsStore.getState().toggleSavePost(selectedPost);
    toast.success(
      saved ? "Post saved" : "Post unsaved",
      saved ? "You can find it in your saved items." : "Removed from saved items.",
    );
  }, [selectedPost, toast]);

  const handleCopyText = useCallback(() => {
    toast.success("Copied", "Text copied to clipboard.");
  }, [toast]);

  const handleFollowTopic = useCallback(() => {
    requireAuth(() => {
      if (!selectedPost?.topic) return;
      const topic = selectedPost.topic;
      const isCurrentlyFollowed = followedTopics.includes(topic);
      handleFollowTopicFromCard(topic, isCurrentlyFollowed);
    });
  }, [selectedPost?.topic, followedTopics, handleFollowTopicFromCard, requireAuth]);

  const handleShowFewer = useCallback(() => {
    console.log("Show fewer posts like:", selectedPost?.id);
    toast.success("Got it", "We'll show fewer posts like this.");
  }, [selectedPost?.id, toast]);

  const handleCommentPress = useCallback(
    (postId: string) => {
      markSeen(postId, "open");
      router.push(`/post/${postId}?syncContext=${encodeURIComponent(currentFeedSyncContext)}`);
    },
    [currentFeedSyncContext, router]
  );

  const handleFollowUserFromSheet = useCallback(() => {
    requireAuth(() => {
      if (!selectedPost) return;
      const authorId = selectedPost.author.id;
      const authorUsername = selectedPost.author.username;
      const isCurrentlyFollowing = displayFollowedUsers.includes(authorId);
      handleFollowPress(authorId, authorUsername, isCurrentlyFollowing);
    });
  }, [selectedPost, displayFollowedUsers, handleFollowPress, requireAuth]);

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

  const setCardContext = useHomePostCardStore((state) => state.setCardContext);
  const setHandlers = useHomePostCardStore((state) => state.setHandlers);
  const setActiveFeedScreen = useHomePostCardStore((state) => state.setActiveFeedScreen);
  const setDisabledTopicName = useHomePostCardStore((state) => state.setDisabledTopicName);

  const followedUsersSet = useMemo(() => new Set(followedUsers), [followedUsers]);
  const followedTopicsSet = useMemo(() => new Set(followedTopics), [followedTopics]);

  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType]
  );

  useEffect(() => {
    setCardContext({
      currentUserId: currentUser?.id,
      followedUsers: followedUsersSet,
      followedTopics: followedTopicsSet,
      revealedPosts,
      shareServer,
      allowAutoplay,
    });
  }, [
    allowAutoplay,
    currentUser?.id,
    followedTopicsSet,
    followedUsersSet,
    revealedPosts,
    setCardContext,
    shareServer,
  ]);

  useFocusEffect(
    useCallback(() => {
      setActiveFeedScreen('home');
      setDisabledTopicName(undefined);
      useTimeTickStore.getState().bump();
      return () => {
        const current = useHomePostCardStore.getState().activeFeedScreen;
        if (current === 'home') {
          setActiveFeedScreen(null);
        }
      };
    }, [setActiveFeedScreen, setDisabledTopicName]),
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

  useFocusEffect(
    useCallback(() => {
      setHandlers({
        onPostPress: (postId) => handlersRef.current.handlePostPress(postId),
        onAuthorPress: (authorId) => handlersRef.current.handleAuthorPress(authorId),
        onTopicPress: (topic) => handlersRef.current.handleTopicPress(topic),
        onMorePress: (post) => handlersRef.current.handleMorePress(post),
        onLikePress: (postId, liked, disliked, likes) =>
          handlersRef.current.handleGuardedUpvote(postId, liked, disliked, likes),
        onDislikePress: (postId, liked, disliked, likes) =>
          handlersRef.current.handleGuardedDownvote(postId, liked, disliked, likes),
        onCommentPress: (postId) => handlersRef.current.handleCommentPress(postId),
        onFollowUser: (authorId, username, isFollowing) =>
          handlersRef.current.handleGuardedFollowPress(authorId, username, isFollowing),
        onFollowTopic: (topic, isFollowed) =>
          handlersRef.current.handleGuardedFollowTopicFromCard(topic, isFollowed),
        onRevealContent: (postId) => handlersRef.current.handleRevealContent(postId),
        onBlockUser: (postId, authorId, authorUsername) =>
          handlersRef.current.handleBlockUserFromCard(postId, authorId, authorUsername),
        onBlockPost: (postId) => handlersRef.current.handleBlockPostFromCard(postId),
        onBlockTopic: (postId, topic) => handlersRef.current.handleBlockTopicFromCard(postId, topic),
        onReport: (postId) => handlersRef.current.handleReportFromCard(postId),
      });
    }, [handlersRef, setHandlers])
  );

  if (!isLoggedIn && !isInitializing && !openBrowsingEnabled) {
    return <LoggedOutHome />;
  }

  return (
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

      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={currentUser?.id === selectedPost?.author.id}
        isTopicFollowed={
          selectedPost?.topic
            ? followedTopics.includes(selectedPost.topic)
            : false
        }
        isFollowingUser={
          selectedPost?.author.id
            ? displayFollowedUsers.includes(selectedPost.author.id)
            : false
        }
        onShowFewer={handleShowFewer}
        onFollowUser={handleFollowUserFromSheet}
        onFollowTopic={handleFollowTopic}
        onSave={handleSavePost}
        isSaved={selectedPost ? savedPosts.some((p) => p.id === selectedPost.id) : false}
        onCopyText={handleCopyText}
        onReport={handleReport}
        onBlockUser={handleBlockUser}
        onHidePost={handleHidePost}
        onEdit={handleEditPost}
        onDelete={handleDeletePost}
        onGiveAward={() => {
          if (!selectedPost) return;
          setTimeout(() => awardPickerSheetRef.current?.present(), 300);
        }}
        onGiftMirage={() => {
          if (!selectedPost) return;
          setTimeout(() => giftMirageSheetRef.current?.present(), 300);
        }}
        onGiftSubscription={() => {
          if (!selectedPost) return;
          setTimeout(() => giftSubscriptionSheetRef.current?.present(), 300);
        }}
        onDismiss={() => setSelectedPost(null)}
      />

      <AwardPickerSheet
        ref={awardPickerSheetRef}
        targetId={selectedPost?.id ?? ""}
        targetType="post"
        isOwnContent={currentUser?.id === selectedPost?.author.id}
      />

      <GiftMirageSheet
        ref={giftMirageSheetRef}
        recipientAddress={selectedPost?.author.id ?? ""}
        recipientUsername={selectedPost?.author.username ?? ""}
      />

      <GiftSubscriptionSheet
        ref={giftSubscriptionSheetRef}
        recipientAddress={selectedPost?.author.id ?? ""}
        recipientUsername={selectedPost?.author.username ?? ""}
      />

      <ReportSheet
        ref={reportSheetRef}
        targetType="post"
        onSubmit={handleReportSubmitWithOptimistic}
        onDismiss={reportHandler.cancelReport}
        isLoading={reportHandler.isReporting}
      />

      <ConfirmationPopup
        visible={blockHandler.showConfirmation}
        title={`Block ${blockHandler.pendingBlock?.label || "user"}?`}
        message={getBlockConfirmationMessage(
          blockHandler.pendingBlock?.type ?? "post",
        )}
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        onConfirm={handleConfirmBlock}
        onCancel={blockHandler.cancelBlock}
      />

      <ConfirmationPopup
        visible={deleteHandler.showConfirmation}
        title="Delete this post?"
        message="This action cannot be undone."
        description="Your post will be permanently removed."
        icon="trash-outline"
        confirmText="Delete"
        isDestructive
        onConfirm={handleConfirmDelete}
        onCancel={deleteHandler.cancelDelete}
      />

    </Box>
  );
}
