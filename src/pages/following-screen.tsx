import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  transformApiPosts,
  useInfinitePosts,
  useToggleFollowUser,
  useUserFollowed,
} from "@/src/api";
import {
  FeedHeader,
  PostCardItem,
  PostCardSkeletonList,
  type Post,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { useAuthGuard, useVoteHandler, type VoteResult } from "@/src/hooks";
import {
  HEADER_HEIGHT,
  TAB_BAR_HEIGHT,
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { useToast } from "@/src/providers/toast-provider";
import {
  getAllowedTagsFromContentTypes,
  getShareBaseUrl,
  useAuthStore,
  usePreferencesStore,
} from "@/src/stores";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Post>);

export function FollowingScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    scrollHandler,
    headerAnimatedStyle,
    registerScrollRef,
    registerRefreshCallback,
  } = useScrollAnimationContext();
  const { requireAuth, isLoggedIn } = useAuthGuard();

  const currentUser = useAuthStore((s) => s.user);
  const selectedContentTypes = usePreferencesStore(
    (s) => s.selectedContentTypes
  );
  const shareServer = usePreferencesStore((s) => s.shareServer);

  const allowedTags = useMemo(
    () => getAllowedTagsFromContentTypes(selectedContentTypes),
    [selectedContentTypes]
  );

  // Ref for FlatList to enable scroll-to-top
  const flatListRef = useRef<FlatList<Post>>(null);

  // Fetch user's followed list (for showing "Following" status on posts)
  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData]
  );

  // Follow/unfollow mutation
  const toggleFollowMutation = useToggleFollowUser();

  // Track which users are currently being followed/unfollowed (for loading state)
  const [followLoadingUsers, setFollowLoadingUsers] = useState<Set<string>>(
    new Set()
  );

  // Fetch posts from API
  const {
    data,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePosts({
    limit: 20,
    feed: "following",
    by: "magic",
    allowed_tags: allowedTags || undefined,
  });

  // Transform API data to UI format (includes following status)
  const posts = useMemo(() => {
    if (!data?.pages) return [];
    const allPosts = data.pages.flatMap((page) => page.posts);

    // Deduplicate posts by post_id (in case same post appears in multiple pages)
    const uniquePostsMap = new Map<string, (typeof allPosts)[0]>();
    for (const post of allPosts) {
      if (!uniquePostsMap.has(post.post_id)) {
        uniquePostsMap.set(post.post_id, post);
      }
    }
    const uniquePosts = Array.from(uniquePostsMap.values());

    return transformApiPosts(uniquePosts, { followedUsers });
  }, [data, followedUsers]);

  // Revealed posts for content warnings
  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  // Optimistic updates for votes (local state overlay)
  const [voteOverrides, setVoteOverrides] = useState<
    Record<
      string,
      { hasLiked?: boolean; hasDisliked?: boolean; likeDelta?: number }
    >
  >({});

  // Vote handler with toast notifications
  const voteHandler = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
      setVoteOverrides((prev) => {
        const currentDelta = prev[targetId]?.likeDelta ?? 0;
        return {
          ...prev,
          [targetId]: {
            hasLiked: result.hasLiked,
            hasDisliked: result.hasDisliked,
            likeDelta: currentDelta + result.likeDelta,
          },
        };
      });
    }, []),
    onRollback: useCallback((targetId: string) => {
      // Revert to previous state by removing the override
      setVoteOverrides((prev) => {
        const newOverrides = { ...prev };
        delete newOverrides[targetId];
        return newOverrides;
      });
    }, []),
  });

  const postsWithOverrides = useMemo(() => {
    if (!posts.length) return posts;
    return posts.map((post) => {
      const override = voteOverrides[post.id];
      if (!override) return post;
      return {
        ...post,
        likes: post.likes + (override.likeDelta ?? 0),
        hasLiked: override.hasLiked ?? post.hasLiked,
        hasDisliked: override.hasDisliked ?? post.hasDisliked,
      };
    });
  }, [posts, voteOverrides]);

  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router]
  );

  const handleAuthorPress = useCallback((authorId: string) => {
    // TODO: Navigate to user profile
    console.log("Navigate to author:", authorId);
  }, []);

  const handleMorePress = useCallback((postId: string) => {
    // TODO: Show post options sheet
    console.log("More options for post:", postId);
  }, []);

  const handleLikePress = useCallback(
    (
      postId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number
    ) => {
      voteHandler.handleUpvote(
        postId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes
      );
    },
    [voteHandler]
  );

  const handleDislikePress = useCallback(
    (
      postId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number
    ) => {
      voteHandler.handleDownvote(
        postId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes
      );
    },
    [voteHandler]
  );

  const handleCommentPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router]
  );

  const toast = useToast();

  const handleFollowPress = useCallback(
    (
      authorId: string,
      authorUsername: string,
      isCurrentlyFollowing: boolean
    ) => {
      // Prevent double-clicks while loading
      if (followLoadingUsers.has(authorId)) {
        return;
      }

      requireAuth(async () => {
        // Add to loading state
        setFollowLoadingUsers((prev) => new Set(prev).add(authorId));

        const action = isCurrentlyFollowing ? "Unfollowing" : "Following";
        const actionPast = isCurrentlyFollowing ? "Unfollowed" : "Followed";

        // Show initial loading toast
        const toastId = toast.loading(
          `${action} @${authorUsername}`,
          "Computing proof of work..."
        );

        try {
          await toggleFollowMutation.mutateAsync({
            userAddress: authorId,
            isCurrentlyFollowing,
          });

          // Update to success
          toast.update(toastId, {
            type: "success",
            title: `${actionPast} @${authorUsername}`,
            description: undefined,
            duration: 3000,
          });

          // Auto dismiss after duration
          setTimeout(() => toast.dismiss(toastId), 3000);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const isAlreadyFollowed =
            errorMessage.includes("already followed") ||
            errorMessage.includes("400");
          const isNotFollowing =
            errorMessage.includes("not following") ||
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
          // Remove from loading state
          setFollowLoadingUsers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(authorId);
            return newSet;
          });
        }
      });
    },
    [requireAuth, toggleFollowMutation, followLoadingUsers, toast]
  );

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((prev) => {
      const newSet = new Set(prev);
      newSet.add(postId);
      return newSet;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Register scroll ref and refresh callback for tab press scroll-to-top
  useEffect(() => {
    registerScrollRef(flatListRef.current);
    registerRefreshCallback(handleRefresh);
  }, [registerScrollRef, registerRefreshCallback, handleRefresh]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderPost = useCallback(
    ({ item: post }: { item: Post }) => {
      const isFollowLoading = followLoadingUsers.has(post.author.id);

      return (
        <PostCardItem
          post={post}
          isOwnPost={currentUser?.id === post.author.id}
          onPostPress={handlePostPress}
          onAuthorPress={handleAuthorPress}
          onMorePress={handleMorePress}
          onLikePress={handleLikePress}
          onDislikePress={handleDislikePress}
          onCommentPress={handleCommentPress}
          onFollowPress={handleFollowPress}
          onRevealContent={handleRevealContent}
          contentRevealed={revealedPosts.has(post.id)}
          followLoading={isFollowLoading}
          shareUrl={`${getShareBaseUrl(shareServer)}/post/${post.id}`}
        />
      );
    },
    [
      currentUser,
      followLoadingUsers,
      handlePostPress,
      handleAuthorPress,
      handleMorePress,
      handleLikePress,
      handleDislikePress,
      handleCommentPress,
      handleFollowPress,
      handleRevealContent,
      revealedPosts,
    ]
  );

  const keyExtractor = useCallback((item: Post) => item.id, []);

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return <PostCardSkeletonList count={5} />;
    }

    if (!isLoggedIn) {
      return (
        <Box flex center p="lg" style={styles.emptyContainer}>
          <Text size="xl" weight="semibold" style={{ marginTop: 16 }}>
            Follow people and topics
          </Text>
          <Text
            size="md"
            mode="subtle"
            style={{ marginTop: 8, textAlign: "center", maxWidth: 280 }}
          >
            Sign in and follow creators or topics to build your feed.
          </Text>
        </Box>
      );
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
      <Box flex center p="lg" style={styles.emptyContainer}>
        <Text size="xl" weight="semibold" style={{ marginTop: 16 }}>
          No posts yet
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{ marginTop: 8, textAlign: "center", maxWidth: 280 }}
        >
          Follow some people or topics to see posts here
        </Text>
      </Box>
    );
  }, [isLoading, isLoggedIn, isError, error]);

  const ListHeaderComponent = useCallback(() => {
    if (!isRefetching) return null;
    return (
      <Box center p="md">
        <ActivityIndicator
          size="small"
          color={theme.colors.background.emphasis}
        />
      </Box>
    );
  }, [isRefetching, theme.colors.brand]);

  const ListFooterComponent = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <Box center p="md">
        <ActivityIndicator size="small" color={theme.colors.brand[500]} />
      </Box>
    );
  }, [isFetchingNextPage, theme.colors.brand]);

  const listContentStyle = useMemo(
    () => ({
      paddingTop: insets.top + HEADER_HEIGHT,
      paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
      flexGrow: postsWithOverrides.length === 0 ? 1 : undefined,
    }),
    [insets.bottom, insets.top, postsWithOverrides.length]
  );

  return (
    <Box flex background="base">
      {/* Fixed Status Bar Background */}
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      {/* Animated Header */}
      <FeedHeader title="Following" animatedStyle={headerAnimatedStyle} />

      {/* Scrollable Feed */}
      <AnimatedFlatList
        ref={flatListRef}
        data={postsWithOverrides}
        renderItem={renderPost}
        keyExtractor={keyExtractor}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor="transparent"
            progressViewOffset={insets.top + HEADER_HEIGHT}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={7}
        initialNumToRender={5}
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
  },
}));
