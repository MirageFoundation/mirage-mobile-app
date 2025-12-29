import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { FeedHeader, PostCard, type Post } from "@/src/components/molecules";
import { Box, Button, Text } from "@/src/components/ui/primitives";
import { useAuthGuard } from "@/src/hooks";
import {
  HEADER_HEIGHT,
  TAB_BAR_HEIGHT,
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { useAuthStore } from "@/src/stores";

// Mock data for posts from followed users
const MOCK_FOLLOWING_POSTS: Post[] = [
  {
    id: "f1",
    author: {
      id: "user2",
      username: "tech_insider",
      avatarSeed: "tech_insider",
    },
    title:
      "Just got early access to the new M4 MacBook Pro - here are my first impressions",
    body: "The performance gains are insane. Compiling our entire codebase now takes 40% less time. The new display is also noticeably brighter.",
    media: [
      {
        uri: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800",
        type: "image",
        aspectRatio: 16 / 10,
      },
    ],
    topic: "Technology",
    likes: 1247,
    dislikes: 23,
    comments: 189,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 45), // 45 mins ago
  },
  {
    id: "f2",
    author: {
      id: "user6",
      username: "world_news",
      avatarSeed: "world_news",
    },
    title: "Breaking: Major economic policy announcement expected tomorrow",
    body: "Sources close to the administration suggest significant changes to interest rate policies are imminent. Markets are already reacting to the speculation.",
    topic: "News",
    likes: 3421,
    dislikes: 156,
    comments: 567,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 90), // 1.5 hours ago
  },
  {
    id: "f3",
    author: {
      id: "user2",
      username: "tech_insider",
      avatarSeed: "tech_insider",
    },
    title: "Thread: The complete history of Apple Silicon (2020-2024)",
    body: "From the M1 to the M4, here's how Apple transformed the computing industry in just 4 years. This is a story of ambition, engineering excellence, and calculated risk.",
    topic: "Technology",
    likes: 8934,
    dislikes: 89,
    comments: 1234,
    hasLiked: true,
    hasDisliked: false,
    isFollowing: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
  },
  {
    id: "f4",
    author: {
      id: "user6",
      username: "world_news",
      avatarSeed: "world_news",
    },
    title: "Live updates: International summit enters day 3",
    body: "Negotiations continue as world leaders work toward a comprehensive agreement on trade and climate policies.",
    media: [
      {
        uri: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800",
        type: "image",
        aspectRatio: 16 / 9,
      },
    ],
    topic: "News",
    likes: 2156,
    dislikes: 78,
    comments: 423,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
  },
];

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Post>);

export function FollowingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { scrollHandler, headerAnimatedStyle } = useScrollAnimationContext();
  const { requireAuth } = useAuthGuard();

  const currentUser = useAuthStore((s) => s.user);

  // Local state for optimistic updates
  const [posts, setPosts] = useState<Post[]>(MOCK_FOLLOWING_POSTS);
  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

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
    (postId: string) => {
      requireAuth(() => {
        setPosts((prev) =>
          prev.map((post) => {
            if (post.id !== postId) return post;

            const wasLiked = post.hasLiked;
            const wasDisliked = post.hasDisliked;

            return {
              ...post,
              hasLiked: !wasLiked,
              hasDisliked: false,
              likes: wasLiked ? post.likes - 1 : post.likes + 1,
              dislikes: wasDisliked ? post.dislikes - 1 : post.dislikes,
            };
          })
        );
      });
    },
    [requireAuth]
  );

  const handleDislikePress = useCallback(
    (postId: string) => {
      requireAuth(() => {
        setPosts((prev) =>
          prev.map((post) => {
            if (post.id !== postId) return post;

            const wasLiked = post.hasLiked;
            const wasDisliked = post.hasDisliked;

            return {
              ...post,
              hasDisliked: !wasDisliked,
              hasLiked: false,
              dislikes: wasDisliked ? post.dislikes - 1 : post.dislikes + 1,
              likes: wasLiked ? post.likes - 1 : post.likes,
            };
          })
        );
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
        setPosts((prev) =>
          prev.map((post) => {
            if (post.author.id !== authorId) return post;
            return {
              ...post,
              isFollowing: !post.isFollowing,
            };
          })
        );
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

  const renderPost = useCallback(
    ({ item: post }: { item: Post }) => (
      <PostCard
        post={post}
        isOwnPost={currentUser?.id === post.author.id}
        onPress={() => handlePostPress(post.id)}
        onAuthorPress={() => handleAuthorPress(post.author.id)}
        onMorePress={() => handleMorePress(post.id)}
        onLikePress={() => handleLikePress(post.id)}
        onDislikePress={() => handleDislikePress(post.id)}
        onCommentPress={() => handleCommentPress(post.id)}
        onFollowPress={() => handleFollowPress(post.author.id)}
        onRevealContent={() => handleRevealContent(post.id)}
        contentRevealed={revealedPosts.has(post.id)}
        shareUrl={`https://mirage.app/post/${post.id}`}
      />
    ),
    [
      currentUser,
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

  // Empty state for logged-in users with no following
  const ListEmptyComponent = useCallback(
    () => (
      <Box flex center p="lg" style={styles.emptyContainer}>
        <Text size="xl" weight="semibold" style={{ marginTop: 16 }}>
          No posts yet
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{ marginTop: 8, textAlign: "center", maxWidth: 280 }}
        >
          Follow some people to see their posts here
        </Text>
        <Button
          size="lg"
          mode="brand"
          style={{ marginTop: 24 }}
          onPress={() => router.push("/")}
        >
          <Button.Text>Discover People</Button.Text>
        </Button>
      </Box>
    ),
    [router]
  );

  return (
    <Box flex background="base">
      {/* Fixed Status Bar Background */}
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      {/* Animated Header */}
      <FeedHeader title="Following" animatedStyle={headerAnimatedStyle} />

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
