import { Avatar } from "@/src/components/atoms";
import {
  Comment,
  CommentInput,
  CommentOptionsSheet,
  CommentOptionsSheetRef,
  CommentThread,
  PostCard,
  type Post,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { useAuthGuard } from "@/src/hooks";
import { useAuthStore, useUIStore } from "@/src/stores";
import {
  AntDesign,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Mock data for demonstration
const MOCK_POST: Post = {
  id: "1",
  author: {
    id: "user1",
    username: "satoshi_fan",
    avatarSeed: "satoshi_fan",
  },
  title: "Bitcoin hits new all-time high as institutional adoption accelerates",
  body: "The cryptocurrency market is experiencing unprecedented growth as major financial institutions continue to embrace digital assets. This marks a significant shift in traditional finance's approach to blockchain technology.\n\nMajor banks and hedge funds have increased their Bitcoin holdings significantly, with several announcing plans to offer crypto custody services to their clients. This institutional interest is seen as a key driver behind the recent price surge.\n\nAnalysts predict this trend will continue as regulatory clarity improves globally.",
  topic: "Crypto",
  likes: 2847,
  dislikes: 124,
  comments: 356,
  hasLiked: false,
  hasDisliked: false,
  isFollowing: false,
  createdAt: new Date(Date.now() - 1000 * 60 * 30),
};

const MOCK_COMMENTS: Comment[] = [
  {
    id: "c1",
    author: {
      id: "user2",
      username: "crypto_whale",
      avatarSeed: "crypto_whale",
    },
    content:
      "This is huge! Finally seeing mainstream adoption happening. Been waiting for this moment for years.",
    likes: 234,
    dislikes: 12,
    hasLiked: false,
    hasDisliked: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 15),
    replyCount: 3,
    replies: [
      {
        id: "c1-r1",
        author: {
          id: "user3",
          username: "btc_maximalist",
          avatarSeed: "btc_maximalist",
        },
        content:
          "Same here! Been HODLing since 2017. Feels good to be validated.",
        likes: 45,
        dislikes: 2,
        hasLiked: false,
        hasDisliked: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 10),
        replyCount: 1,
        parentId: "c1",
        replies: [
          {
            id: "c1-r1-r1",
            author: {
              id: "user4",
              username: "moon_soon",
              avatarSeed: "moon_soon",
            },
            content: "Diamond hands pay off! 💎🙌",
            likes: 23,
            dislikes: 0,
            hasLiked: true,
            hasDisliked: false,
            createdAt: new Date(Date.now() - 1000 * 60 * 5),
            replyCount: 0,
            parentId: "c1-r1",
          },
        ],
      },
      {
        id: "c1-r2",
        author: {
          id: "user5",
          username: "trading_guru",
          avatarSeed: "trading_guru",
        },
        content:
          "The institutional money flow is just beginning. We'll see much higher levels.",
        likes: 67,
        dislikes: 5,
        hasLiked: false,
        hasDisliked: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 8),
        replyCount: 0,
        parentId: "c1",
      },
    ],
  },
  {
    id: "c2",
    author: {
      id: "user6",
      username: "skeptical_sam",
      avatarSeed: "skeptical_sam",
    },
    content:
      "I'm still not convinced this is sustainable. We've seen these pumps before. What makes this time different?",
    likes: 89,
    dislikes: 45,
    hasLiked: false,
    hasDisliked: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 25),
    replyCount: 2,
    replies: [
      {
        id: "c2-r1",
        author: {
          id: "user7",
          username: "analyst_pro",
          avatarSeed: "analyst_pro",
        },
        content:
          "The difference is institutional involvement. This isn't retail FOMO anymore - it's calculated allocation by major funds with long-term strategies.",
        likes: 156,
        dislikes: 8,
        hasLiked: false,
        hasDisliked: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 20),
        replyCount: 0,
        parentId: "c2",
      },
      {
        id: "c2-r2",
        author: {
          id: "user1",
          username: "satoshi_fan",
          avatarSeed: "satoshi_fan",
        },
        content:
          "Fair point, but the fundamentals are much stronger now. ETF approvals, corporate treasury adoption, and improving regulatory framework all point to maturity.",
        likes: 78,
        dislikes: 3,
        hasLiked: false,
        hasDisliked: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 18),
        replyCount: 0,
        parentId: "c2",
      },
    ],
  },
  {
    id: "c3",
    author: { id: "user8", username: "defi_degen", avatarSeed: "defi_degen" },
    content:
      "This is just the beginning. Wait until the ETH ETF gets approved too! 🚀",
    likes: 312,
    dislikes: 28,
    hasLiked: false,
    hasDisliked: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 45),
    replyCount: 0,
  },
  {
    id: "c4",
    author: {
      id: "user9",
      username: "risk_manager",
      avatarSeed: "risk_manager",
    },
    content:
      "Important to remember: position sizing is key. Don't invest more than you can afford to lose, regardless of how bullish the market looks.",
    likes: 445,
    dislikes: 12,
    hasLiked: false,
    hasDisliked: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60),
    replyCount: 0,
  },
];

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const { requireAuth, isLoggedIn } = useAuthGuard();

  const currentUser = useAuthStore((s) => s.user);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const optionsSheetRef = useRef<CommentOptionsSheetRef>(null);

  // Local state
  const [post, setPost] = useState<Post>(MOCK_POST);
  const [comments, setComments] = useState<Comment[]>(MOCK_COMMENTS);
  const [revealedContent, setRevealedContent] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handlers
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleLikePost = useCallback(() => {
    requireAuth(() => {
      setPost((prev) => ({
        ...prev,
        hasLiked: !prev.hasLiked,
        hasDisliked: false,
        likes: prev.hasLiked ? prev.likes - 1 : prev.likes + 1,
        dislikes: prev.hasDisliked ? prev.dislikes - 1 : prev.dislikes,
      }));
    });
  }, [requireAuth]);

  const handleDislikePost = useCallback(() => {
    requireAuth(() => {
      setPost((prev) => ({
        ...prev,
        hasDisliked: !prev.hasDisliked,
        hasLiked: false,
        dislikes: prev.hasDisliked ? prev.dislikes - 1 : prev.dislikes + 1,
        likes: prev.hasLiked ? prev.likes - 1 : prev.likes,
      }));
    });
  }, [requireAuth]);

  const handleFollowPost = useCallback(() => {
    requireAuth(() => {
      setPost((prev) => ({
        ...prev,
        isFollowing: !prev.isFollowing,
      }));
    });
  }, [requireAuth]);

  const handleRevealContent = useCallback(() => {
    setRevealedContent(true);
  }, []);

  // Comment handlers
  const updateCommentInList = useCallback(
    (
      commentId: string,
      updater: (comment: Comment) => Comment,
      commentList: Comment[] = comments
    ): Comment[] => {
      return commentList.map((comment) => {
        if (comment.id === commentId) {
          return updater(comment);
        }
        if (comment.replies) {
          return {
            ...comment,
            replies: updateCommentInList(commentId, updater, comment.replies),
          };
        }
        return comment;
      });
    },
    [comments]
  );

  const handleLikeComment = useCallback(
    (commentId: string) => {
      requireAuth(() => {
        setComments((prev) =>
          updateCommentInList(commentId, (comment) => ({
            ...comment,
            hasLiked: !comment.hasLiked,
            hasDisliked: false,
            likes: comment.hasLiked ? comment.likes - 1 : comment.likes + 1,
            dislikes: comment.hasDisliked
              ? comment.dislikes - 1
              : comment.dislikes,
          }))
        );
      });
    },
    [requireAuth, updateCommentInList]
  );

  const handleDislikeComment = useCallback(
    (commentId: string) => {
      requireAuth(() => {
        setComments((prev) =>
          updateCommentInList(commentId, (comment) => ({
            ...comment,
            hasDisliked: !comment.hasDisliked,
            hasLiked: false,
            dislikes: comment.hasDisliked
              ? comment.dislikes - 1
              : comment.dislikes + 1,
            likes: comment.hasLiked ? comment.likes - 1 : comment.likes,
          }))
        );
      });
    },
    [requireAuth, updateCommentInList]
  );

  const handleReplyToComment = useCallback(
    (comment: Comment) => {
      requireAuth(() => {
        setReplyingTo(comment);
      });
    },
    [requireAuth]
  );

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleMoreOptions = useCallback((comment: Comment) => {
    setSelectedComment(comment);
    optionsSheetRef.current?.present();
  }, []);

  const handleSubmitComment = useCallback(
    async (text: string) => {
      if (!currentUser) return;

      setIsSubmitting(true);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      const newComment: Comment = {
        id: `c${Date.now()}`,
        author: {
          id: currentUser.id,
          username: currentUser.username,
          avatarSeed: currentUser.username,
        },
        content: text,
        likes: 0,
        dislikes: 0,
        hasLiked: false,
        hasDisliked: false,
        createdAt: new Date(),
        replyCount: 0,
        parentId: replyingTo?.id ?? null,
      };

      if (replyingTo) {
        // Add as a reply
        setComments((prev) =>
          updateCommentInList(replyingTo.id, (comment) => ({
            ...comment,
            replyCount: (comment.replyCount ?? 0) + 1,
            replies: [...(comment.replies ?? []), newComment],
          }))
        );
      } else {
        // Add as top-level comment
        setComments((prev) => [newComment, ...prev]);
      }

      setPost((prev) => ({ ...prev, comments: prev.comments + 1 }));
      setReplyingTo(null);
      setIsSubmitting(false);
    },
    [currentUser, replyingTo, updateCommentInList]
  );

  const handleDeleteComment = useCallback(() => {
    if (!selectedComment) return;

    const removeComment = (
      commentId: string,
      commentList: Comment[]
    ): Comment[] => {
      return commentList
        .filter((c) => c.id !== commentId)
        .map((c) => ({
          ...c,
          replies: c.replies ? removeComment(commentId, c.replies) : undefined,
        }));
    };

    setComments((prev) => removeComment(selectedComment.id, prev));
    setPost((prev) => ({ ...prev, comments: prev.comments - 1 }));
    setSelectedComment(null);
  }, [selectedComment]);

  // Stable header background color based on post ID
  const headerColor = useMemo(() => {
    const colors = [
      "#FF6B6B", // Coral red
      "#4ECDC4", // Teal
      "#45B7D1", // Sky blue
      "#96CEB4", // Sage green
      "#FFEAA7", // Soft yellow
      "#DDA0DD", // Plum
      "#98D8C8", // Mint
      "#F7DC6F", // Mustard
      "#BB8FCE", // Lavender
      "#85C1E9", // Light blue
      "#F8B500", // Golden
      "#FF8C00", // Dark orange
    ];
    // Generate a stable index based on post ID
    const hash = (id ?? "0")
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }, [id]);

  // Header action handlers
  const handleSearch = useCallback(() => {
    // TODO: Implement search
    console.log("Search pressed");
  }, []);

  const handleSort = useCallback(() => {
    // TODO: Implement sort options
    console.log("Sort pressed");
  }, []);

  const handleHeaderMore = useCallback(() => {
    // TODO: Implement more options
    console.log("More options pressed");
  }, []);

  const handleProfilePress = useCallback(() => {
    // TODO: Navigate to profile
    console.log("Profile pressed");
  }, []);

  // Render header (close button + right icons)
  const renderHeader = useMemo(
    () => (
      <View
        style={[
          styles.header,
          { paddingTop: insets.top, backgroundColor: headerColor },
        ]}
      >
        {/* Left: Close button */}
        <Pressable onPress={handleBack} style={styles.headerButton}>
          <AntDesign name="close" size={22} color="#FFFFFF" />
        </Pressable>

        {/* Spacer */}
        <View style={styles.headerSpacer} />

        {/* Right: Action icons + Avatar */}
        <View style={styles.headerActions}>
          <Pressable onPress={handleSearch} style={styles.headerButton}>
            <Ionicons name="search-outline" size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable onPress={handleSort} style={styles.headerButton}>
            <MaterialCommunityIcons name="sort" size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable onPress={handleHeaderMore} style={styles.headerButton}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
          </Pressable>

          <Pressable onPress={handleProfilePress} style={styles.avatarButton}>
            <Avatar size="sm" seed={currentUser?.username ?? "guest"} />
          </Pressable>
        </View>
      </View>
    ),
    [
      insets.top,
      headerColor,
      handleBack,
      handleSearch,
      handleSort,
      handleHeaderMore,
      handleProfilePress,
      currentUser,
    ]
  );

  // Render list header (post + divider)
  const renderListHeader = useCallback(
    () => (
      <View>
        {/* Full post card */}
        <PostCard
          post={post}
          isOwnPost={currentUser?.id === post.author.id}
          onLikePress={handleLikePost}
          onDislikePress={handleDislikePost}
          onFollowPress={handleFollowPost}
          onRevealContent={handleRevealContent}
          contentRevealed={revealedContent}
          shareUrl={`https://mirage.app/post/${id}`}
        />

        {/* Divider below post */}
        <View style={styles.divider} />
      </View>
    ),
    [
      post,
      currentUser,
      handleLikePost,
      handleDislikePost,
      handleFollowPost,
      handleRevealContent,
      revealedContent,
      id,
    ]
  );

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentThread
        comment={item}
        currentUserId={currentUser?.id}
        onAuthorPress={(authorId) => {
          // TODO: Navigate to user profile
          console.log("Navigate to author:", authorId);
        }}
        onLikePress={handleLikeComment}
        onDislikePress={handleDislikeComment}
        onReplyPress={handleReplyToComment}
        onMorePress={handleMoreOptions}
        showDivider={true}
      />
    ),
    [
      currentUser,
      handleLikeComment,
      handleDislikeComment,
      handleReplyToComment,
      handleMoreOptions,
    ]
  );

  const renderEmptyComments = useCallback(
    () => (
      <Box flex center p="lg">
        <Ionicons
          name="chatbubbles-outline"
          size={48}
          color={theme.colors.text.subtle}
        />
        <Text size="md" weight="medium" mode="subtle" style={{ marginTop: 12 }}>
          No comments yet
        </Text>
        <Text
          size="sm"
          mode="subtle"
          style={{ marginTop: 4, textAlign: "center" }}
        >
          Be the first to share your thoughts!
        </Text>
      </Box>
    ),
    [theme.colors.text.subtle]
  );

  const keyExtractor = useCallback((item: Comment) => item.id, []);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <Box flex background="base">
        {/* Header */}
        {renderHeader}

        {/* Comments list */}
        <FlatList
          data={comments}
          renderItem={renderComment}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmptyComments}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 60,
          }}
          showsVerticalScrollIndicator={false}
        />

        {/* Comment input */}
        <CommentInput
          isLoggedIn={isLoggedIn}
          onAuthRequired={showAuthSheet}
          replyingTo={replyingTo?.author.username}
          onCancelReply={handleCancelReply}
          onSubmit={handleSubmitComment}
          loading={isSubmitting}
        />

        {/* Comment options sheet */}
        <CommentOptionsSheet
          ref={optionsSheetRef}
          comment={selectedComment}
          isOwnComment={currentUser?.id === selectedComment?.author.id}
          onDelete={handleDeleteComment}
          onDismiss={() => setSelectedComment(null)}
        />
      </Box>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create((theme) => ({
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.background.default,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  avatarButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 5,
    backgroundColor: theme.colors.background.subtle,
  },
}));
