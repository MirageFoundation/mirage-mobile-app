import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import {
  AdultContentPopup,
  FeedHeader,
  PostCard,
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

// Mock data for demonstration
const MOCK_POSTS: Post[] = [
  {
    id: "1",
    author: {
      id: "user1",
      username: "satoshi_fan",
      avatarSeed: "satoshi_fan",
    },
    title:
      "Bitcoin hits new all-time high as institutional adoption accelerates",
    body: "The cryptocurrency market is experiencing unprecedented growth as major financial institutions continue to embrace digital assets. This marks a significant shift in traditional finance's approach to blockchain technology.",
    topic: "Crypto",
    likes: 2847,
    dislikes: 124,
    comments: 356,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
  },
  {
    id: "2",
    author: {
      id: "user2",
      username: "tech_insider",
      avatarSeed: "tech_insider",
    },
    title: "Apple announces revolutionary new spatial computing platform",
    media: [
      {
        uri: "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800",
        type: "image",
        aspectRatio: 16 / 9,
      },
    ],
    topic: "Technology",
    likes: 5621,
    dislikes: 203,
    comments: 892,
    hasLiked: true,
    hasDisliked: false,
    isFollowing: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
  {
    id: "3",
    author: {
      id: "user3",
      username: "gamer_pro",
      avatarSeed: "gamer_pro",
    },
    title: "GTA 6 trailer breaks YouTube records with 200M views in 24 hours",
    body: "Rockstar Games has done it again. The highly anticipated trailer showcases stunning graphics, a return to Vice City, and introduces the franchise's first female protagonist.",
    media: [
      {
        uri: "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=800",
        type: "image",
        aspectRatio: 16 / 10,
      },
    ],
    topic: "Gaming",
    likes: 15420,
    dislikes: 342,
    comments: 2103,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
  },
  {
    id: "4",
    author: {
      id: "user4",
      username: "science_daily",
      avatarSeed: "science_daily",
    },
    title: "Scientists achieve breakthrough in nuclear fusion energy",
    body: "For the first time, researchers have produced more energy from fusion than was used to initiate the reaction. This could revolutionize clean energy production within the next decade.",
    topic: "Science",
    likes: 8932,
    dislikes: 56,
    comments: 1247,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
  },
  {
    id: "5",
    author: {
      id: "user5",
      username: "meme_lord",
      avatarSeed: "meme_lord",
    },
    title: "When you realize it's only Tuesday",
    media: [
      {
        uri: "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=800",
        type: "image",
        aspectRatio: 1,
      },
    ],
    topic: "Memes",
    likes: 34521,
    dislikes: 892,
    comments: 4521,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12), // 12 hours ago
  },
  {
    id: "6",
    author: {
      id: "user6",
      username: "world_news",
      avatarSeed: "world_news",
    },
    title: "Historic climate agreement reached at UN summit",
    body: "World leaders have agreed to unprecedented measures to combat climate change, including binding emissions targets and a $100 billion fund for developing nations.",
    topic: "News",
    likes: 6234,
    dislikes: 1203,
    comments: 2891,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18), // 18 hours ago
  },
  {
    id: "7",
    author: {
      id: "user7",
      username: "indie_filmmaker",
      avatarSeed: "indie_filmmaker",
    },
    title: "My first short film just got accepted into Sundance!",
    body: "After 3 years of work and countless rejections, I can't believe this is happening. Dreams do come true if you keep pushing. Thank you to everyone who believed in me!",
    media: [
      {
        uri: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800",
        type: "image",
        aspectRatio: 2.35,
      },
    ],
    topic: "Movies",
    likes: 12893,
    dislikes: 34,
    comments: 1567,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
  },
  {
    id: "8",
    author: {
      id: "user8",
      username: "space_enthusiast",
      avatarSeed: "space_enthusiast",
    },
    title: "SpaceX Starship completes first successful orbital flight",
    body: "The massive rocket completed a full orbit around Earth before landing back at the launch site. This marks a major milestone in humanity's quest to become a multi-planetary species.",
    media: [
      {
        uri: "https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?w=800",
        type: "image",
        aspectRatio: 16 / 9,
      },
    ],
    topic: "Space",
    likes: 28456,
    dislikes: 167,
    comments: 3421,
    hasLiked: false,
    hasDisliked: false,
    isFollowing: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36), // 1.5 days ago
  },
];

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Post>);

export function HomeScreen() {
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
  const currentUser = useAuthStore((s) => s.user);

  // Show adult content popup if user hasn't seen it
  // TODO: Remove `true ||` after testing
  const [showAdultPopup, setShowAdultPopup] = useState(
    true || !hasSeenAdultPrompt
  );

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

  // Local state for optimistic updates
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

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

  const ListEmptyComponent = useCallback(
    () => (
      <Box flex center p="lg">
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
    ),
    []
  );

  return (
    <Box flex background="base">
      {/* Fixed Status Bar Background */}
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      {/* Animated Header */}
      <FeedHeader
        title={getFeedTitle()}
        feedType={feedType}
        onFeedTypeChange={setFeedType}
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
        }}
        ListEmptyComponent={ListEmptyComponent}
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
