import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlatList } from "react-native";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  transformApiPosts,
  useInfinitePosts,
  useToggleFollowUser,
  useToggleFollowTopic,
  useUserFollowed,
} from "@/src/api";
import {
  ConfirmationPopup,
  type Post,
  PostCardSkeletonList,
  PostOptionsSheet,
  type PostOptionsSheetRef,
  ReportSheet,
  type ReportSheetRef,
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
import { useToast } from "@/src/providers/toast-provider";
import { HomePostList } from "./home/home-post-list";
import { useHomePostCardStore } from "./home/home-post-card-store";
import {
  getAllowedTagsFromContentTypes,
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useSavedPostsStore,
} from "@/src/stores";

export function TopicFeedScreen() {
  const { id: topicName } = useLocalSearchParams<{ id: string }>();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { requireAuth } = useAuthGuard();
  const toast = useToast();

  const flatListRef = useRef<FlatList<Post>>(null);
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);
  const hidePost = useContentModerationStore((s) => s.hidePost);
  const unhidePost = useContentModerationStore((s) => s.unhidePost);
  const blockUser = useContentModerationStore((s) => s.blockUser);

  const selectedContentTypes = usePreferencesStore(
    (s) => s.selectedContentTypes,
  );
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore(
    (s) => s.videoAutoplayNetwork,
  );
  const hideDownvotedPosts = usePreferencesStore((s) => s.hideDownvotedPosts);
  const currentUser = useAuthStore((s) => s.user);

  const { networkType } = useNetworkState();

  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData],
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData],
  );

  const toggleFollowMutation = useToggleFollowUser();
  const toggleFollowTopicMutation = useToggleFollowTopic();
  const toggleFollowAsyncRef = useRef(toggleFollowMutation.mutateAsync);

  useEffect(() => {
    toggleFollowAsyncRef.current = toggleFollowMutation.mutateAsync;
  }, [toggleFollowMutation.mutateAsync]);

  const [followLoadingUsers, setFollowLoadingUsers] = useState<Set<string>>(
    new Set(),
  );
  const followLoadingUsersRef = useRef<Set<string>>(new Set());

  const allowedTags = useMemo(
    () => getAllowedTagsFromContentTypes(selectedContentTypes),
    [selectedContentTypes],
  );

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePosts({
    limit: 20,
    topic: topicName,
    allowed_tags: allowedTags || undefined,
  });

  const posts = useMemo(() => {
    if (!data?.pages) return [];
    const allPosts = data.pages.flatMap((page) => page.posts);

    const uniquePostsMap = new Map<string, (typeof allPosts)[0]>();
    for (const post of allPosts) {
      if (!uniquePostsMap.has(post.post_id)) {
        uniquePostsMap.set(post.post_id, post);
      }
    }
    const uniquePosts = Array.from(uniquePostsMap.values());

    const filteredPosts = hideDownvotedPosts
      ? uniquePosts.filter((post) => post.user_vote !== -1)
      : uniquePosts;

    const transformedPosts = transformApiPosts(filteredPosts);

    return transformedPosts.filter(
      (post) =>
        !hiddenPostIds.has(post.id) && !blockedUserIds.has(post.author.id),
    );
  }, [data, hiddenPostIds, blockedUserIds, hideDownvotedPosts]);

  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const setVoteOverride = useHomePostCardStore(
    (state) => state.setVoteOverride,
  );
  const clearVoteOverride = useHomePostCardStore(
    (state) => state.clearVoteOverride,
  );

  const { handleUpvote, handleDownvote } = useVoteHandler({
    onOptimisticUpdate: useCallback(
      (targetId: string, result: VoteResult) => {
        setVoteOverride(targetId, {
          hasLiked: result.hasLiked,
          hasDisliked: result.hasDisliked,
          likeDelta: result.likeDelta,
        });
      },
      [setVoteOverride],
    ),
    onRollback: useCallback(
      (targetId: string) => {
        clearVoteOverride(targetId);
      },
      [clearVoteOverride],
    ),
  });

  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router],
  );

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      router.push(`/user/${authorId}`);
    },
    [router],
  );

  const handleTopicPress = useCallback(
    (topic: string) => {
      router.push(`/topic/${encodeURIComponent(topic)}`);
    },
    [router],
  );

  const postsByIdRef = useRef<Map<string, Post>>(new Map());

  useEffect(() => {
    const map = new Map<string, Post>();
    for (const post of posts) {
      map.set(post.id, post);
    }
    postsByIdRef.current = map;
  }, [posts]);

  const handleMorePress = useCallback((postId: string) => {
    const post = postsByIdRef.current.get(postId);
    if (post) {
      setSelectedPost(post);
      postOptionsSheetRef.current?.present();
    }
  }, []);

  const handleCommentPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router],
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
    [reportHandler, hidePost],
  );

  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet]);

  const handleFollowPress = useCallback(
    (
      authorId: string,
      authorUsername: string,
      isCurrentlyFollowing: boolean,
    ) => {
      if (followLoadingUsersRef.current.has(authorId)) {
        return;
      }

      requireAuth(async () => {
        const action = isCurrentlyFollowing ? "Unfollowing" : "Following";
        const actionPast = isCurrentlyFollowing ? "Unfollowed" : "Followed";

        const toastId = toast.loading(
          `${action} @${authorUsername}`,
          "Computing proof of work...",
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
            const isAlreadyFollowed = errorMessage
              .toLowerCase()
              .includes("already follow");
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
    [requireAuth, toast],
  );

  const handleReport = useCallback(() => {
    if (selectedPost) {
      reportHandler.requestReport(selectedPost.id, "post");
    }
  }, [selectedPost, reportHandler]);

  const handleBlockUser = useCallback(() => {
    if (selectedPost) {
      blockHandler.requestBlockUser(
        selectedPost.author.id,
        selectedPost.author.username,
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
    [blockHandler],
  );

  const handleBlockPostFromCard = useCallback(
    (postId: string) => {
      blockHandler.requestBlockPost(postId);
    },
    [blockHandler],
  );

  const handleReportFromCard = useCallback(
    (postId: string) => {
      reportHandler.requestReport(postId, "post");
    },
    [reportHandler],
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
      saved
        ? "You can find it in your saved items."
        : "Removed from saved items.",
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
        "Computing proof of work...",
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
          const isAlreadyFollowed = errorMessage
            .toLowerCase()
            .includes("already follow");
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
  }, [
    selectedPost?.topic,
    followedTopics,
    toggleFollowTopicMutation,
    toast,
    requireAuth,
  ]);

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
          "Computing proof of work...",
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
            const isAlreadyFollowed = errorMessage
              .toLowerCase()
              .includes("already follow");
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
    [requireAuth, toast, toggleFollowTopicMutation],
  );

  const handleShowFewer = useCallback(() => {
    toast.success("Got it", "We'll show fewer posts like this.");
  }, [toast]);

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((prev) => {
      const newSet = new Set(prev);
      newSet.add(postId);
      return newSet;
    });
  }, []);

  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.error("Failed to refresh topic feed:", error);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch]);

  useEffect(() => {
    followLoadingUsersRef.current = followLoadingUsers;
  }, [followLoadingUsers]);

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

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return <PostCardSkeletonList count={5} />;
    }

    if (isError) {
      return (
        <Box flex center p="lg" style={{ paddingTop: 100 }}>
          <Text size="lg" weight="medium" mode="subtle">
            Failed to load posts
          </Text>
          <Text
            size="sm"
            mode="subtle"
            style={{ marginTop: 8, textAlign: "center" }}
          >
            {error?.message || "Something went wrong. Pull to refresh."}
          </Text>
        </Box>
      );
    }

    return (
      <Box flex center p="lg" style={{ paddingTop: 100 }}>
        <Text size="lg" weight="medium" mode="subtle">
          No posts yet
        </Text>
        <Text
          size="sm"
          mode="subtle"
          style={{ marginTop: 8, textAlign: "center" }}
        >
          Be the first to post in #{topicName}!
        </Text>
      </Box>
    );
  }, [isLoading, isError, error, topicName]);

  const ListHeaderComponent = useCallback(() => {
    if (!isManualRefreshing) return null;
    return (
      <Box center p="md">
        <ActivityIndicator
          size="small"
          color={theme.colors.background.emphasis}
        />
      </Box>
    );
  }, [isManualRefreshing, theme.colors.background.emphasis]);

  const ListFooterComponent = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <Box center p="md">
        <ActivityIndicator size="small" color={theme.colors.brand[500]} />
      </Box>
    );
  }, [isFetchingNextPage, theme.colors.brand]);

  const HEADER_HEIGHT = 52;

  const listContentStyle = useMemo(
    () => ({
      paddingTop: insets.top + HEADER_HEIGHT,
      paddingBottom: insets.bottom + 16,
      flexGrow: posts.length === 0 ? 1 : undefined,
    }),
    [insets.bottom, insets.top, posts.length],
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={false}
        onRefresh={handleRefresh}
        tintColor="transparent"
        progressViewOffset={insets.top + HEADER_HEIGHT}
      />
    ),
    [handleRefresh, insets.top],
  );

  const setCurrentUserId = useHomePostCardStore(
    (state) => state.setCurrentUserId,
  );
  const setFollowedUsersStore = useHomePostCardStore(
    (state) => state.setFollowedUsers,
  );
  const setFollowedTopicsStore = useHomePostCardStore(
    (state) => state.setFollowedTopics,
  );
  const setFollowLoadingUsersStore = useHomePostCardStore(
    (state) => state.setFollowLoadingUsers,
  );
  const setRevealedPostsStore = useHomePostCardStore(
    (state) => state.setRevealedPosts,
  );
  const setHandlers = useHomePostCardStore((state) => state.setHandlers);
  const setShareServerStore = useHomePostCardStore(
    (state) => state.setShareServer,
  );
  const setAllowAutoplay = useHomePostCardStore(
    (state) => state.setAllowAutoplay,
  );
  const setFeedActive = useHomePostCardStore((state) => state.setFeedActive);
  const setDisabledTopicName = useHomePostCardStore(
    (state) => state.setDisabledTopicName,
  );

  const followedUsersSet = useMemo(
    () => new Set(followedUsers),
    [followedUsers],
  );
  const followedTopicsSet = useMemo(
    () => new Set(followedTopics),
    [followedTopics],
  );

  const allowAutoplay = useMemo(
    () =>
      shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType],
  );

  useEffect(() => {
    setCurrentUserId(currentUser?.id);
  }, [currentUser?.id, setCurrentUserId]);

  useEffect(() => {
    setFollowedUsersStore(followedUsersSet);
  }, [followedUsersSet, setFollowedUsersStore]);

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
    setShareServerStore(shareServer);
  }, [shareServer, setShareServerStore]);

  useEffect(() => {
    setAllowAutoplay(allowAutoplay);
  }, [allowAutoplay, setAllowAutoplay]);

  useFocusEffect(
    useCallback(() => {
      setFeedActive(true);
      setDisabledTopicName(topicName);
      return () => {
        setFeedActive(false);
        setDisabledTopicName(undefined);
      };
    }, [setFeedActive, setDisabledTopicName, topicName]),
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

  useEffect(() => {
    setHandlers({
      onPostPress: (postId) => handlersRef.current.handlePostPress(postId),
      onAuthorPress: (authorId) =>
        handlersRef.current.handleAuthorPress(authorId),
      onTopicPress: (topic) => handlersRef.current.handleTopicPress(topic),
      onMorePress: (postId) => handlersRef.current.handleMorePress(postId),
      onLikePress: (postId, liked, disliked, likes) =>
        handlersRef.current.handleUpvote(postId, liked, disliked, likes),
      onDislikePress: (postId, liked, disliked, likes) =>
        handlersRef.current.handleDownvote(postId, liked, disliked, likes),
      onCommentPress: (postId) =>
        handlersRef.current.handleCommentPress(postId),
      onFollowUser: (authorId, username, isFollowing) =>
        handlersRef.current.handleFollowPress(authorId, username, isFollowing),
      onFollowTopic: (topic, isFollowed) =>
        handlersRef.current.handleFollowTopicFromCard(topic, isFollowed),
      onRevealContent: (postId) =>
        handlersRef.current.handleRevealContent(postId),
      onBlockUser: (postId, authorId, authorUsername) =>
        handlersRef.current.handleBlockUserFromCard(
          postId,
          authorId,
          authorUsername,
        ),
      onBlockPost: (postId) =>
        handlersRef.current.handleBlockPostFromCard(postId),
      onReport: (postId) => handlersRef.current.handleReportFromCard(postId),
    });
  }, [setHandlers]);

  return (
    <Box flex background="base">
      <View
        style={[
          styles.headerContainer,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.text.default}
          />
        </Pressable>
        <Text
          size="xl"
          weight="bold"
          numberOfLines={1}
          style={styles.headerTitle}
        >
          #{topicName}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <HomePostList
        ref={flatListRef}
        data={posts}
        contentContainerStyle={listContentStyle}
        onScroll={() => {}}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        refreshControl={refreshControl}
        onEndReached={handleEndReached}
        onEndReachedThreshold={1.5}
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
        isSaved={
          selectedPost
            ? useSavedPostsStore.getState().isPostSaved(selectedPost.id)
            : false
        }
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
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: 0.5,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: theme.spacing.sm,
  },
  headerRight: {
    width: 40,
  },
}));
