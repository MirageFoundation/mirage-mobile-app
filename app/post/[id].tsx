import {
  transformApiComments,
  transformApiPost,
  useComments,
  useUserFollowed,
  uploadImageAndGetUrl,
} from "@/src/api/read";
import { LinearGradient } from "expo-linear-gradient";
import { getGradientColor } from "@/src/components/molecules/profile-header";
import {
  useComment,
} from "@/src/api/write";
import {
  usePowQueueStore,
  generateActionId,
  getActionLabel,
} from "@/src/services/pow-queue";
import { useEdit } from "@/src/api/write";
import { Avatar } from "@/src/components/atoms";
import {
  Comment,
  CommentInput,
  CommentInputRef,
  AwardPickerSheet,
  AwardPickerSheetRef,
  CommentOptionsSheet,
  CommentOptionsSheetRef,
  CommentThread,
  ConfirmationPopup,
  PostCard,
  PostOptionsSheet,
  PostOptionsSheetRef,
  ReportSheet,
  ReportSheetRef,
  type Post,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import {
  useAuthGuard,
  useBlockHandler,
  useDeleteHandler,
  useReportHandler,
  useVoteHandler,
  type VoteResult,
} from "@/src/hooks";
import { useFollowHandler } from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import {
  useAuthStore,
  useContentModerationStore,
  useUIStore,
  usePreferencesStore,
  getShareBaseUrl,
  useSavedPostsStore,
} from "@/src/stores";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { useHistoryStore } from "@/src/stores/history-store";
import { useHomePostCardStore } from "@/src/pages/home/home-post-card-store";
import {
  AntDesign,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, {
  Easing,
  FadeInUp,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { getLastPressedPostY } from "@/src/utils/post-transition";

export default function PostDetailScreen() {
  const { id, highlight, reveal } = useLocalSearchParams<{
    id: string;
    highlight?: string;
    reveal?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const pressedY = useMemo(() => getLastPressedPostY(), []);
  const headerHeight = insets.top + 40;
  const initialTranslateY = pressedY > 0 ? pressedY - headerHeight : 0;

  const postTranslateY = useSharedValue(initialTranslateY);
  const postOpacity = useSharedValue(pressedY > 0 ? 0 : 1);

  useEffect(() => {
    if (pressedY > 0) {
      postOpacity.value = withTiming(1, { duration: 200 });
      postTranslateY.value = withTiming(0, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, []);

  const postEnteringStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: postTranslateY.value }],
    opacity: postOpacity.value,
  }));
  const { theme } = useUnistyles();
  const { requireAuth, isLoggedIn } = useAuthGuard();

  const gradientColors = useMemo(
    () => getGradientColor().filter((c) => c !== "#000000"),
    [],
  );

  const currentUser = useAuthStore((s) => s.user);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const savedComments = useSavedPostsStore((s) => s.savedComments);
  const optionsSheetRef = useRef<CommentOptionsSheetRef>(null);
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const awardPickerSheetRef = useRef<AwardPickerSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const [awardTargetId, setAwardTargetId] = useState<string>("");
  const [awardTargetType, setAwardTargetType] = useState<"post" | "comment">("post");
  const [awardTargetIsOwn, setAwardTargetIsOwn] = useState(false);
  const commentInputRef = useRef<CommentInputRef>(null);
  const flatListRef = useRef<FlatList<Comment>>(null);

  // State for highlighted comment (from URL param)
  const [highlightedCommentId, setHighlightedCommentId] = useState<
    string | null
  >(highlight || null);

  // Track if screen is focused (for pausing videos when navigating away)
  const [screenActive, setScreenActive] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setScreenActive(true);
      return () => {
        setScreenActive(false);
      };
    }, []),
  );

  // Track if component is still mounted (to avoid navigating back if user already left)
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    [followedData],
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData],
  );

  // Follow/unfollow mutations
  const toast = useToast();

 const { handleFollowUser: handleFollowUserViaQueue, handleFollowTopic: handleFollowTopicViaQueue } = useFollowHandler({
  onOptimisticFollowUser: (_userId, isFollowing) => {
   setLocalPostUpdates((prev) => ({
    ...prev,
    isFollowing,
   }));
  },
  onRollbackFollowUser: () => {
   setLocalPostUpdates((prev) => ({
    ...prev,
    isFollowing: undefined,
   }));
  },
  onOptimisticFollowTopic: (_topic, isFollowing) => {
   setLocalTopicFollowed(isFollowing);
  },
  onRollbackFollowTopic: () => {
   setLocalTopicFollowed(null);
  },
 });

  // Shared store for vote overrides (syncs with home/following screens)
  const setVoteOverride = useHomePostCardStore(
    (state) => state.setVoteOverride,
  );
  const clearVoteOverride = useHomePostCardStore(
    (state) => state.clearVoteOverride,
  );

  // Track follow loading state
  const [followLoadingUsers, setFollowLoadingUsers] = useState<Set<string>>(
    new Set(),
  );

  // Global content moderation state (syncs to home screen)
  const globalHidePost = useContentModerationStore((s) => s.hidePost);
  const globalUnhidePost = useContentModerationStore((s) => s.unhidePost);
  const globalBlockUser = useContentModerationStore((s) => s.blockUser);
  const globalHideComment = useContentModerationStore((s) => s.hideComment);
  const globalUnhideComment = useContentModerationStore((s) => s.unhideComment);
  const globalHiddenCommentIds = useContentModerationStore(
    (s) => s.hiddenCommentIds,
  );

  // Local state for filtering comments on this screen
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(
    new Set(),
  );
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  // Delete, Block, and Report handlers
  const deleteHandler = useDeleteHandler({
    onRollback: (targetId, targetType) => {
      if (targetType === "post") {
        globalUnhidePost(targetId);
      } else {
        globalUnhideComment(targetId);
        setHiddenCommentIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        setLocalPostUpdates((prev) => ({
          ...prev,
          comments: (prev.comments ?? 0) + 1,
        }));
      }
    },
  });
  const blockHandler = useBlockHandler({});
  const reportHandler = useReportHandler({});

  // Helper to remove comment from local state
  const removeCommentFromState = useCallback(
    (commentId: string) => {
      const removeComment = (
        targetId: string,
        commentList: Comment[],
      ): Comment[] => {
        return commentList
          .filter((c) => c.id !== targetId)
          .map((c) => ({
            ...c,
            replies: c.replies ? removeComment(targetId, c.replies) : undefined,
          }));
      };
      setLocalComments((prev) => removeComment(commentId, prev));
      setLocalPostUpdates((prev) => ({
        ...prev,
        comments: Math.max(
          0,
          (prev.comments ?? commentsData?.root?.comments ?? 0) - 1,
        ),
      }));
    },
    [commentsData?.root?.comments],
  );

  // Optimistic confirm handlers - hide content/navigate immediately before API call
  const handleConfirmDelete = useCallback(() => {
    const pending = deleteHandler.pendingTarget;
    if (pending) {
      if (pending.type === "post") {
        // Hide post in global store (syncs to home screen)
        globalHidePost(pending.id);
        // Navigate back immediately
        if (isMountedRef.current) {
          router.back();
        }
      } else {
        globalHideComment(pending.id);
        setHiddenCommentIds((prev) => new Set(prev).add(pending.id));
        removeCommentFromState(pending.id);

        // If deleting the highlighted comment (came from profile), navigate back
        if (highlight && pending.id === highlight && isMountedRef.current) {
          router.back();
        }
      }
      setSelectedComment(null);
    }
    // Then proceed with API call
    deleteHandler.confirmDelete();
  }, [
    deleteHandler,
    router,
    removeCommentFromState,
    globalHidePost,
    globalHideComment,
    highlight,
  ]);

  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending) {
      if (pending.type === "post") {
        // Hide post in global store (syncs to home screen)
        globalHidePost(pending.id);
        // Navigate back immediately
        if (isMountedRef.current) {
          router.back();
        }
      } else if (pending.type === "user") {
        // Block user in global store (syncs to home screen)
        globalBlockUser(pending.id);
        // Check if the blocked user is the post author
        const isPostAuthor = commentsData?.root?.user_id === pending.id;
        if (isPostAuthor) {
          // Navigate back if blocking the post author
          if (isMountedRef.current) {
            router.back();
          }
        } else {
          // Filter out comments from blocked user (stay on screen)
          setBlockedUserIds((prev) => new Set(prev).add(pending.id));
        }
      } else if (pending.type === "comment") {
        // Hide the blocked comment (local + global)
        globalHideComment(pending.id);
        setHiddenCommentIds((prev) => new Set(prev).add(pending.id));
      }
      setSelectedComment(null);
    }
    // Then proceed with API call
    blockHandler.confirmBlock();
  }, [
    blockHandler,
    commentsData?.root?.user_id,
    router,
    globalHidePost,
    globalBlockUser,
    globalHideComment,
  ]);

  const handleReportSubmitWithOptimistic = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending) {
        if (pending.type === "post") {
          // Hide post in global store (syncs to home screen)
          globalHidePost(pending.id);
          // Navigate back immediately
          if (isMountedRef.current) {
            router.back();
          }
        } else if (pending.type === "comment") {
          // Hide the reported comment (local + global)
          globalHideComment(pending.id);
          setHiddenCommentIds((prev) => new Set(prev).add(pending.id));
        }
        setSelectedComment(null);
      }
      // Close the report sheet immediately
      reportSheetRef.current?.dismiss();
      // Then proceed with API call
      reportHandler.submitReport(reason);
    },
    [reportHandler, router, globalHidePost, globalHideComment],
  );

  // Present report sheet when showReportSheet is true
  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet]);

  const commentMutation = useComment({});
  const commentMutateAsyncRef = useRef(commentMutation.mutateAsync);
  useEffect(() => {
    commentMutateAsyncRef.current = commentMutation.mutateAsync;
  }, [commentMutation.mutateAsync]);
  const enqueue = usePowQueueStore((state) => state.enqueue);

  const editMutation = useEdit({});
  const editMutateAsyncRef = useRef(editMutation.mutateAsync);
  useEffect(() => {
    editMutateAsyncRef.current = editMutation.mutateAsync;
  }, [editMutation.mutateAsync]);

  // Transform API post and comments to UI format
  const post = useMemo(() => {
    if (!commentsData?.root) return null;
    return transformApiPost(commentsData.root, { followedUsers, currentUser: currentUser ? { id: currentUser.id, username: currentUser.username } : undefined });
  }, [commentsData, followedUsers]);

  useEffect(() => {
    if (post) {
      useHistoryStore.getState().addEntry(post);
    }
  }, [post?.id]);

  const comments = useMemo(() => {
    if (!commentsData?.children) return [];
    return transformApiComments(commentsData.children);
  }, [commentsData]);

  // Local state for optimistic updates
  const [localPostUpdates, setLocalPostUpdates] = useState<Partial<Post>>({});
  const [localTopicFollowed, setLocalTopicFollowed] = useState<boolean | null>(
    null,
  );
  const [localComments, setLocalComments] = useState<Comment[]>([]);
  // Track optimistic replies to API comments (parentId -> optimistic comments)
  const [optimisticReplies, setOptimisticReplies] = useState<
    Record<string, Comment[]>
  >({});

  // Vote overrides for comments (tracks hasLiked, hasDisliked, and likeDelta)

  // Track if initial comments have loaded (to avoid clearing optimistic on first load)
  const hasInitialCommentsLoaded = useRef(false);

  // Clean up optimistic comments when server data is refreshed
  // This prevents duplicates when user pulls to refresh after posting
  useEffect(() => {
    if (!commentsData?.children) return;

    // Skip initial load - only clean up on subsequent refreshes
    if (!hasInitialCommentsLoaded.current) {
      hasInitialCommentsLoaded.current = true;
      return;
    }

    // Helper to check if server comments contain a matching comment
    const findMatchingServerComment = (
      optimisticComment: Comment,
      serverComments: Comment[],
    ): boolean => {
      for (const serverComment of serverComments) {
        // Match by content and author (since optimistic IDs are different)
        if (
          serverComment.content === optimisticComment.content &&
          serverComment.author.id === optimisticComment.author.id
        ) {
          return true;
        }
        // Check nested replies
        if (serverComment.replies && serverComment.replies.length > 0) {
          if (
            findMatchingServerComment(optimisticComment, serverComment.replies)
          ) {
            return true;
          }
        }
      }
      return false;
    };

    // Clean up localComments - remove optimistic comments that now exist on server
    setLocalComments((prev) => {
      const filtered = prev.filter(
        (c) =>
          !c.id.startsWith("optimistic-") ||
          !findMatchingServerComment(c, comments),
      );
      return filtered.length === prev.length ? prev : filtered;
    });

    // Clean up optimisticReplies - remove replies that now exist on server
    setOptimisticReplies((prev) => {
      const updated: Record<string, Comment[]> = {};
      let hasChanges = false;

      for (const [parentId, replies] of Object.entries(prev)) {
        const filtered = replies.filter(
          (c) =>
            !c.id.startsWith("optimistic-") ||
            !findMatchingServerComment(c, comments),
        );
        if (filtered.length > 0) {
          updated[parentId] = filtered;
        }
        if (filtered.length !== replies.length) {
          hasChanges = true;
        }
      }

      return hasChanges ? updated : prev;
    });
  }, [commentsData?.children, comments]);
  const [commentVoteOverrides, setCommentVoteOverrides] = useState<
    Record<
      string,
      { hasLiked?: boolean; hasDisliked?: boolean; likeDelta?: number }
    >
  >({});

  const [commentEditOverrides, setCommentEditOverrides] = useState<
    Record<string, string>
  >({});

  // Vote handler for the post
  const postVoteHandler = useVoteHandler({
    onOptimisticUpdate: useCallback(
      (targetId: string, result: VoteResult) => {
        setVoteOverride(targetId, {
          hasLiked: result.hasLiked,
          hasDisliked: result.hasDisliked,
          likes: result.newLikes,
        });
      },
      [setVoteOverride],
    ),
    onRollback: useCallback(
      (
        targetId: string,
        previousState: {
          hasLiked: boolean;
          hasDisliked: boolean;
          likes: number;
        },
      ) => {
        // Clear the shared store override
        clearVoteOverride(targetId);
      },
      [clearVoteOverride],
    ),
  });

  // Vote handler for comments
  const commentVoteHandler = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
      setCommentVoteOverrides((prev) => {
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
    onRollback: useCallback(
      (
        targetId: string,
        previousState: {
          hasLiked: boolean;
          hasDisliked: boolean;
          likes: number;
        },
      ) => {
        // Revert to previous state by removing the override
        setCommentVoteOverrides((prev) => {
          const newOverrides = { ...prev };
          delete newOverrides[targetId];
          return newOverrides;
        });
      },
      [],
    ),
  });

  // Merge post data with local updates (for optimistic UI)
  // Read vote override from shared store (in case vote was made on home/following)
  const sharedVoteOverride = useHomePostCardStore((state) =>
    id ? state.voteOverrides[id] : undefined,
  );
  const sharedCommentCountOverride = useHomePostCardStore((state) =>
    id ? state.commentCountOverrides[id] : undefined,
  );

  // Merge post data with local updates and shared store overrides (for optimistic UI)
  const displayPost = useMemo(() => {
    if (!post) return null;

    // Start with base post data and local updates (for non-vote fields like comments, isFollowing)
    let result = { ...post, ...localPostUpdates };

    // Always apply shared store vote override (votes only use shared store, not local state)
    if (sharedVoteOverride) {
      result = {
        ...result,
        likes: sharedVoteOverride.likes ?? post.likes ?? 0,
        hasLiked: sharedVoteOverride.hasLiked ?? result.hasLiked,
        hasDisliked: sharedVoteOverride.hasDisliked ?? result.hasDisliked,
      };
    }

    // Apply shared store comment count override if present (and not already overridden locally)
    if (sharedCommentCountOverride && localPostUpdates.comments === undefined) {
      result = {
        ...result,
        comments:
          (result.comments ?? 0) +
          (sharedCommentCountOverride.commentDelta ?? 0),
      };
    }

    return result;
  }, [post, localPostUpdates, sharedVoteOverride, sharedCommentCountOverride]);
  const [revealedContent, setRevealedContent] = useState(reveal === "true");
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
    [commentVoteOverrides],
  );

  const applyEditOverridesToComment = useCallback(
    (comment: Comment): Comment => {
      const editedContent = commentEditOverrides[comment.id];
      const updatedComment: Comment =
        editedContent !== undefined
          ? { ...comment, content: editedContent }
          : comment;

      if (updatedComment.replies && updatedComment.replies.length > 0) {
        return {
          ...updatedComment,
          replies: updatedComment.replies.map(applyEditOverridesToComment),
        };
      }

      return updatedComment;
    },
    [commentEditOverrides],
  );

  // Apply optimistic replies to a comment tree recursively
  const applyOptimisticReplies = useCallback(
    (comment: Comment): Comment => {
      const pendingReplies = optimisticReplies[comment.id] ?? [];
      const existingReplies = comment.replies ?? [];

      const processedReplies = existingReplies.map(applyOptimisticReplies);

      const allReplies = [...processedReplies, ...pendingReplies];

      return {
        ...comment,
        replies: allReplies.length > 0 ? allReplies : comment.replies,
        replyCount: (comment.replyCount ?? 0) + pendingReplies.length,
      };
    },
    [optimisticReplies],
  );

  // Filter out hidden comments and comments from blocked users recursively
  const filterComments = useCallback(
    (commentList: Comment[]): Comment[] => {
      return commentList
        .filter(
          (comment) =>
            !hiddenCommentIds.has(comment.id) &&
            !globalHiddenCommentIds.has(comment.id) &&
            !blockedUserIds.has(comment.author.id),
        )
        .map((comment) => ({
          ...comment,
          replies: comment.replies
            ? filterComments(comment.replies)
            : undefined,
        }));
    },
    [hiddenCommentIds, globalHiddenCommentIds, blockedUserIds],
  );

  // Merge API comments with locally added comments and apply vote overrides + optimistic replies
  // Filter hidden/blocked and sort by createdAt descending (latest first)
  const allComments = useMemo(() => {
    const localIds = new Set(localComments.map((c) => c.id));
    const dedupedComments = comments.filter((c) => !localIds.has(c.id));
    const merged = [...localComments, ...dedupedComments];
    return filterComments(
      merged
        .map(applyOptimisticReplies)
        .map(applyVoteOverridesToComment)
        .map(applyEditOverridesToComment),
    ).sort((a, b) => {
      const timeA =
        a.createdAt instanceof Date
          ? a.createdAt.getTime()
          : Number(a.createdAt);
      const timeB =
        b.createdAt instanceof Date
          ? b.createdAt.getTime()
          : Number(b.createdAt);
      return timeB - timeA; // Descending order (latest first)
    });
  }, [
    localComments,
    comments,
    applyOptimisticReplies,
    applyVoteOverridesToComment,
    applyEditOverridesToComment,
    filterComments,
  ]);

  // Helper to find if a comment or its nested replies contain the target ID
  const findCommentInTree = useCallback(
    (comment: Comment, targetId: string): boolean => {
      if (comment.id === targetId) return true;
      if (comment.replies) {
        return comment.replies.some((reply) =>
          findCommentInTree(reply, targetId),
        );
      }
      return false;
    },
    [],
  );

  // Scroll to highlighted comment when data loads
  useEffect(() => {
    if (highlightedCommentId && allComments.length > 0 && flatListRef.current) {
      // First try to find the comment at top level
      let index = allComments.findIndex((c) => c.id === highlightedCommentId);

      // If not found at top level, find which top-level comment contains it as a nested reply
      if (index === -1) {
        index = allComments.findIndex((c) =>
          findCommentInTree(c, highlightedCommentId),
        );
      }

      if (index !== -1) {
        // Small delay to ensure layout is ready
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.1, // Position closer to top to show more of the thread
          });
        }, 500);

        // Clear highlight after 3 seconds
        setTimeout(() => {
          setHighlightedCommentId(null);
        }, 3000);
      }
    }
  }, [highlightedCommentId, allComments, findCommentInTree]);

  // Scroll tracking for sticky header
  const [postHeaderHeight, setPostHeaderHeight] = useState(0);
  const stickyHeaderVisible = useSharedValue(0);
  const [isStickyInteractive, setIsStickyInteractive] = useState(false);

  const handlePostHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setPostHeaderHeight((current) =>
      Math.abs(current - nextHeight) < 1 ? current : nextHeight,
    );
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
    [postHeaderHeight, stickyHeaderVisible],
  );

  useAnimatedReaction(
    () => stickyHeaderVisible.value > 0.5,
    (next, prev) => {
      if (next === prev) return;
      runOnJS(setIsStickyInteractive)(next);
    },
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
    const currentPost = displayPost;
    if (!currentPost) return;

    postVoteHandler.handleUpvote(
      currentPost.id,
      currentPost.hasLiked ?? false,
      currentPost.hasDisliked ?? false,
      currentPost.likes,
    );
  }, [displayPost, postVoteHandler]);

  const handleDislikePost = useCallback(() => {
    const currentPost = displayPost;
    if (!currentPost) return;

    postVoteHandler.handleDownvote(
      currentPost.id,
      currentPost.hasLiked ?? false,
      currentPost.hasDisliked ?? false,
      currentPost.likes,
    );
  }, [displayPost, postVoteHandler]);

  const handleAuthorPress = useCallback(() => {
    if (!displayPost) return;
    router.push(`/user/${displayPost.author.id}`);
  }, [displayPost, router]);

  const handleTopicPress = useCallback(() => {
    if (!displayPost?.topic) return;
    router.push(`/topic/${encodeURIComponent(displayPost.topic)}`);
  }, [displayPost, router]);

  const handleFollowPost = useCallback(() => {
    const currentPost = displayPost;
    if (!currentPost) return;

    const authorId = currentPost.author.id;
    const authorUsername = currentPost.author.username;
    const isCurrentlyFollowing =
      localPostUpdates.isFollowing ?? currentPost.isFollowing ?? false;

    handleFollowUserViaQueue(authorId, authorUsername, isCurrentlyFollowing);
  }, [
    displayPost,
    localPostUpdates.isFollowing,
    handleFollowUserViaQueue,
  ]);

  const handleFollowTopic = useCallback(() => {
    if (!displayPost?.topic) return;
    const topic = displayPost.topic;
    const isCurrentlyFollowed =
      localTopicFollowed ?? followedTopics.includes(topic);

    handleFollowTopicViaQueue(topic, isCurrentlyFollowed);
  }, [
    displayPost?.topic,
    followedTopics,
    localTopicFollowed,
    handleFollowTopicViaQueue,
  ]);

  const handleRevealContent = useCallback(() => {
    setRevealedContent(true);
  }, []);

  // Comment handlers
  const updateCommentInList = useCallback(
    (
      commentId: string,
      updater: (comment: Comment) => Comment,
      commentList: Comment[],
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
    [],
  );

  const handleLikeComment = useCallback(
    (
      commentId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number = 0,
    ) => {
      commentVoteHandler.handleUpvote(
        commentId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes,
      );
    },
    [commentVoteHandler],
  );

  const handleDislikeComment = useCallback(
    (
      commentId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number = 0,
    ) => {
      commentVoteHandler.handleDownvote(
        commentId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes,
      );
    },
    [commentVoteHandler],
  );

  const handleReplyToComment = useCallback(
    (comment: Comment) => {
      requireAuth(() => {
        setReplyingTo(comment);
        // Auto-focus the comment input
        setTimeout(() => {
          commentInputRef.current?.activate();
        }, 100);
      });
    },
    [requireAuth],
  );

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleMoreOptions = useCallback((comment: Comment) => {
    setSelectedComment(comment);
    optionsSheetRef.current?.present();
  }, []);

  const handleSubmitComment = useCallback(
    async (text: string, imageUri?: string | null, gifUrl?: string | null) => {
      if (!currentUser || !id) {
        return;
      }

      const parentId = replyingTo?.id ?? id;
      const replyingToUsername = replyingTo?.author.username;

      const optimisticMediaUrl = imageUri || gifUrl || null;
      let optimisticContent = text;
      if (optimisticMediaUrl) {
        optimisticContent = text.trim()
          ? `${optimisticMediaUrl}\n\n${text.trim()}`
          : optimisticMediaUrl;
      }

      const optimisticCommentId = `optimistic-${Date.now()}`;
      const optimisticComment: Comment = {
        id: optimisticCommentId,
        author: {
          id: currentUser.id,
          username: currentUser.username ?? "you",
          avatarSeed: currentUser.username ?? currentUser.id,
        },
        content: optimisticContent,
        likes: 1,
        dislikes: 0,
        hasLiked: true,
        hasDisliked: false,
        createdAt: new Date(),
        replyCount: 0,
        parentId: replyingTo?.id ?? null,
      };

      const replyTarget = replyingTo;
      const capturedImageUri = imageUri;
      const capturedGifUrl = gifUrl;
      const capturedText = text;

      setReplyingTo(null);
      setIsSubmitting(false);

      const actionId = generateActionId();
      enqueue({
        id: actionId,
        type: "comment",
        label: getActionLabel("comment"),
        execute: async () => {
          let mediaUrl: string | null = null;
          if (capturedImageUri) {
            mediaUrl = await uploadImageAndGetUrl(capturedImageUri);
          } else if (capturedGifUrl) {
            mediaUrl = capturedGifUrl;
          }

          let finalContent = capturedText;
          if (mediaUrl) {
            finalContent = capturedText.trim()
              ? `${mediaUrl}\n\n${capturedText.trim()}`
              : mediaUrl;
          }

          return commentMutateAsyncRef.current({
            parentId,
            content: finalContent,
          });
        },
        onOptimisticUpdate: () => {
          if (replyTarget) {
            setOptimisticReplies((prev) => ({
              ...prev,
              [replyTarget.id]: [
                ...(prev[replyTarget.id] ?? []),
                optimisticComment,
              ],
            }));
          } else {
            setLocalComments((prev) => [optimisticComment, ...prev]);
          }
          setLocalPostUpdates((prev) => ({
            ...prev,
            comments: (prev.comments ?? displayPost?.comments ?? 0) + 1,
          }));
        },
        onSuccess: (result) => {
          const confirmedCommentId =
            typeof result === "object" &&
            result !== null &&
            "tx_hash" in result &&
            typeof (result as { tx_hash?: unknown }).tx_hash === "string"
              ? (result as { tx_hash: string }).tx_hash
              : null;

          if (!confirmedCommentId) return;

          if (replyTarget) {
            setOptimisticReplies((prev) => {
              const existingReplies = prev[replyTarget.id];
              if (!existingReplies) return prev;

              let hasChange = false;
              const nextReplies = existingReplies.map((comment) => {
                if (comment.id !== optimisticCommentId) return comment;
                hasChange = true;
                return {
                  ...comment,
                  id: confirmedCommentId,
                };
              });

              if (!hasChange) return prev;

              return {
                ...prev,
                [replyTarget.id]: nextReplies,
              };
            });
          } else {
            setLocalComments((prev) =>
              prev.map((comment) =>
                comment.id === optimisticCommentId
                  ? { ...comment, id: confirmedCommentId }
                  : comment,
              ),
            );
          }

          setSelectedComment((prev) => {
            if (!prev || prev.id !== optimisticCommentId) return prev;
            return {
              ...prev,
              id: confirmedCommentId,
            };
          });
        },
        onError: () => {},
        onRollback: () => {
          if (replyTarget) {
            setOptimisticReplies((prev) => {
              const updated = { ...prev };
              if (updated[replyTarget.id]) {
                updated[replyTarget.id] = updated[replyTarget.id].filter(
                  (c) => c.id !== optimisticCommentId,
                );
                if (updated[replyTarget.id].length === 0) {
                  delete updated[replyTarget.id];
                }
              }
              return updated;
            });
          } else {
            setLocalComments((prev) =>
              prev.filter((c) => c.id !== optimisticCommentId),
            );
          }
          setLocalPostUpdates((prev) => ({
            ...prev,
            comments: Math.max(
              0,
              (prev.comments ?? displayPost?.comments ?? 0) - 1,
            ),
          }));
        },
      });
    },
    [
      currentUser,
      id,
      replyingTo,
      displayPost,
      enqueue,
      toast,
    ],
  );

  const pendingComment = useCommentComposeStore((s) => s.pendingComment);
  const clearPendingComment = useCommentComposeStore(
    (s) => s.clearPendingComment,
  );
  const pendingEdit = useCommentComposeStore((s) => s.pendingEdit);
  const clearPendingEdit = useCommentComposeStore((s) => s.clearPendingEdit);

  const wasDismissed = useCommentComposeStore((s) => s.wasDismissed);
  const setWasDismissed = useCommentComposeStore((s) => s.setWasDismissed);

  useEffect(() => {
    if (wasDismissed) {
      setReplyingTo(null);
      setWasDismissed(false);
    }
  }, [wasDismissed, setWasDismissed]);

  useEffect(() => {
    if (pendingComment && pendingComment.postId === id) {
      handleSubmitComment(
        pendingComment.text,
        pendingComment.imageUri,
        pendingComment.gifUrl,
      );
      clearPendingComment();
    }
  }, [pendingComment, handleSubmitComment, clearPendingComment, id]);

  useEffect(() => {
    if (pendingEdit && pendingEdit.postId === id && pendingEdit.source === "post") {
      const { commentId, parentId, text, imageUri, gifUrl } = pendingEdit;
      clearPendingEdit();

      if (!commentId || commentId.startsWith("optimistic-")) return;

      let finalContent = text;
      if (imageUri) {
        finalContent = text.trim() ? `${imageUri}\n\n${text.trim()}` : imageUri;
      } else if (gifUrl) {
        finalContent = text.trim() ? `${gifUrl}\n\n${text.trim()}` : gifUrl;
      }

      setCommentEditOverrides((prev) => ({
        ...prev,
        [commentId]: finalContent,
      }));

      const actionId = generateActionId();
      enqueue({
        id: actionId,
        type: "edit",
        label: getActionLabel("edit"),
        execute: async () => {
          return editMutateAsyncRef.current({
            postId: commentId,
            parentId,
            title: "",
            content: finalContent,
            tag: "",
          });
        },
        onSuccess: () => {
          setTimeout(async () => {
            await refetchComments();
            setCommentEditOverrides((prev) => {
              const next = { ...prev };
              delete next[commentId];
              return next;
            });
          }, 3000);
        },
        onError: () => {
          setCommentEditOverrides((prev) => {
            const next = { ...prev };
            delete next[commentId];
            return next;
          });
        },
      });
    }
  }, [pendingEdit, clearPendingEdit, enqueue, refetchComments]);

  const handleDeleteComment = useCallback(() => {
    if (!selectedComment) return;

    if (
      selectedComment.id.startsWith("optimistic-") ||
      selectedComment.id.startsWith("local-")
    ) {
      toast.info(
        "Comment is still syncing",
        "Please try deleting again in a moment.",
      );
      return;
    }

    deleteHandler.requestDelete(selectedComment.id, "comment");
  }, [selectedComment, deleteHandler, toast]);

  const handleEditComment = useCallback(() => {
    if (!selectedComment || !id || selectedComment.id.startsWith("optimistic-"))
      return;
    const commentCreatedAt = selectedComment.createdAt instanceof Date
      ? Math.floor(selectedComment.createdAt.getTime() / 1000)
      : Math.floor(Number(selectedComment.createdAt) / (Number(selectedComment.createdAt) > 1e12 ? 1000 : 1));
    const params: Record<string, string> = {
      postId: id,
      postTitle: displayPost?.title ?? "",
      postAuthorUsername: displayPost?.author.username ?? "",
      editCommentId: selectedComment.id,
      editParentId: selectedComment.parentId ?? id,
      editContent: selectedComment.content,
      editCreatedAt: String(commentCreatedAt),
      editSource: "post",
    };
    if (displayPost?.media?.[0]?.uri) {
      params.postThumbnail = displayPost.media[0].uri;
    }
    router.push({ pathname: "/comment-compose", params });
  }, [selectedComment, id, displayPost, router]);

  const handleEditPost = useCallback(() => {
    if (!displayPost) return;
    const postData = commentsData?.root;
    const createdAtSeconds = postData?.timestamp ?? (
      displayPost.createdAt instanceof Date
        ? Math.floor(displayPost.createdAt.getTime() / 1000)
        : Math.floor(Number(displayPost.createdAt) / (Number(displayPost.createdAt) > 1e12 ? 1000 : 1))
    );
    const editParams: Record<string, string> = {
      editPostId: displayPost.id,
      editTopic: displayPost.topic ?? "general",
      editTitle: displayPost.title,
      editBody: displayPost.body ?? postData?.content ?? "",
      editTag: postData?.tag ?? "",
      editCreatedAt: String(createdAtSeconds),
    };
    if (postData?.media && postData.media.length > 0) {
      editParams.editMedia = JSON.stringify(postData.media);
    } else if (displayPost.media && displayPost.media.length > 0) {
      editParams.editMedia = JSON.stringify(displayPost.media.map((m) => m.uri));
    }
    router.push({ pathname: "/edit-post", params: editParams });
  }, [displayPost, commentsData, router]);

  // Handler for deleting the post
  const handleDeletePost = useCallback(() => {
    if (!displayPost) return;
    deleteHandler.requestDelete(displayPost.id, "post");
  }, [displayPost, deleteHandler]);

  // Handler for blocking the post
  const handleBlockPost = useCallback(() => {
    if (!displayPost) return;
    blockHandler.requestBlockPost(displayPost.id);
  }, [displayPost, blockHandler]);

  // Handler for blocking the post author
  const handleBlockPostAuthor = useCallback(() => {
    if (!displayPost) return;
    blockHandler.requestBlockUser(
      displayPost.author.id,
      displayPost.author.username,
    );
  }, [displayPost, blockHandler]);

  // Handler for reporting the post
  const handleReportPost = useCallback(() => {
    if (!displayPost) return;
    reportHandler.requestReport(displayPost.id, "post");
  }, [displayPost, reportHandler]);

  // Handler for blocking a comment
  const handleBlockComment = useCallback(() => {
    if (!selectedComment) return;
    blockHandler.requestBlockComment(selectedComment.id);
  }, [selectedComment, blockHandler]);

  // Handler for blocking a comment author
  const handleBlockCommentAuthor = useCallback(() => {
    if (!selectedComment) return;
    blockHandler.requestBlockUser(
      selectedComment.author.id,
      selectedComment.author.username,
    );
  }, [selectedComment, blockHandler]);

  // Handler for reporting a comment
  const handleReportComment = useCallback(() => {
    if (!selectedComment) return;
    reportHandler.requestReport(selectedComment.id, "comment");
  }, [selectedComment, reportHandler]);

  const handleToggleFollowCommentAuthor = useCallback(() => {
    if (!selectedComment) return;
    const authorId = selectedComment.author.id;
    const authorUsername = selectedComment.author.username;
    const isCurrentlyFollowing = followedUsers.includes(authorId);
    handleFollowUserViaQueue(authorId, authorUsername, isCurrentlyFollowing);
  }, [
    selectedComment,
    followedUsers,
    handleFollowUserViaQueue,
  ]);

  const handleFollowCommentAuthor = useCallback(
    (authorId: string, isCurrentlyFollowing: boolean) => {
      handleFollowUserViaQueue(authorId, "", isCurrentlyFollowing);
    },
    [handleFollowUserViaQueue],
  );

  // Handler for opening post options sheet
  const handlePostMorePress = useCallback(() => {
    postOptionsSheetRef.current?.present();
  }, []);

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
      <LinearGradient
        colors={[...gradientColors] as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top }]}
      >
        <Pressable onPress={handleBack} style={styles.headerButton}>
          <AntDesign name="close" size={22} color="#FFFFFF" />
        </Pressable>

        <View style={styles.headerSpacer} />
      </LinearGradient>
    ),
    [insets.top, handleBack, gradientColors],
  );

  // Render list header (post + divider)
  const listHeader = useMemo(() => {
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
      <Animated.View
        style={postEnteringStyle}
        onLayout={handlePostHeaderLayout}
      >
        <PostCard
          post={displayPost}
          isOwnPost={currentUser?.id === displayPost.author.id}
          isVisible={true}
          isTopicFollowed={
            localTopicFollowed ??
            (displayPost?.topic
              ? followedTopics.includes(displayPost.topic)
              : false)
          }
          screenActive={screenActive}
          onAuthorPress={handleAuthorPress}
          onTopicPress={handleTopicPress}
          onLikePress={handleLikePost}
          onDislikePress={handleDislikePost}
          onFollowUser={handleFollowPost}
          onFollowTopic={handleFollowTopic}
          onMorePress={handlePostMorePress}
          onBlockUser={handleBlockPostAuthor}
          onBlockPost={handleBlockPost}
          onReport={handleReportPost}
          onRevealContent={handleRevealContent}
          contentRevealed={revealedContent}
          shareUrl={`${getShareBaseUrl(shareServer)}/p/${id}`}
          showUrlCard={false}
          hideCommentAction
          showMoreButton
          isPostDetail
        />
        <View style={styles.divider} />
      </Animated.View>
    );
  }, [
    displayPost,
    currentUser,
    handleLikePost,
    handleDislikePost,
    handleFollowPost,
    handleFollowTopic,
    followedTopics,
    localTopicFollowed,
    handlePostMorePress,
    handleRevealContent,
    revealedContent,
    id,
    screenActive,
    theme.colors.background.subtle,
    handlePostHeaderLayout,
    postEnteringStyle,
  ]);

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => (
      <Animated.View entering={FadeInUp.duration(250).delay(100)}>
        <CommentThread
          comment={item}
          currentUserId={currentUser?.id}
          highlightedCommentId={highlightedCommentId}
          onAuthorPress={(authorId) => {
            router.push(`/user/${authorId}`);
          }}
          onLikePress={(commentId, hasLiked, hasDisliked, likes) =>
            handleLikeComment(commentId, hasLiked, hasDisliked, likes)
          }
          onDislikePress={(commentId, hasLiked, hasDisliked, likes) =>
            handleDislikeComment(commentId, hasLiked, hasDisliked, likes)
          }
          onReplyPress={handleReplyToComment}
          onMorePress={handleMoreOptions}
          followedUsers={followedUsers}
          followLoadingUsers={followLoadingUsers}
          onFollowPress={handleFollowCommentAuthor}
          showDivider={true}
        />
      </Animated.View>
    ),
    [
      currentUser,
      highlightedCommentId,
      handleLikeComment,
      handleDislikeComment,
      handleReplyToComment,
      handleMoreOptions,
      followedUsers,
      followLoadingUsers,
      handleFollowCommentAuthor,
    ],
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
    [theme.colors.background.subtle],
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
        <Text
          size="lg"
          weight="semibold"
          mode="subtle"
          style={{ marginTop: 12 }}
        >
          No comments yet
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{ marginTop: 2, textAlign: "center" }}
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
    <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
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
          pointerEvents={isStickyInteractive ? "auto" : "none"}
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
          ref={flatListRef}
          data={allComments}
          renderItem={renderComment}
          keyExtractor={keyExtractor}
          ListHeaderComponent={listHeader}
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
          onScrollToIndexFailed={(info) => {
            // Fallback: scroll to offset if index not rendered yet
            setTimeout(() => {
              flatListRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              });
            }, 100);
          }}
          // Performance optimizations for Android
          removeClippedSubviews={Platform.OS === "android"}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={5}
        />

        {/* Comment input */}
        <CommentInput
          ref={commentInputRef}
          isLoggedIn={isLoggedIn}
          onAuthRequired={showAuthSheet}
          replyingTo={replyingTo?.author.username}
          replyingToId={replyingTo?.id}
          replyingToContent={replyingTo?.content}
          onCancelReply={handleCancelReply}
          postId={id}
          postTitle={displayPost?.title}
          postAuthorUsername={displayPost?.author.username}
          postThumbnail={postThumbnail}
          postContent={displayPost?.body}
        />

        {/* Comment options sheet */}
        <CommentOptionsSheet
          ref={optionsSheetRef}
          comment={selectedComment}
          rootPostId={id}
          isOwnComment={currentUser?.id === selectedComment?.author.id}
          isFollowingAuthor={
            selectedComment?.author.id
              ? followedUsers.includes(selectedComment.author.id)
              : false
          }
          isSaved={selectedComment ? savedComments.some((c) => c.id === selectedComment.id) : false}
          onSave={() => {
            if (!selectedComment) return;
            const saved = useSavedPostsStore.getState().toggleSaveComment(selectedComment, id);
            toast.success(
              saved ? "Comment saved" : "Comment unsaved",
              saved ? "You can find it in your saved items." : "Removed from saved items.",
            );
          }}
          onDelete={handleDeleteComment}
          onEdit={handleEditComment}
          onBlockComment={handleBlockComment}
          onBlockUser={handleBlockCommentAuthor}
          onReport={handleReportComment}
          onToggleFollowAuthor={handleToggleFollowCommentAuthor}
          onGiveAward={() => {
            if (!selectedComment) return;
            setAwardTargetId(selectedComment.id);
            setAwardTargetType("comment");
            setAwardTargetIsOwn(currentUser?.id === selectedComment.author.id);
            setTimeout(() => awardPickerSheetRef.current?.present(), 300);
          }}
          onDismiss={() => setSelectedComment(null)}
        />

        {/* Post options sheet */}
        <PostOptionsSheet
          ref={postOptionsSheetRef}
          post={displayPost}
          isOwnPost={currentUser?.id === displayPost?.author.id}
          isTopicFollowed={
            displayPost?.topic
              ? followedTopics.includes(displayPost.topic)
              : false
          }
          isFollowingUser={
            displayPost?.author.id
              ? followedUsers.includes(displayPost.author.id)
              : false
          }
          isSaved={displayPost ? savedPosts.some((p) => p.id === displayPost.id) : false}
          onFollowUser={handleFollowPost}
          onFollowTopic={handleFollowTopic}
          onSave={() => {
            if (!displayPost) return;
            const saved = useSavedPostsStore.getState().toggleSavePost(displayPost);
            toast.success(
              saved ? "Post saved" : "Post unsaved",
              saved ? "You can find it in your saved items." : "Removed from saved items.",
            );
          }}
          onDelete={handleDeletePost}
          onEdit={handleEditPost}
          onBlockPost={handleBlockPost}
          onBlockUser={handleBlockPostAuthor}
          onReport={handleReportPost}
          onGiveAward={() => {
            if (!displayPost) return;
            setAwardTargetId(displayPost.id);
            setAwardTargetType("post");
            setAwardTargetIsOwn(currentUser?.id === displayPost.author.id);
            setTimeout(() => awardPickerSheetRef.current?.present(), 300);
          }}
          onDismiss={() => {}}
        />

        <AwardPickerSheet
          ref={awardPickerSheetRef}
          targetId={awardTargetId}
          targetType={awardTargetType}
          isOwnContent={awardTargetIsOwn}
        />

        {/* Delete confirmation popup */}
        <ConfirmationPopup
          visible={deleteHandler.showConfirmation}
          title={
            deleteHandler.pendingTarget?.type === "post"
              ? "Delete Post?"
              : "Delete Comment?"
          }
          message="This action cannot be undone."
          description="The content will be permanently removed."
          icon="trash-outline"
          isDestructive
          isLoading={deleteHandler.isDeleting}
          confirmText="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={deleteHandler.cancelDelete}
        />

        {/* Block confirmation popup */}
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

        {/* Report sheet */}
        <ReportSheet
          ref={reportSheetRef}
          targetType={reportHandler.pendingTarget?.type}
          onSubmit={handleReportSubmitWithOptimistic}
          onDismiss={reportHandler.cancelReport}
          isLoading={reportHandler.isReporting}
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
    paddingHorizontal: theme.spacing.md,
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
