import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useInfinitePosts, transformApiPosts } from "@/src/api";
import {
  AdultContentPopup,
  FeedHeader,
  PostCard,
  PostCardSkeletonList,
  type Post,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { useAuthGuard } from "@/src/hooks";
import {
  HEADER_HEIGHT,
  TAB_BAR_HEIGHT,
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { useAuthStore, usePreferencesStore } from "@/src/stores";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Post>);

export function HomeScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { scrollHandler, headerAnimatedStyle } = useScrollAnimationContext();
  const { requireAuth } = useAuthGuard();

  const feedType = usePreferencesStore((s) => s.feedType);
  const setFeedType = usePreferencesStore((s) => s.setFeedType);
  const hasSeenAdultPrompt = usePreferencesStore((s) => s.hasSeenAdultPrompt);
  const setHasSeenAdultPrompt = usePreferencesStore(
    (s) => s.setHasSeenAdultPrompt
  );
  const setAdultContent = usePreferencesStore((s) => s.setAdultContent);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const currentUser = useAuthStore((s) => s.user);

  // Show adult content popup if user hasn't seen it
  // TODO: Remove `true ||` after testing
  const [showAdultPopup, setShowAdultPopup] = useState(
    true || !hasSeenAdultPrompt
  );

  // Map feed type to API sort parameter
  const getSortBy = () => {
    switch (feedType) {
      case "popular":
        return "top" as const;
      case "latest":
        return "new" as const;
      default:
        return "magic" as const;
    }
  };

  // Fetch posts from API
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
    by: getSortBy(),
    topic: "all",
    allowed_tags: adultContentEnabled ? "sensitive,adult,nsfw" : "sensitive",
  });

  // Transform API data to UI format
  const posts = useMemo(() => {
    if (!data?.pages) return [];
    const allPosts = data.pages.flatMap((page) => page.posts);
    return transformApiPosts(allPosts);
  }, [data]);

  // Revealed posts for content warnings
  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  // Optimistic updates for votes (local state overlay)
  const [voteOverrides, setVoteOverrides] = useState<
    Record<string, { hasLiked?: boolean; hasDisliked?: boolean }>
  >({});

  const handleEnableAdultContent = useCallback(() => {
    setAdultContent(true);
    setHasSeenAdultPrompt();
    setShowAdultPopup(false);
  }, [setAdultContent, setHasSeenAdultPrompt]);

  const handleDeclineAdultContent = useCallback(() => {
    setAdultContent(false);
    setHasSeenAdultPrompt();
    setShowAdultPopup(false);
  }, [setAdultContent, setHasSeenAdultPrompt]);

  const getFeedTitle = () => {
    switch (feedType) {
      case "popular":
        return "Popular";
      case "latest":
        return "Latest";
      case "news":
        return "News";
      case "watch":
        return "Watch";
      default:
        return "Mirage";
    }
  };

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
    (postId: string, currentlyLiked: boolean, currentlyDisliked: boolean) => {
      requireAuth(() => {
        // Optimistic update
        setVoteOverrides((prev) => ({
          ...prev,
          [postId]: {
            hasLiked: !currentlyLiked,
            hasDisliked: false,
          },
        }));
        // TODO: Call vote mutation API
      });
    },
    [requireAuth]
  );

  const handleDislikePress = useCallback(
    (postId: string, currentlyLiked: boolean, currentlyDisliked: boolean) => {
      requireAuth(() => {
        // Optimistic update
        setVoteOverrides((prev) => ({
          ...prev,
          [postId]: {
            hasLiked: false,
            hasDisliked: !currentlyDisliked,
          },
        }));
        // TODO: Call vote mutation API
      });
    },
    [requireAuth]
  );

  const handleCommentPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router]
  );

  const handleFollowPress = useCallback(
    (authorId: string) => {
      requireAuth(() => {
        // TODO: Call follow mutation API
        console.log("Follow author:", authorId);
      });
    },
    [requireAuth]
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

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Apply vote overrides to posts
  const getPostWithOverrides = useCallback(
    (post: Post): Post => {
      const override = voteOverrides[post.id];
      if (!override) return post;
      return {
        ...post,
        hasLiked: override.hasLiked ?? post.hasLiked,
        hasDisliked: override.hasDisliked ?? post.hasDisliked,
      };
    },
    [voteOverrides]
  );

  const renderPost = useCallback(
    ({ item: post }: { item: Post }) => {
      const postWithOverrides = getPostWithOverrides(post);
      return (
        <PostCard
          post={postWithOverrides}
          isOwnPost={currentUser?.id === post.author.id}
          onPress={() => handlePostPress(post.id)}
          onAuthorPress={() => handleAuthorPress(post.author.id)}
          onMorePress={() => handleMorePress(post.id)}
          onLikePress={() =>
            handleLikePress(
              post.id,
              postWithOverrides.hasLiked ?? false,
              postWithOverrides.hasDisliked ?? false
            )
          }
          onDislikePress={() =>
            handleDislikePress(
              post.id,
              postWithOverrides.hasLiked ?? false,
              postWithOverrides.hasDisliked ?? false
            )
          }
          onCommentPress={() => handleCommentPress(post.id)}
          onFollowPress={() => handleFollowPress(post.author.id)}
          onRevealContent={() => handleRevealContent(post.id)}
          contentRevealed={revealedPosts.has(post.id)}
          shareUrl={`https://mirage.app/post/${post.id}`}
        />
      );
    },
    [
      currentUser,
      getPostWithOverrides,
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
          Be the first to share something interesting!
        </Text>
      </Box>
    );
  }, [isLoading, isError, error]);

  const ListFooterComponent = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <Box center p="md">
        <ActivityIndicator size="small" color={theme.colors.brand[500]} />
      </Box>
    );
  }, [isFetchingNextPage, theme.colors.brand]);

  return (
    <Box flex background="base">
      {/* Fixed Status Bar Background */}
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      {/* Animated Header */}
      <FeedHeader
        title={getFeedTitle()}
        feedType={feedType}
        onFeedTypeChange={setFeedType}
        onSearchPress={() => router.push("/search")}
        animatedStyle={headerAnimatedStyle}
      />

      {/* Scrollable Feed */}
      <AnimatedFlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={keyExtractor}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + HEADER_HEIGHT,
          paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
          flexGrow: posts.length === 0 ? 1 : undefined,
        }}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading && posts.length > 0}
            onRefresh={handleRefresh}
            tintColor={theme.colors.brand[500]}
            progressViewOffset={insets.top + HEADER_HEIGHT}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={7}
        initialNumToRender={5}
        getItemLayout={undefined} // Can't use with variable height items
      />

      {/* Adult Content Permission Popup */}
      <AdultContentPopup
        visible={showAdultPopup}
        onEnable={handleEnableAdultContent}
        onDecline={handleDeclineAdultContent}
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
