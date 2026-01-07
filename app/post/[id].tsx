import {
  transformApiComments,
  transformApiPost,
  useComments,
  useUserFollowed,
} from "@/src/api/read";
import { useToggleFollowUser } from "@/src/api/write";
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
import { useToast } from "@/src/providers/toast-provider";
import { useAuthStore, useUIStore } from "@/src/stores";
import {
  AntDesign,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const { requireAuth, isLoggedIn } = useAuthGuard();

  const currentUser = useAuthStore((s) => s.user);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const optionsSheetRef = useRef<CommentOptionsSheetRef>(null);

  // Fetch comments from API
  const {
    data: commentsData,
    isLoading: isLoadingComments,
    isError: isCommentsError,
    refetch: refetchComments,
    isRefetching: isRefetchingComments,
  } = useComments(id);

  // Fetch user's followed list
  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData]
  );

  // Follow/unfollow mutation
  const toggleFollowMutation = useToggleFollowUser();
  const toast = useToast();

  // Track follow loading state
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  // Transform API post and comments to UI format
  const post = useMemo(() => {
    if (!commentsData?.root) return null;
    return transformApiPost(commentsData.root, { followedUsers });
  }, [commentsData, followedUsers]);

  const comments = useMemo(() => {
    if (!commentsData?.children) return [];
    return transformApiComments(commentsData.children);
  }, [commentsData]);

  // Local state for optimistic updates
  const [localPostUpdates, setLocalPostUpdates] = useState<Partial<Post>>({});
  const [localComments, setLocalComments] = useState<Comment[]>([]);

  // Vote overrides for comments (tracks hasLiked, hasDisliked, and likeDelta)
  const [commentVoteOverrides, setCommentVoteOverrides] = useState<
    Record<
      string,
      { hasLiked?: boolean; hasDisliked?: boolean; likeDelta?: number }
    >
  >({});

  // Merge post data with local updates (for optimistic UI)
  const displayPost = useMemo(() => {
    if (!post) return null;
    return { ...post, ...localPostUpdates };
  }, [post, localPostUpdates]);
  const [revealedContent, setRevealedContent] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Apply vote overrides to a single comment recursively
  const applyVoteOverridesToComment = useCallback(
    (comment: Comment): Comment => {
      const override = commentVoteOverrides[comment.id];
      const updatedComment: Comment = override
        ? {
            ...comment,
            likes: comment.likes + (override.likeDelta ?? 0),
            hasLiked: override.hasLiked ?? comment.hasLiked,
            hasDisliked: override.hasDisliked ?? comment.hasDisliked,
          }
        : comment;

      // Apply to replies recursively
      if (updatedComment.replies && updatedComment.replies.length > 0) {
        return {
          ...updatedComment,
          replies: updatedComment.replies.map(applyVoteOverridesToComment),
        };
      }

      return updatedComment;
    },
    [commentVoteOverrides]
  );

  // Merge API comments with locally added comments and apply vote overrides
  const allComments = useMemo(() => {
    const merged = [...localComments, ...comments];
    return merged.map(applyVoteOverridesToComment);
  }, [localComments, comments, applyVoteOverridesToComment]);

  // Scroll tracking for sticky header
  const [postHeaderHeight, setPostHeaderHeight] = useState(0);
  const stickyHeaderVisible = useSharedValue(0);

  const handlePostHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    setPostHeaderHeight(event.nativeEvent.layout.height);
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      // Show sticky header when scrolled past post header (with some buffer)
      const threshold = postHeaderHeight - 50;

      if (scrollY > threshold && stickyHeaderVisible.value === 0) {
        stickyHeaderVisible.value = withTiming(1, {
          duration: 300,
          easing: Easing.out(Easing.cubic),
        });
      } else if (scrollY <= threshold && stickyHeaderVisible.value === 1) {
        stickyHeaderVisible.value = withTiming(0, {
          duration: 250,
          easing: Easing.in(Easing.cubic),
        });
      }
    },
    [postHeaderHeight, stickyHeaderVisible]
  );

  // Animated style for sticky header
  const stickyHeaderAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(stickyHeaderVisible.value, [0, 1], [-60, 0]);
    const opacity = interpolate(stickyHeaderVisible.value, [0, 1], [0, 1]);

    return {
      transform: [{ translateY }],
      opacity,
    };
  });

  // Format count for display
  const formatCount = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  // Handlers
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleLikePost = useCallback(() => {
    requireAuth(() => {
      // TODO: Implement vote mutation
      const currentPost = displayPost;
      if (!currentPost) return;

      setLocalPostUpdates((prev) => {
        const currentHasLiked = prev.hasLiked ?? currentPost.hasLiked;
        const currentHasDisliked = prev.hasDisliked ?? currentPost.hasDisliked;
        const currentLikes = prev.likes ?? currentPost.likes;
        const currentDislikes = prev.dislikes ?? currentPost.dislikes;

        return {
          ...prev,
          hasLiked: !currentHasLiked,
          hasDisliked: false,
          likes: currentHasLiked ? currentLikes - 1 : currentLikes + 1,
          dislikes: currentHasDisliked ? currentDislikes - 1 : currentDislikes,
        };
      });
    });
  }, [requireAuth, displayPost]);

  const handleDislikePost = useCallback(() => {
    requireAuth(() => {
      // TODO: Implement vote mutation
      const currentPost = displayPost;
      if (!currentPost) return;

      setLocalPostUpdates((prev) => {
        const currentHasLiked = prev.hasLiked ?? currentPost.hasLiked;
        const currentHasDisliked = prev.hasDisliked ?? currentPost.hasDisliked;
        const currentLikes = prev.likes ?? currentPost.likes;
        const currentDislikes = prev.dislikes ?? currentPost.dislikes;

        return {
          ...prev,
          hasDisliked: !currentHasDisliked,
          hasLiked: false,
          dislikes: currentHasDisliked
            ? currentDislikes - 1
            : currentDislikes + 1,
          likes: currentHasLiked ? currentLikes - 1 : currentLikes,
        };
      });
    });
  }, [requireAuth, displayPost]);

  const handleFollowPost = useCallback(() => {
    const currentPost = displayPost;
    if (!currentPost || isFollowLoading) return;

    const authorId = currentPost.author.id;
    const authorUsername = currentPost.author.username;
    const isCurrentlyFollowing =
      localPostUpdates.isFollowing ?? currentPost.isFollowing ?? false;

    requireAuth(async () => {
      setIsFollowLoading(true);

      const action = isCurrentlyFollowing ? "Unfollowing" : "Following";
      const actionPast = isCurrentlyFollowing ? "Unfollowed" : "Followed";

      // Show loading toast
      const toastId = toast.loading(
        `${action} @${authorUsername}`,
        "Computing proof of work..."
      );

      // Optimistic update
      setLocalPostUpdates((prev) => ({
        ...prev,
        isFollowing: !isCurrentlyFollowing,
      }));

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
          // Actual error - revert optimistic update
          setLocalPostUpdates((prev) => ({
            ...prev,
            isFollowing: isCurrentlyFollowing,
          }));
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
        setIsFollowLoading(false);
      }
    });
  }, [
    requireAuth,
    displayPost,
    localPostUpdates.isFollowing,
    isFollowLoading,
    toggleFollowMutation,
    toast,
  ]);

  const handleRevealContent = useCallback(() => {
    setRevealedContent(true);
  }, []);

  // Comment handlers
  const updateCommentInList = useCallback(
    (
      commentId: string,
      updater: (comment: Comment) => Comment,
      commentList: Comment[]
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
    []
  );

  const handleLikeComment = useCallback(
    (
      commentId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean
    ) => {
      requireAuth(() => {
        // Calculate the vote delta
        let likeDelta = 0;
        if (currentlyLiked) {
          // Already liked, removing like: -1
          likeDelta = -1;
        } else if (currentlyDisliked) {
          // Was disliked, now liking: +2 (remove dislike + add like)
          likeDelta = 2;
        } else {
          // Neutral, adding like: +1
          likeDelta = 1;
        }

        // Optimistic update using vote overrides
        setCommentVoteOverrides((prev) => {
          const currentDelta = prev[commentId]?.likeDelta ?? 0;
          return {
            ...prev,
            [commentId]: {
              hasLiked: !currentlyLiked,
              hasDisliked: false,
              likeDelta: currentDelta + likeDelta,
            },
          };
        });
        // TODO: Call vote mutation API
      });
    },
    [requireAuth]
  );

  const handleDislikeComment = useCallback(
    (
      commentId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean
    ) => {
      requireAuth(() => {
        // Calculate the vote delta
        let likeDelta = 0;
        if (currentlyDisliked) {
          // Already disliked, removing dislike: +1
          likeDelta = 1;
        } else if (currentlyLiked) {
          // Was liked, now disliking: -2 (remove like + add dislike)
          likeDelta = -2;
        } else {
          // Neutral, adding dislike: -1
          likeDelta = -1;
        }

        // Optimistic update using vote overrides
        setCommentVoteOverrides((prev) => {
          const currentDelta = prev[commentId]?.likeDelta ?? 0;
          return {
            ...prev,
            [commentId]: {
              hasLiked: false,
              hasDisliked: !currentlyDisliked,
              likeDelta: currentDelta + likeDelta,
            },
          };
        });
        // TODO: Call vote mutation API
      });
    },
    [requireAuth]
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

      // TODO: Replace with actual API mutation
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
        // Add as a reply (optimistic update)
        setLocalComments((prev) =>
          updateCommentInList(
            replyingTo.id,
            (comment) => ({
              ...comment,
              replyCount: (comment.replyCount ?? 0) + 1,
              replies: [...(comment.replies ?? []), newComment],
            }),
            prev.length > 0 ? prev : [newComment]
          )
        );
        // If no existing local comments, this might be a reply to an API comment
        // We'll need to refetch to see the update
        refetchComments();
      } else {
        // Add as top-level comment (optimistic update)
        setLocalComments((prev) => [newComment, ...prev]);
      }

      setLocalPostUpdates((prev) => ({
        ...prev,
        comments: (prev.comments ?? displayPost?.comments ?? 0) + 1,
      }));
      setReplyingTo(null);
      setIsSubmitting(false);
    },
    [currentUser, replyingTo, updateCommentInList, refetchComments, displayPost]
  );

  const handleDeleteComment = useCallback(() => {
    if (!selectedComment) return;

    // TODO: Implement delete mutation
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

    setLocalComments((prev) => removeComment(selectedComment.id, prev));
    setLocalPostUpdates((prev) => ({
      ...prev,
      comments: (prev.comments ?? displayPost?.comments ?? 0) - 1,
    }));
    setSelectedComment(null);
    // Refetch to get updated comments
    refetchComments();
  }, [selectedComment, refetchComments, displayPost]);

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
  const renderListHeader = useCallback(() => {
    // Show loading skeleton while post is loading
    if (!displayPost) {
      return (
        <View onLayout={handlePostHeaderLayout}>
          <Box p="md">
            {/* Post loading skeleton */}
            <View style={styles.skeletonHeader}>
              <View
                style={[
                  styles.skeletonAvatar,
                  { backgroundColor: theme.colors.background.subtle },
                ]}
              />
              <View style={styles.skeletonHeaderText}>
                <View
                  style={[
                    styles.skeletonLine,
                    {
                      width: 120,
                      backgroundColor: theme.colors.background.subtle,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.skeletonLine,
                    {
                      width: 80,
                      backgroundColor: theme.colors.background.subtle,
                    },
                  ]}
                />
              </View>
            </View>
            <View
              style={[
                styles.skeletonLine,
                {
                  width: "100%",
                  height: 20,
                  marginTop: 12,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                {
                  width: "90%",
                  height: 20,
                  marginTop: 8,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                {
                  width: "100%",
                  height: 100,
                  marginTop: 12,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
          </Box>
          <View style={styles.divider} />
        </View>
      );
    }

    return (
      <View onLayout={handlePostHeaderLayout}>
        {/* Full post card */}
        <PostCard
          post={displayPost}
          isOwnPost={currentUser?.id === displayPost.author.id}
          onLikePress={handleLikePost}
          onDislikePress={handleDislikePost}
          onFollowPress={handleFollowPost}
          onRevealContent={handleRevealContent}
          contentRevealed={revealedContent}
          followLoading={isFollowLoading}
          shareUrl={`https://mirage.app/post/${id}`}
        />

        {/* Divider below post */}
        <View style={styles.divider} />
      </View>
    );
  }, [
    displayPost,
    currentUser,
    handleLikePost,
    handleDislikePost,
    handleFollowPost,
    handleRevealContent,
    revealedContent,
    isFollowLoading,
    id,
    theme.colors.background.subtle,
    handlePostHeaderLayout,
  ]);

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentThread
        comment={item}
        currentUserId={currentUser?.id}
        onAuthorPress={(authorId) => {
          // TODO: Navigate to user profile
          console.log("Navigate to author:", authorId);
        }}
        onLikePress={(commentId, hasLiked, hasDisliked) =>
          handleLikeComment(commentId, hasLiked, hasDisliked)
        }
        onDislikePress={(commentId, hasLiked, hasDisliked) =>
          handleDislikeComment(commentId, hasLiked, hasDisliked)
        }
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

  // Render a single comment skeleton
  const renderCommentSkeleton = useCallback(
    (index: number, depth: number = 0) => {
      const indentWidth = depth * 16;
      return (
        <View
          key={`skeleton-${index}-${depth}`}
          style={[styles.commentSkeleton, { marginLeft: indentWidth }]}
        >
          {/* Header: Avatar + Username + Time */}
          <View style={styles.skeletonHeader}>
            <View
              style={[
                styles.skeletonAvatar,
                {
                  width: 32,
                  height: 32,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
            <View style={styles.skeletonHeaderText}>
              <View
                style={[
                  styles.skeletonLine,
                  {
                    width: 100,
                    height: 10,
                    backgroundColor: theme.colors.background.subtle,
                  },
                ]}
              />
            </View>
          </View>
          {/* Content lines */}
          <View style={{ marginTop: 8, gap: 6 }}>
            <View
              style={[
                styles.skeletonLine,
                {
                  width: "100%",
                  height: 12,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                {
                  width: "85%",
                  height: 12,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                {
                  width: "60%",
                  height: 12,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
          </View>
          {/* Actions row */}
          <View style={styles.skeletonActions}>
            <View
              style={[
                styles.skeletonLine,
                {
                  width: 24,
                  height: 10,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                {
                  width: 24,
                  height: 10,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
            <View
              style={[
                styles.skeletonLine,
                {
                  width: 24,
                  height: 10,
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            />
          </View>
        </View>
      );
    },
    [theme.colors.background.subtle]
  );

  const renderEmptyComments = useCallback(() => {
    // Show loading skeletons
    if (isLoadingComments) {
      return (
        <View>
          {/* Render multiple skeleton comments */}
          {renderCommentSkeleton(0)}
          {renderCommentSkeleton(1, 1)}
          {renderCommentSkeleton(2, 1)}
          {renderCommentSkeleton(3)}
          {renderCommentSkeleton(4, 1)}
          {renderCommentSkeleton(5)}
        </View>
      );
    }

    // Show error state
    if (isCommentsError) {
      return (
        <Box flex center p="lg">
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={theme.colors.error[500]}
          />
          <Text
            size="md"
            weight="medium"
            mode="subtle"
            style={{ marginTop: 12 }}
          >
            Failed to load comments
          </Text>
          <Pressable
            onPress={() => refetchComments()}
            style={{
              marginTop: 12,
              paddingHorizontal: 16,
              paddingVertical: 8,
              backgroundColor: theme.colors.primary[500],
              borderRadius: 8,
            }}
          >
            <Text size="sm" weight="medium" style={{ color: "#FFFFFF" }}>
              Try again
            </Text>
          </Pressable>
        </Box>
      );
    }

    // Show empty state
    return (
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
    );
  }, [
    isLoadingComments,
    isCommentsError,
    refetchComments,
    renderCommentSkeleton,
    theme.colors.text.subtle,
    theme.colors.primary,
    theme.colors.error,
  ]);

  const keyExtractor = useCallback((item: Comment) => item.id, []);

  // Get the first media thumbnail if available
  const postThumbnail = displayPost?.media?.[0]?.uri;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <Box flex background="base">
        {/* Header */}
        {renderHeader}

        {/* Sticky Post Summary Header */}
        <Animated.View
          style={[
            styles.stickyHeader,
            {
              backgroundColor: theme.colors.background.default,
              top: insets.top + 40, // Position below the main header
            },
            stickyHeaderAnimatedStyle,
          ]}
          pointerEvents={stickyHeaderVisible.value > 0.5 ? "auto" : "none"}
        >
          <View style={styles.stickyHeaderContent}>
            <View style={styles.stickyHeaderInfo}>
              <Text
                size="md"
                weight="bold"
                numberOfLines={1}
                style={styles.stickyHeaderTitle}
              >
                {displayPost?.title}
              </Text>
              <View style={styles.stickyHeaderStats}>
                <Text size="sm" mode="subtle">
                  {formatCount(displayPost?.likes ?? 0)} upvotes
                </Text>
                <Text size="sm" mode="subtle" style={styles.stickyHeaderDot}>
                  •
                </Text>
                <Text size="sm" mode="subtle">
                  {formatCount(displayPost?.comments ?? 0)} comments
                </Text>
              </View>
            </View>
            {postThumbnail && (
              <Image
                source={{ uri: postThumbnail }}
                style={styles.stickyHeaderThumbnail}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )}
          </View>
        </Animated.View>

        {/* Comments list */}
        <FlatList
          data={allComments}
          renderItem={renderComment}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmptyComments}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 60,
          }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingComments}
              onRefresh={refetchComments}
              tintColor={theme.colors.primary[500]}
            />
          }
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
  // Skeleton styles
  skeletonHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skeletonHeaderText: {
    marginLeft: theme.spacing.sm,
    gap: 4,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },
  // Comment skeleton styles
  commentSkeleton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  skeletonActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  // Sticky header styles
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    overflow: "hidden",
  },
  stickyHeaderContent: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  stickyHeaderInfo: {
    flex: 1,
    paddingLeft: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    justifyContent: "center",
  },
  stickyHeaderTitle: {
    lineHeight: 18,
  },
  stickyHeaderStats: {
    flexDirection: "row",
    alignItems: "center",
    // marginTop: 2,
  },
  stickyHeaderDot: {
    marginHorizontal: theme.spacing.xs,
  },
  stickyHeaderThumbnail: {
    width: 52,
    height: "100%",
    minHeight: 48,
    marginLeft: theme.spacing.sm,
  },
}));
