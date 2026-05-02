import { navigateToEditPost } from "@/src/utils/edit-post";
import { markSeen } from "@/src/services/seen-posts";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "@/src/hooks/use-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View, type AppStateStatus } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  useUserFollowed,
} from "@/src/api";

import {
  ConfirmationPopup,
  FeedHeader,
  NewPostsButton,
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
  type Post,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { useSideMenu } from "@/src/providers/side-menu-provider";
import { storage } from "@/src/stores";

import { APP_FOREGROUND_REFRESH_THRESHOLD_MS, useAuthGuard, useBlockHandler, getBlockConfirmationMessage, useDeleteHandler, useFollowHandler, useReportHandler, useVoteHandler, type VoteResult } from "@/src/hooks";
import {
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { useToast } from "@/src/providers/toast-provider";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useSavedPostsStore,
  useTimeTickStore,
} from "@/src/stores";
import { HomeTabbedFeed, type HomeTabbedFeedRef } from "./home/home-tabbed-feed";
import { useHomePostCardStore } from "./home/home-post-card-store";

export function FollowingScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    headerAnimatedStyle,
  } = useScrollAnimationContext();
  const { requireAuth, isLoggedIn } = useAuthGuard();
  const toast = useToast();
  const { showBars } = useScrollAnimationContext();

  const currentUser = useAuthStore((s) => s.user);
  const shareServer = usePreferencesStore((s) => s.shareServer);

  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<{ userId: string; username: string }[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);

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

  const tabbedFeedRef = useRef<HomeTabbedFeedRef>(null);
  const backgroundTimeRef = useRef<number | null>(null);

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
        const duration = Date.now() - backgroundTimeRef.current;
        backgroundTimeRef.current = null;
        storage.remove("app_was_backgrounded");
        useTimeTickStore.getState().bump();
        if (duration >= APP_FOREGROUND_REFRESH_THRESHOLD_MS) {
          setTimeout(async () => {
            showBars();
            tabbedFeedRef.current?.scrollToTop(undefined, { animated: false });
            await tabbedFeedRef.current?.refresh({ fetchAllNew: true });
            tabbedFeedRef.current?.dismissNewPosts();
            setHasNewPosts(false);
            requestAnimationFrame(() => {
              tabbedFeedRef.current?.scrollToTop(undefined, { animated: false });
              showBars();
            });
          }, 300);
        } else {
          setTimeout(() => {
            tabbedFeedRef.current?.checkNewPosts();
          }, 500);
        }
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, []);

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

  const currentFeedSyncContext = feedTabIndex === 0 ? "following:magic" : "following:latest";

  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);
  const hidePost = useContentModerationStore((s) => s.hidePost);
  const unhidePost = useContentModerationStore((s) => s.unhidePost);
  const blockUser = useContentModerationStore((s) => s.blockUser);
  const blockTopicOptimistic = useContentModerationStore((s) => s.blockTopic);

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

  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);

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
      (targetId: string) => {
        clearVoteOverride(targetId);
      },
      [clearVoteOverride]
    ),
  });

  const revealedPostsRef = useRef<Set<string>>(new Set());

  const handlePostPress = useCallback(
    (postId: string) => {
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
    setSelectedPost(post);
    postOptionsSheetRef.current?.present();
  }, []);

  const handleCommentPress = useCallback(
    (postId: string) => {
      markSeen(postId, "open");
      router.push(`/post/${postId}?syncContext=${encodeURIComponent(currentFeedSyncContext)}`);
    },
    [currentFeedSyncContext, router]
  );

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

  const handleFollowUserFromSheet = useCallback(() => {
    if (!selectedPost) return;
    const authorId = selectedPost.author.id;
    const authorUsername = selectedPost.author.username;
    const isCurrentlyFollowing = followedUsers.includes(authorId);
    handleFollowPress(authorId, authorUsername, isCurrentlyFollowing);
  }, [selectedPost, followedUsers, handleFollowPress]);

  const handleShowFewer = useCallback(() => {
    console.log("Show fewer posts like:", selectedPost?.id);
    toast.success("Got it", "We'll show fewer posts like this.");
  }, [selectedPost?.id, toast]);

  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((prev) => {
      const newSet = new Set(prev);
      newSet.add(postId);
      revealedPostsRef.current = newSet;
      return newSet;
    });
  }, []);

  const setCurrentUserId = useHomePostCardStore((state) => state.setCurrentUserId);
  const setFollowedUsers = useHomePostCardStore((state) => state.setFollowedUsers);
  const setFollowedTopicsStore = useHomePostCardStore((state) => state.setFollowedTopics);
  const setFollowLoadingUsersStore = useHomePostCardStore((state) => state.setFollowLoadingUsers);
  const setRevealedPostsStore = useHomePostCardStore((state) => state.setRevealedPosts);
  const setHandlers = useHomePostCardStore((state) => state.setHandlers);
  const setShareServer = useHomePostCardStore((state) => state.setShareServer);
  const setActiveFeedScreen = useHomePostCardStore((state) => state.setActiveFeedScreen);
  const setDisabledTopicName = useHomePostCardStore((state) => state.setDisabledTopicName);

  const followedUsersSet = useMemo(() => new Set(followedUsers), [followedUsers]);
  const followedTopicsSet = useMemo(() => new Set(followedTopics), [followedTopics]);

  useEffect(() => {
    setCurrentUserId(currentUser?.id);
  }, [currentUser?.id, setCurrentUserId]);

  useEffect(() => {
    setFollowedUsers(followedUsersSet);
  }, [followedUsersSet, setFollowedUsers]);

  useEffect(() => {
    setFollowedTopicsStore(followedTopicsSet);
  }, [followedTopicsSet, setFollowedTopicsStore]);

  useEffect(() => {
    setRevealedPostsStore(revealedPosts);
  }, [revealedPosts, setRevealedPostsStore]);

  useEffect(() => {
    setShareServer(shareServer);
  }, [shareServer, setShareServer]);

  useFocusEffect(
    useCallback(() => {
      setActiveFeedScreen('following');
      setDisabledTopicName(undefined);
      useTimeTickStore.getState().bump();
      return () => {
        const current = useHomePostCardStore.getState().activeFeedScreen;
        if (current === 'following') {
          setActiveFeedScreen(null);
        }
      };
    }, [setActiveFeedScreen, setDisabledTopicName]),
  );

  const handlersRef = useRef({
    handlePostPress,
    handleAuthorPress,
    handleTopicPress,
    handleMorePress,
    handleUpvote,
    handleDownvote,
    handleCommentPress,
    handleFollowPress,
    handleFollowTopicFromCard,
    handleRevealContent,
    handleBlockUserFromCard,
    handleBlockPostFromCard,
    handleBlockTopicFromCard,
    handleReportFromCard,
  });

  useEffect(() => {
    handlersRef.current = {
      handlePostPress,
      handleAuthorPress,
      handleTopicPress,
      handleMorePress,
      handleUpvote,
      handleDownvote,
      handleCommentPress,
      handleFollowPress,
      handleFollowTopicFromCard,
      handleRevealContent,
      handleBlockUserFromCard,
      handleBlockPostFromCard,
      handleBlockTopicFromCard,
      handleReportFromCard,
    };
  });

  useFocusEffect(
    useCallback(() => {
      setHandlers({
        onPostPress: (postId) => handlersRef.current.handlePostPress(postId),
        onAuthorPress: (authorId) => handlersRef.current.handleAuthorPress(authorId),
        onTopicPress: (topic) => handlersRef.current.handleTopicPress(topic),
        onMorePress: (post) => handlersRef.current.handleMorePress(post),
        onLikePress: (postId, liked, disliked, likes) =>
          handlersRef.current.handleUpvote(postId, liked, disliked, likes),
        onDislikePress: (postId, liked, disliked, likes) =>
          handlersRef.current.handleDownvote(postId, liked, disliked, likes),
        onCommentPress: (postId) => handlersRef.current.handleCommentPress(postId),
        onFollowUser: (authorId, username, isFollowing) =>
          handlersRef.current.handleFollowPress(authorId, username, isFollowing),
        onFollowTopic: (topic, isFollowed) =>
          handlersRef.current.handleFollowTopicFromCard(topic, isFollowed),
        onRevealContent: (postId) => handlersRef.current.handleRevealContent(postId),
        onBlockUser: (postId, authorId, authorUsername) =>
          handlersRef.current.handleBlockUserFromCard(postId, authorId, authorUsername),
        onBlockPost: (postId) => handlersRef.current.handleBlockPostFromCard(postId),
        onBlockTopic: (postId, topic) => handlersRef.current.handleBlockTopicFromCard(postId, topic),
        onReport: (postId) => handlersRef.current.handleReportFromCard(postId),
      });
    }, [setHandlers])
  );

  return (
    <Box flex background="base">
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      <FeedHeader
        title="Following"
        onMenuPress={openSideMenu}

        onSearchPress={() => router.push("/search")}
        animatedStyle={headerAnimatedStyle}
        feedType={feedTabIndex === 0 ? "magic" : "latest"}
        feedOptions={FEED_OPTIONS}
        onFeedTypeChange={handleFeedTypeChange}
      />

      <HomeTabbedFeed
        ref={tabbedFeedRef}
        feedType="following"
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
