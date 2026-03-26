import { navigateToEditPost } from "@/src/utils/edit-post";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import {
  useUserFollowed,
} from "@/src/api";
import { queryKeys } from "@/src/api/read/query-keys";

import {
AdultContentPopup,
ConfirmationPopup,
FeedHeader,
NewPostsButton,
type Post,
 PostOptionsSheet,
 type PostOptionsSheetRef,
 AwardPickerSheet,
 type AwardPickerSheetRef,
 ReportSheet,
 type ReportSheetRef,
UpdateBanner,
} from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import { useSideMenu } from "@/src/providers/side-menu-provider";
import {
  useBlockHandler,
  useDeleteHandler,
  useEasUpdate,
  useFeedResumeRefresh,
  useFollowHandler,
  useHomePostCardBindings,
  useNetworkState,
  useReportHandler,
  useVoteHandler,
  shouldAutoplayVideo,
  type VoteResult,
} from "@/src/hooks";
import {
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { useToast } from "@/src/providers/toast-provider";
import { HomeTabbedFeed, type HomeTabbedFeedRef } from "./home/home-tabbed-feed";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useSavedPostsStore,
} from "@/src/stores";
import { LoggedOutHome } from "./logged-out-home";

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    headerAnimatedStyle,
    showBars,
  } = useScrollAnimationContext();
  const toast = useToast();
  const easUpdate = useEasUpdate();

  const isAutoRefreshingRef = useRef(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<{ userId: string; username: string }[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);

  const handleNewPostsChange = useCallback((hasNew: boolean, avatars: { userId: string; username: string }[], count: number) => {
    if (isAutoRefreshingRef.current) return;
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

  const tabbedFeedRef = useRef<HomeTabbedFeedRef>(null);

  useEffect(() => {
    const switchToLatest = useHomePostCardStore.getState().skipNextRefresh;
    if (switchToLatest) {
      useHomePostCardStore.getState().setSkipNextRefresh(false);
      setFeedTabIndex(1);
    }
    showBars();
  }, [showBars]);

  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const awardPickerSheetRef = useRef<AwardPickerSheetRef>(null);
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

  const hidePost = useContentModerationStore((s) => s.hidePost);
  const unhidePost = useContentModerationStore((s) => s.unhidePost);
  const blockUser = useContentModerationStore((s) => s.blockUser);
  const blockTopicOptimistic = useContentModerationStore((s) => s.blockTopic);

  const hasSeenAdultPrompt = usePreferencesStore((s) => s.hasSeenAdultPrompt);
  const setHasSeenAdultPrompt = usePreferencesStore(
    (s) => s.setHasSeenAdultPrompt
  );
  const setAdultContent = usePreferencesStore((s) => s.setAdultContent);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((s) => s.videoAutoplayNetwork);
  const currentUser = useAuthStore((s) => s.user);

  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  const { networkType } = useNetworkState();

  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData]
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData]
  );

  const { handleFollowUser: handleFollowPress, handleFollowTopic: handleFollowTopicFromCard } = useFollowHandler({});

  const showAdultPopup = !!currentUser && !hasSeenAdultPrompt;

  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);
  const shouldScrollToTop = useHomePostCardStore((state) => state.shouldScrollToTop);
  const clearScrollToTop = useHomePostCardStore((state) => state.clearScrollToTop);

  const { handleUpvote, handleDownvote } = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
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

  const handleEnableAdultContent = useCallback(() => {
    setAdultContent(true);
    setHasSeenAdultPrompt();
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: "iOS: Adult content enabled via popup",
      level: "info",
    });
  }, [setAdultContent, setHasSeenAdultPrompt]);

  const handleDeclineAdultContent = useCallback(() => {
    setAdultContent(false);
    setHasSeenAdultPrompt();
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: "iOS: Adult content declined via popup",
      level: "info",
    });
  }, [setAdultContent, setHasSeenAdultPrompt]);

  const revealedPostsRef = useRef<Set<string>>(new Set());
  const isNavigatingRef = useRef(false);

  const handlePostPress = useCallback(
    (postId: string) => {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      setTimeout(() => { isNavigatingRef.current = false; }, 500);
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
    setSelectedPost(post);
    postOptionsSheetRef.current?.present();
  }, []);

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
    if (selectedPost) {
      reportHandler.requestReport(selectedPost.id, "post");
    }
  }, [selectedPost, reportHandler]);

  const handleBlockUser = useCallback(() => {
    if (selectedPost) {
      blockHandler.requestBlockUser(
        selectedPost.author.id,
        selectedPost.author.username
      );
    }
  }, [selectedPost, blockHandler]);

  const handleHidePost = useCallback(() => {
    if (selectedPost) {
      blockHandler.requestBlockPost(selectedPost.id);
    }
  }, [selectedPost, blockHandler]);

  const handleBlockUserFromCard = useCallback(
    (postId: string, authorId: string, authorUsername: string) => {
      blockHandler.requestBlockUser(authorId, authorUsername);
    },
    [blockHandler]
  );

  const handleBlockPostFromCard = useCallback(
    (postId: string) => {
      blockHandler.requestBlockPost(postId);
    },
    [blockHandler]
  );

  const handleBlockTopicFromCard = useCallback(
    (_postId: string, topic: string) => {
      blockHandler.requestBlockTopic(topic);
    },
    [blockHandler]
  );

  const handleReportFromCard = useCallback(
    (postId: string) => {
      reportHandler.requestReport(postId, "post");
    },
    [reportHandler]
  );

  const handleEditPost = useCallback(() => {
    if (!selectedPost) return;
    navigateToEditPost(router, selectedPost);
  }, [selectedPost, router]);

  const handleDeletePost = useCallback(() => {
    if (selectedPost) {
      deleteHandler.requestDelete(selectedPost.id, "post");
    }
  }, [selectedPost, deleteHandler]);

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
    if (!selectedPost?.topic) return;
    const topic = selectedPost.topic;
    const isCurrentlyFollowed = followedTopics.includes(topic);
    handleFollowTopicFromCard(topic, isCurrentlyFollowed);
  }, [selectedPost?.topic, followedTopics, handleFollowTopicFromCard]);

  const handleShowFewer = useCallback(() => {
    console.log("Show fewer posts like:", selectedPost?.id);
    toast.success("Got it", "We'll show fewer posts like this.");
  }, [selectedPost?.id, toast]);

  const handleCommentPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}?syncContext=${encodeURIComponent(currentFeedSyncContext)}`);
    },
    [currentFeedSyncContext, router]
  );

  const handleFollowUserFromSheet = useCallback(() => {
    if (!selectedPost) return;
    const authorId = selectedPost.author.id;
    const authorUsername = selectedPost.author.username;
    const isCurrentlyFollowing = followedUsers.includes(authorId);
    handleFollowPress(authorId, authorUsername, isCurrentlyFollowing);
  }, [selectedPost, followedUsers, handleFollowPress]);

  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((prev) => {
      const nextRevealedPosts = new Set(prev);
      nextRevealedPosts.add(postId);
      revealedPostsRef.current = nextRevealedPosts;
      return nextRevealedPosts;
    });
  }, []);

  useEffect(() => {
    if (shouldScrollToTop) {
      tabbedFeedRef.current?.scrollToTop();
      clearScrollToTop();
    }
  }, [shouldScrollToTop, clearScrollToTop]);

  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType]
  );

  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      if (currentUser?.walletAddress) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.rewardSummary(currentUser.walletAddress),
        });
      }
    }, [queryClient, currentUser?.walletAddress]),
  );

  const homePostCardHandlers = useMemo(
    () => ({
      onPostPress: handlePostPress,
      onAuthorPress: handleAuthorPress,
      onTopicPress: handleTopicPress,
      onMorePress: handleMorePress,
      onLikePress: handleUpvote,
      onDislikePress: handleDownvote,
      onCommentPress: handleCommentPress,
      onFollowUser: handleFollowPress,
      onFollowTopic: handleFollowTopicFromCard,
      onRevealContent: handleRevealContent,
      onBlockUser: handleBlockUserFromCard,
      onBlockPost: handleBlockPostFromCard,
      onBlockTopic: handleBlockTopicFromCard,
      onReport: handleReportFromCard,
    }),
    [
      handleAuthorPress,
      handleBlockPostFromCard,
      handleBlockTopicFromCard,
      handleBlockUserFromCard,
      handleCommentPress,
      handleDownvote,
      handleFollowPress,
      handleFollowTopicFromCard,
      handleMorePress,
      handlePostPress,
      handleReportFromCard,
      handleRevealContent,
      handleTopicPress,
      handleUpvote,
    ],
  );

  useHomePostCardBindings({
    currentUserId: currentUser?.id,
    followedUsers,
    followedTopics,
    revealedPosts,
    shareServer,
    allowAutoplay,
    activeFeedScreen: "home",
    handlers: homePostCardHandlers,
  });

  useFeedResumeRefresh({
    onFreshResume: useCallback(() => {
      tabbedFeedRef.current?.checkNewPosts();
    }, []),
    onStaleResume: useCallback(async () => {
      isAutoRefreshingRef.current = true;
      setHasNewPosts(false);
      showBars();
      tabbedFeedRef.current?.scrollToTop(undefined, { animated: false });
      await tabbedFeedRef.current?.refresh({ fetchAllNew: true, silent: true });
      tabbedFeedRef.current?.resetBaseline(null);
      setHasNewPosts(false);
      isAutoRefreshingRef.current = false;
      requestAnimationFrame(() => {
        tabbedFeedRef.current?.scrollToTop(undefined, { animated: false });
        showBars();
      });
    }, [showBars]),
    restorePersistedBackground: true,
  });

  if (!isLoggedIn && !isInitializing) {
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
      />

      <HomeTabbedFeed
        ref={tabbedFeedRef}
        feedType="home"
        activeTabIndex={feedTabIndex}
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
            ? followedUsers.includes(selectedPost.author.id)
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
        onDismiss={() => setSelectedPost(null)}
      />

      <AwardPickerSheet
        ref={awardPickerSheetRef}
        targetId={selectedPost?.id ?? ""}
        targetType="post"
        isOwnContent={currentUser?.id === selectedPost?.author.id}
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
        message="You won't see their content anymore."
        description="You can unblock them later from settings."
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

const styles = StyleSheet.create((theme) => ({
  statusBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background.default,
    zIndex: 101,
  },
}));
