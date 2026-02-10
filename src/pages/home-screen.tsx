import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  queryKeys,
  useToggleFollowTopic,
  useToggleFollowUser,
  useUserFollowed,
  useUserStatus,
} from "@/src/api";
import {
AdultContentPopup,
ConfirmationPopup,
FeedHeader,
type Post,
 PostOptionsSheet,
 type PostOptionsSheetRef,
 ReportSheet,
 type ReportSheetRef,
 SideMenu,
 type SideMenuRef,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import {
  useAuthGuard,
  useBlockHandler,
  useDeleteHandler,
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
import { useHomePostCardStore } from "./home/home-post-card-store";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useSavedPostsStore,
} from "@/src/stores";
import { LoggedOutHome } from "./logged-out-home";

export function HomeScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    headerAnimatedStyle,
    registerScrollRef,
    registerRefreshCallback,
  } = useScrollAnimationContext();
  const { requireAuth } = useAuthGuard();
  const toast = useToast();

  const { data: userStatus } = useUserStatus();

  const tabbedFeedRef = useRef<HomeTabbedFeedRef>(null);

  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const sideMenuRef = useRef<SideMenuRef>(null);

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);
  const hidePost = useContentModerationStore((s) => s.hidePost);
  const unhidePost = useContentModerationStore((s) => s.unhidePost);
  const blockUser = useContentModerationStore((s) => s.blockUser);

  const hasSeenAdultPrompt = usePreferencesStore((s) => s.hasSeenAdultPrompt);
  const setHasSeenAdultPrompt = usePreferencesStore(
    (s) => s.setHasSeenAdultPrompt
  );
  const setAdultContent = usePreferencesStore((s) => s.setAdultContent);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((s) => s.videoAutoplayNetwork);
  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
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

  const toggleFollowMutation = useToggleFollowUser();
  const toggleFollowTopicMutation = useToggleFollowTopic();
  const toggleFollowAsyncRef = useRef(toggleFollowMutation.mutateAsync);

  useEffect(() => {
    toggleFollowAsyncRef.current = toggleFollowMutation.mutateAsync;
  }, [toggleFollowMutation.mutateAsync]);

  const [followLoadingUsers, setFollowLoadingUsers] = useState<Set<string>>(
    new Set()
  );
  const followLoadingUsersRef = useRef<Set<string>>(new Set());

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
  }, [setAdultContent, setHasSeenAdultPrompt]);

  const handleDeclineAdultContent = useCallback(() => {
    setAdultContent(false);
    setHasSeenAdultPrompt();
  }, [setAdultContent, setHasSeenAdultPrompt]);

  const handleMenuPress = useCallback(() => {
    sideMenuRef.current?.present();
  }, []);

  const handleMenuSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleMenuSubscription = useCallback(() => {
    router.push("/subscription");
  }, [router]);

  const handleMenuSaved = useCallback(() => {
    router.push("/saved-posts");
  }, [router]);

  const handleMenuHistory = useCallback(() => {
    console.log("Navigate to history");
  }, []);

  const handleMenuDrafts = useCallback(() => {
    console.log("Navigate to drafts");
  }, []);

  const handleMenuFollowing = useCallback(() => {
    const id = currentUser?.walletAddress || currentUser?.username;
    if (id) {
      router.push(`/user-following/${id}`);
    }
  }, [router, currentUser?.walletAddress, currentUser?.username]);

  const handleMenuInvite = useCallback(() => {
    router.push("/invite-and-earn");
  }, [router]);

  const handleMenuQuests = useCallback(() => {
    router.push("/quests");
  }, [router]);

  const handleMenuTopics = useCallback(() => {
    router.push("/topics");
  }, [router]);

  const handleMenuHelp = useCallback(() => {
    Linking.openURL("https://mirage.foundation/faq");
  }, []);

  const handleMenuAbout = useCallback(() => {
    Linking.openURL("https://mirage.foundation");
  }, []);

  const handleMenuLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router]
  );

  const handleAuthorPress = useCallback((authorId: string) => {
    router.push(`/user/${authorId}`);
  }, [router]);

  const handleTopicPress = useCallback((topic: string) => {
    router.push(`/topic/${encodeURIComponent(topic)}`);
  }, [router]);

  const postsByIdRef = useRef<Map<string, Post>>(new Map());

  const handleMorePress = useCallback((postId: string) => {
    const post = postsByIdRef.current.get(postId);
    if (post) {
      setSelectedPost(post);
      postOptionsSheetRef.current?.present();
    }
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
      }
    }
    blockHandler.confirmBlock();
  }, [blockHandler, blockUser, hidePost]);

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

  const handleReportFromCard = useCallback(
    (postId: string) => {
      reportHandler.requestReport(postId, "post");
    },
    [reportHandler]
  );

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

    requireAuth(async () => {
      const action = isCurrentlyFollowed ? "Unfollowing" : "Following";
      const actionPast = isCurrentlyFollowed ? "Unfollowed" : "Now following";

      const toastId = toast.loading(
        `${action} #${topic}`,
        "Computing proof of work..."
      );

      setTimeout(async () => {
        try {
          await toggleFollowTopicMutation.mutateAsync({
            topic,
            isCurrentlyFollowing: isCurrentlyFollowed,
          });

          toast.update(toastId, {
            type: "success",
            title: `${actionPast} #${topic}`,
            description: undefined,
            duration: 3000,
          });

          setTimeout(() => toast.dismiss(toastId), 3000);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const isAlreadyFollowed = errorMessage.toLowerCase().includes("already follow");
          const isNotFollowing =
            errorMessage.toLowerCase().includes("not following") ||
            errorMessage.includes("not in followed");

          if (isAlreadyFollowed) {
            toast.update(toastId, {
              type: "success",
              title: `Already following #${topic}`,
              description: undefined,
              duration: 3000,
            });
            setTimeout(() => toast.dismiss(toastId), 3000);
          } else if (isNotFollowing) {
            toast.update(toastId, {
              type: "success",
              title: `Already not following #${topic}`,
              description: undefined,
              duration: 3000,
            });
            setTimeout(() => toast.dismiss(toastId), 3000);
          } else {
            console.error("Follow/unfollow topic failed:", error);
            toast.update(toastId, {
              type: "error",
              title: `Failed to ${action.toLowerCase()} #${topic}`,
              description: "Please try again",
              duration: 4000,
            });
            setTimeout(() => toast.dismiss(toastId), 4000);
          }
        }
      }, 0);
    });
  }, [
    selectedPost?.topic,
    followedTopics,
    toggleFollowTopicMutation,
    toast,
    requireAuth,
  ]);

  const handleShowFewer = useCallback(() => {
    console.log("Show fewer posts like:", selectedPost?.id);
    toast.success("Got it", "We'll show fewer posts like this.");
  }, [selectedPost?.id, toast]);

  const handleCommentPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router]
  );

  const handleFollowPress = useCallback(
    (
      authorId: string,
      authorUsername: string,
      isCurrentlyFollowing: boolean
    ) => {
      if (followLoadingUsersRef.current.has(authorId)) {
        return;
      }

      requireAuth(async () => {
        const action = isCurrentlyFollowing ? "Unfollowing" : "Following";
        const actionPast = isCurrentlyFollowing ? "Unfollowed" : "Followed";

        const toastId = toast.loading(
          `${action} @${authorUsername}`,
          "Computing proof of work..."
        );

        setTimeout(async () => {
          setFollowLoadingUsers((prev) => new Set(prev).add(authorId));

          try {
            await toggleFollowAsyncRef.current({
              userAddress: authorId,
              isCurrentlyFollowing,
            });

            toast.update(toastId, {
              type: "success",
              title: `${actionPast} @${authorUsername}`,
              description: undefined,
              duration: 3000,
            });

            setTimeout(() => toast.dismiss(toastId), 3000);
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const isAlreadyFollowed = errorMessage.toLowerCase().includes("already follow");
            const isNotFollowing =
              errorMessage.toLowerCase().includes("not following") ||
              errorMessage.includes("not in followed");

            if (isAlreadyFollowed) {
              toast.update(toastId, {
                type: "success",
                title: `Already following @${authorUsername}`,
                description: undefined,
                duration: 3000,
              });
              setTimeout(() => toast.dismiss(toastId), 3000);
            } else if (isNotFollowing) {
              toast.update(toastId, {
                type: "success",
                title: `Already not following @${authorUsername}`,
                description: undefined,
                duration: 3000,
              });
              setTimeout(() => toast.dismiss(toastId), 3000);
            } else {
              console.error("Follow/unfollow failed:", error);
              toast.update(toastId, {
                type: "error",
                title: `Failed to ${action.toLowerCase()} @${authorUsername}`,
                description: "Please try again",
                duration: 4000,
              });
              setTimeout(() => toast.dismiss(toastId), 4000);
            }
          } finally {
            setFollowLoadingUsers((prev) => {
              const newSet = new Set(prev);
              newSet.delete(authorId);
              return newSet;
            });
          }
        }, 0);
      });
    },
    [requireAuth, toast]
  );

  const handleFollowUserFromSheet = useCallback(() => {
    if (!selectedPost) return;
    const authorId = selectedPost.author.id;
    const authorUsername = selectedPost.author.username;
    const isCurrentlyFollowing = followedUsers.includes(authorId);
    handleFollowPress(authorId, authorUsername, isCurrentlyFollowing);
  }, [selectedPost, followedUsers, handleFollowPress]);

  const handleFollowTopicFromCard = useCallback(
    (topic: string, isCurrentlyFollowed: boolean) => {
      requireAuth(async () => {
        const action = isCurrentlyFollowed ? "Unfollowing" : "Following";
        const actionPast = isCurrentlyFollowed ? "Unfollowed" : "Now following";

        const toastId = toast.loading(
          `${action} #${topic}`,
          "Computing proof of work..."
        );

        setTimeout(async () => {
          try {
            await toggleFollowTopicMutation.mutateAsync({
              topic,
              isCurrentlyFollowing: isCurrentlyFollowed,
            });

            toast.update(toastId, {
              type: "success",
              title: `${actionPast} #${topic}`,
              description: undefined,
              duration: 3000,
            });

            setTimeout(() => toast.dismiss(toastId), 3000);
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const isAlreadyFollowed = errorMessage.toLowerCase().includes("already follow");
            const isNotFollowing =
              errorMessage.toLowerCase().includes("not following") ||
              errorMessage.includes("not in followed");

            if (isAlreadyFollowed || isNotFollowing) {
              toast.update(toastId, {
                type: "success",
                title: isAlreadyFollowed
                  ? `Already following #${topic}`
                  : `Already not following #${topic}`,
                description: undefined,
                duration: 3000,
              });
              setTimeout(() => toast.dismiss(toastId), 3000);
            } else {
              console.error("Follow/unfollow topic failed:", error);
              toast.update(toastId, {
                type: "error",
                title: `Failed to ${action.toLowerCase()} #${topic}`,
                description: "Please try again",
                duration: 4000,
              });
              setTimeout(() => toast.dismiss(toastId), 4000);
            }
          }
        }, 0);
      });
    },
    [requireAuth, toast, toggleFollowTopicMutation]
  );

  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((prev) => {
      const newSet = new Set(prev);
      newSet.add(postId);
      return newSet;
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    await tabbedFeedRef.current?.refresh();
  }, []);

  useEffect(() => {
    registerRefreshCallback(handleRefresh);
  }, [registerRefreshCallback, handleRefresh]);

  useEffect(() => {
    if (shouldScrollToTop) {
      tabbedFeedRef.current?.scrollToTop();
      clearScrollToTop();
    }
  }, [shouldScrollToTop, clearScrollToTop]);

  useEffect(() => {
    followLoadingUsersRef.current = followLoadingUsers;
  }, [followLoadingUsers]);

  const setCurrentUserId = useHomePostCardStore(
    (state) => state.setCurrentUserId
  );
  const setFollowedUsers = useHomePostCardStore(
    (state) => state.setFollowedUsers
  );
  const setFollowedTopicsStore = useHomePostCardStore(
    (state) => state.setFollowedTopics
  );
  const setFollowLoadingUsersStore = useHomePostCardStore(
    (state) => state.setFollowLoadingUsers
  );
  const setRevealedPostsStore = useHomePostCardStore(
    (state) => state.setRevealedPosts
  );
  const setHandlers = useHomePostCardStore((state) => state.setHandlers);
  const setShareServer = useHomePostCardStore((state) => state.setShareServer);
  const setAllowAutoplay = useHomePostCardStore((state) => state.setAllowAutoplay);
  const setActiveFeedScreen = useHomePostCardStore((state) => state.setActiveFeedScreen);
  const setDisabledTopicName = useHomePostCardStore((state) => state.setDisabledTopicName);

  const followedUsersSet = useMemo(() => new Set(followedUsers), [followedUsers]);
  const followedTopicsSet = useMemo(() => new Set(followedTopics), [followedTopics]);

  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType]
  );

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
    setFollowLoadingUsersStore(followLoadingUsers);
  }, [followLoadingUsers, setFollowLoadingUsersStore]);

  useEffect(() => {
    setRevealedPostsStore(revealedPosts);
  }, [revealedPosts, setRevealedPostsStore]);

  useEffect(() => {
    setShareServer(shareServer);
  }, [shareServer, setShareServer]);

  useEffect(() => {
    setAllowAutoplay(allowAutoplay);
  }, [allowAutoplay, setAllowAutoplay]);

  const isFocused = useIsFocused();

  useEffect(() => {
    setActiveFeedScreen(isFocused ? 'home' : null);
    if (isFocused) {
      setDisabledTopicName(undefined);
    }
  }, [isFocused, setActiveFeedScreen, setDisabledTopicName]);

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
      handleReportFromCard,
    };
  });

  useFocusEffect(
    useCallback(() => {
      setHandlers({
        onPostPress: (postId) => handlersRef.current.handlePostPress(postId),
        onAuthorPress: (authorId) => handlersRef.current.handleAuthorPress(authorId),
        onTopicPress: (topic) => handlersRef.current.handleTopicPress(topic),
        onMorePress: (postId) => handlersRef.current.handleMorePress(postId),
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
        onReport: (postId) => handlersRef.current.handleReportFromCard(postId),
      });
    }, [setHandlers])
  );

  if (!isLoggedIn && !isInitializing) {
    return <LoggedOutHome />;
  }

  return (
    <Box flex background="base">
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      <FeedHeader
        title="Mirage"
        balance={userStatus?.balance}
        onMenuPress={handleMenuPress}
        onSearchPress={() => router.push("/search")}
        animatedStyle={headerAnimatedStyle}
      />

      <HomeTabbedFeed ref={tabbedFeedRef} feedType="home" />

      <AdultContentPopup
        visible={showAdultPopup}
        onEnable={handleEnableAdultContent}
        onDecline={handleDeclineAdultContent}
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
        isSaved={selectedPost ? useSavedPostsStore.getState().isPostSaved(selectedPost.id) : false}
        onCopyText={handleCopyText}
        onReport={handleReport}
        onBlockUser={handleBlockUser}
        onHidePost={handleHidePost}
        onDelete={handleDeletePost}
        onDismiss={() => setSelectedPost(null)}
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

      <SideMenu
        ref={sideMenuRef}
        onSettings={handleMenuSettings}
        onSubscription={handleMenuSubscription}
        onSaved={handleMenuSaved}
        onHistory={handleMenuHistory}
        onDrafts={handleMenuDrafts}
        onFollowing={handleMenuFollowing}
        onTopics={handleMenuTopics}
        onInviteAndEarn={handleMenuInvite}
        onQuests={handleMenuQuests}
        onHelp={handleMenuHelp}
        onAbout={handleMenuAbout}
        onLogout={handleMenuLogout}
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
