import {
  transformApiComments,
  transformApiPost,
  useComments,
  useUserFollowed,
  uploadImageAndGetUrl,
} from "@/src/api/read";
import {
  useToggleFollowUser,
  useToggleFollowTopic,
  useComment,
} from "@/src/api/write";
import { useEdit } from "@/src/api/write";
import type { PoWProgress } from "@/src/api/write/signing";
import { Avatar } from "@/src/components/atoms";
import {
  Comment,
  CommentInput,
  CommentInputRef,
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
import { useToast } from "@/src/providers/toast-provider";
import {
  useAuthStore,
  useContentModerationStore,
  useUIStore,
  usePreferencesStore,
  getShareBaseUrl,
} from "@/src/stores";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
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
import { LinearGradient } from "expo-linear-gradient";
import { getLastPressedPostY } from "@/src/utils/post-transition";

export default function PostDetailScreen() {
  const { id, highlight } = useLocalSearchParams<{
    id: string;
    highlight?: string;
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

  const currentUser = useAuthStore((s) => s.user);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const optionsSheetRef = useRef<CommentOptionsSheetRef>(null);
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
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
  const toggleFollowMutation = useToggleFollowUser();
  const toggleFollowTopicMutation = useToggleFollowTopic();
  const toast = useToast();

  // Track follow loading state
const [followLoadingUsers, setFollowLoadingUsers] = useState<Set<string>>(new Set());
  const followLoadingRef = useRef<Set<string>>(new Set());

  // Global content moderation state (syncs to home screen)
  const globalHidePost = useContentModerationStore((s) => s.hidePost);
  const globalUnhidePost = useContentModerationStore((s) => s.unhidePost);
  const globalBlockUser = useContentModerationStore((s) => s.blockUser);
  const globalHideComment = useContentModerationStore((s) => s.hideComment);
  const globalUnhideComment = useContentModerationStore((s) => s.unhideComment);

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
          (prev.comments ?? displayPost?.comments ?? 0) - 1,
        ),
      }));
    },
    [displayPost?.comments],
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
        const isPostAuthor = displayPost?.author.id === pending.id;
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
    displayPost?.author.id,
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

  // Comment mutation with PoW progress tracking
  const [commentToastId, setCommentToastId] = useState<string | null>(null);
  const handlePoWProgress = useCallback(
    (progress: PoWProgress) => {
      if (commentToastId) {
        const progressPercent =
          progress.estimatedTotalMs > 0
            ? Math.min(
                99,
                Math.round(
                  (progress.elapsedMs / progress.estimatedTotalMs) * 100,
                ),
              )
            : 0;
        toast.update(commentToastId, {
          description: `Computing proof of work... ${progressPercent}%`,
        });
      }
    },
    [commentToastId, toast],
  );

 const commentMutation = useComment({
   onPoWProgress: handlePoWProgress,
 });

  const editToastIdRef = useRef<string | null>(null);
  const handleEditPoWProgress = useCallback(
    (progress: PoWProgress) => {
      const tid = editToastIdRef.current;
      if (tid) {
        const pct =
          progress.estimatedTotalMs > 0
            ? Math.min(
                99,
                Math.round(
                  (progress.elapsedMs / progress.estimatedTotalMs) * 100,
                ),
              )
            : 0;
        toast.update(tid, {
          description: `Computing proof of work... ${pct}%`,
        });
      }
    },
    [toast],
  );

  const editMutation = useEdit({
    onPoWProgress: handleEditPoWProgress,
  });

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
  const [localTopicFollowed, setLocalTopicFollowed] = useState<boolean | null>(null);
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
        setLocalPostUpdates((prev) => {
          const currentLikes = prev.likes ?? post?.likes ?? 0;
          return {
            ...prev,
            hasLiked: result.hasLiked,
            hasDisliked: result.hasDisliked,
            likes: currentLikes + result.likeDelta,
          };
        });
      },
      [post?.likes],
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
        setLocalPostUpdates((prev) => ({
          ...prev,
          hasLiked: previousState.hasLiked,
          hasDisliked: previousState.hasDisliked,
          likes: previousState.likes,
        }));
      },
      [],
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
   [commentVoteOverrides],
 );

  const applyEditOverridesToComment = useCallback(
    (comment: Comment): Comment => {
      const editedContent = commentEditOverrides[comment.id];
      const updatedComment: Comment = editedContent !== undefined
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

      // Recursively apply to existing replies
      const processedReplies = existingReplies.map(applyOptimisticReplies);

      // Add optimistic replies
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
            !blockedUserIds.has(comment.author.id),
        )
        .map((comment) => ({
          ...comment,
          replies: comment.replies
            ? filterComments(comment.replies)
            : undefined,
        }));
    },
    [hiddenCommentIds, blockedUserIds],
  );

  // Merge API comments with locally added comments and apply vote overrides + optimistic replies
  // Filter hidden/blocked and sort by createdAt descending (latest first)
 const allComments = useMemo(() => {
   const merged = [...localComments, ...comments];
   return filterComments(
      merged.map(applyOptimisticReplies).map(applyVoteOverridesToComment).map(applyEditOverridesToComment),
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

    const currentHasLiked =
      localPostUpdates.hasLiked ?? currentPost.hasLiked ?? false;
    const currentHasDisliked =
      localPostUpdates.hasDisliked ?? currentPost.hasDisliked ?? false;
    const currentLikes = localPostUpdates.likes ?? currentPost.likes;

    postVoteHandler.handleUpvote(
      currentPost.id,
      currentHasLiked,
      currentHasDisliked,
      currentLikes,
    );
  }, [displayPost, localPostUpdates, postVoteHandler]);

  const handleDislikePost = useCallback(() => {
    const currentPost = displayPost;
    if (!currentPost) return;

    const currentHasLiked =
      localPostUpdates.hasLiked ?? currentPost.hasLiked ?? false;
    const currentHasDisliked =
      localPostUpdates.hasDisliked ?? currentPost.hasDisliked ?? false;
    const currentLikes = localPostUpdates.likes ?? currentPost.likes;

    postVoteHandler.handleDownvote(
      currentPost.id,
      currentHasLiked,
      currentHasDisliked,
      currentLikes,
    );
  }, [displayPost, localPostUpdates, postVoteHandler]);

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
    if (!currentPost || followLoadingRef.current.has(currentPost.author.id)) return;

    const authorId = currentPost.author.id;
    const authorUsername = currentPost.author.username;
    const isCurrentlyFollowing =
      localPostUpdates.isFollowing ?? currentPost.isFollowing ?? false;

    followLoadingRef.current.add(authorId);

    setLocalPostUpdates((prev) => ({
      ...prev,
      isFollowing: !isCurrentlyFollowing,
    }));

    requireAuth(async () => {
      const action = isCurrentlyFollowing ? "Unfollowing" : "Following";
      const actionPast = isCurrentlyFollowing ? "Unfollowed" : "Followed";

      const toastId = toast.loading(
        `${action} @${authorUsername}`,
        "Computing proof of work...",
      );

      setTimeout(async () => {
        try {
         await toggleFollowMutation.mutateAsync({
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
          followLoadingRef.current.delete(authorId);
        }
      }, 0);
    });
}, [
  requireAuth,
  displayPost,
  localPostUpdates.isFollowing,
  toggleFollowMutation,
  toast,
]);

 const handleFollowTopic = useCallback(() => {
   if (!displayPost?.topic) return;
   const topic = displayPost.topic;
    const isCurrentlyFollowed = localTopicFollowed ?? followedTopics.includes(topic);

    setLocalTopicFollowed(!isCurrentlyFollowed);

   requireAuth(async () => {
     const action = isCurrentlyFollowed ? "Unfollowing" : "Following";
      const actionPast = isCurrentlyFollowed ? "Unfollowed" : "Now following";

      // Show loading toast
      const toastId = toast.loading(
        `${action} #${topic}`,
        "Computing proof of work...",
      );

      // Use setTimeout to allow toast to render before heavy operations
      setTimeout(async () => {
        try {
          await toggleFollowTopicMutation.mutateAsync({
            topic,
            isCurrentlyFollowing: isCurrentlyFollowed,
          });

          // Update to success
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
            setLocalTopicFollowed(isCurrentlyFollowed);
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
   requireAuth,
   displayPost?.topic,
   followedTopics,
    localTopicFollowed,
   toggleFollowTopicMutation,
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

      // Show loading toast
      const hasMedia = imageUri || gifUrl;
      const toastId = toast.loading(
        replyingToUsername
          ? `Replying to @${replyingToUsername}`
          : "Posting comment",
        hasMedia ? "Uploading media..." : "Computing proof of work...",
      );
      setCommentToastId(toastId);

      // Handle media upload if present
      let mediaUrl: string | null = null;
      if (imageUri) {
        try {
          toast.update(toastId, { description: "Uploading image..." });
          mediaUrl = await uploadImageAndGetUrl(imageUri);
        } catch (error) {
          toast.update(toastId, {
            type: "error",
            title: "Image upload failed",
            description:
              error instanceof Error ? error.message : "Please try again",
            duration: 4000,
          });
          setTimeout(() => toast.dismiss(toastId), 4000);
          setCommentToastId(null);
          return;
        }
      } else if (gifUrl) {
        mediaUrl = gifUrl;
      }

      let finalContent = text;
      if (mediaUrl) {
        // Append media URL on a new line if there's text, or just the URL if no text
        finalContent = text.trim() ? `${text.trim()}\n\n${mediaUrl}` : mediaUrl;
      }
      toast.update(toastId, { description: "Computing proof of work..." });

      // Create optimistic comment for immediate UI update
      const optimisticCommentId = `optimistic-${Date.now()}`;
      const optimisticComment: Comment = {
        id: optimisticCommentId,
        author: {
          id: currentUser.id,
          username: currentUser.username,
          avatarSeed: currentUser.username,
        },
       content: finalContent,
        likes: 1,
        dislikes: 0,
        hasLiked: true,
        hasDisliked: false,
        createdAt: new Date(),
        replyCount: 0,
        parentId: replyingTo?.id ?? null,
      };

      // Store replyingTo reference before clearing it
      const replyTarget = replyingTo;

      // Apply optimistic update immediately
      if (replyTarget) {
        // Add as a reply to the parent comment
        setOptimisticReplies((prev) => ({
          ...prev,
          [replyTarget.id]: [
            ...(prev[replyTarget.id] ?? []),
            optimisticComment,
          ],
        }));
      } else {
        // Add as top-level comment
        setLocalComments((prev) => [optimisticComment, ...prev]);
      }

      setLocalPostUpdates((prev) => ({
        ...prev,
        comments: (prev.comments ?? displayPost?.comments ?? 0) + 1,
      }));

      // Clear reply state immediately so UI updates
      setReplyingTo(null);
      setIsSubmitting(false);

      // Submit to API in background (don't block UI)
      try {
        const result = await commentMutation.mutateAsync({
          parentId,
          content: finalContent,
        });

        // Update toast to success
        toast.update(toastId, {
          type: "success",
          title: replyingToUsername
            ? `Replied to @${replyingToUsername}`
            : "Comment posted!",
          description: undefined,
          duration: 3000,
        });
        setTimeout(() => toast.dismiss(toastId), 3000);

        // Don't refetch immediately - the server may not have indexed the comment yet
        // The optimistic comment will persist until the user manually refreshes
        // This prevents the comment from disappearing after successful submission
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to post comment";

        // Revert optimistic update on error
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

        // Update toast to error
        toast.update(toastId, {
          type: "error",
          title: "Failed to post comment",
          description: errorMessage,
          duration: 5000,
        });
        setTimeout(() => toast.dismiss(toastId), 5000);

        console.error("Comment submission failed:", error);
      } finally {
        setCommentToastId(null);
      }
    },
    [
      currentUser,
      id,
      replyingTo,
      refetchComments,
      displayPost,
      toast,
      commentMutation,
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
    if (pendingComment) {
      handleSubmitComment(
        pendingComment.text,
        pendingComment.imageUri,
        pendingComment.gifUrl,
      );
      clearPendingComment();
    }
  }, [pendingComment, handleSubmitComment, clearPendingComment]);

useEffect(() => {
 if (pendingEdit) {
   const { commentId, parentId, text, imageUri, gifUrl } = pendingEdit;
   clearPendingEdit();

    if (!commentId || commentId.startsWith("optimistic-")) return;

   let finalContent = text;
    if (imageUri) {
      finalContent = text.trim() ? `${text.trim()}\n\n${imageUri}` : imageUri;
    } else if (gifUrl) {
      finalContent = text.trim() ? `${text.trim()}\n\n${gifUrl}` : gifUrl;
    }

      setCommentEditOverrides((prev) => ({ ...prev, [commentId]: finalContent }));

     toast.dismissAll();
     const toastId = toast.loading("Editing comment", "Computing proof of work...");
     editToastIdRef.current = toastId;

    (async () => {
      try {
        await editMutation.mutateAsync({
          postId: commentId,
          parentId,
          title: "",
          content: finalContent,
          tag: "",
        });

        toast.update(toastId, {
          type: "success",
          title: "Comment edited!",
          description: undefined,
          duration: 3000,
        });
      setTimeout(() => toast.dismiss(toastId), 3000);

        setTimeout(async () => {
          await refetchComments();
          setCommentEditOverrides((prev) => {
            const next = { ...prev };
            delete next[commentId];
            return next;
          });
        }, 3000);
      } catch (error: unknown) {
          setCommentEditOverrides((prev) => {
            const next = { ...prev };
            delete next[commentId];
            return next;
          });
        const errorMessage =
          error instanceof Error ? error.message : "Failed to edit comment";
         toast.update(toastId, {
           type: "error",
           title: "Failed to edit comment",
           description: errorMessage,
           duration: 5000,
         });
         setTimeout(() => toast.dismiss(toastId), 5000);
       } finally {
          editToastIdRef.current = null;
       }
     })();
   }
  }, [pendingEdit, clearPendingEdit, editMutation, toast, refetchComments, editToastIdRef]);

  const handleDeleteComment = useCallback(() => {
    if (!selectedComment) return;
    deleteHandler.requestDelete(selectedComment.id, "comment");
  }, [selectedComment, deleteHandler]);

 const handleEditComment = useCallback(() => {
    if (!selectedComment || !id || selectedComment.id.startsWith("optimistic-")) return;
   const params: Record<string, string> = {
      postId: id,
      postTitle: displayPost?.title ?? "",
      postAuthorUsername: displayPost?.author.username ?? "",
      editCommentId: selectedComment.id,
      editParentId: selectedComment.parentId ?? id,
      editContent: selectedComment.content,
    };
    if (displayPost?.media?.[0]?.uri) {
      params.postThumbnail = displayPost.media[0].uri;
    }
    router.push({ pathname: "/comment-compose", params });
  }, [selectedComment, id, displayPost, router]);

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
    if (!selectedComment || followLoadingRef.current.has(selectedComment.author.id)) return;
 const authorId = selectedComment.author.id;
    const authorUsername = selectedComment.author.username;
    const isCurrentlyFollowing = followedUsers.includes(authorId);

    requireAuth(async () => {
      const action = isCurrentlyFollowing ? "Unfollowing" : "Following";
      const actionPast = isCurrentlyFollowing ? "Unfollowed" : "Followed";
      const toastId = toast.loading(
        `${action} @${authorUsername}`,
        "Computing proof of work...",
      );

   setTimeout(async () => {
        followLoadingRef.current.add(authorId);
       setFollowLoadingUsers((prev) => new Set(prev).add(authorId));
     try {
          await toggleFollowMutation.mutateAsync({
            userAddress: authorId,
            isCurrentlyFollowing,
          });
         toast.update(toastId, {
            type: "success",
            title: `${actionPast} @${authorUsername}`,
          });
          setTimeout(() => toast.dismiss(toastId), 3000);
        } catch {
          toast.update(toastId, {
            type: "error",
            title: `Failed to ${action.toLowerCase()} @${authorUsername}`,
          });
          setTimeout(() => toast.dismiss(toastId), 4000);
     } finally {
          followLoadingRef.current.delete(authorId);
         setFollowLoadingUsers((prev) => {
           const next = new Set(prev);
           next.delete(authorId);
           return next;
         });
     }
     }, 50);
   });
}, [
 selectedComment,
 followedUsers,
  requireAuth,
  toast,
  toggleFollowMutation,
]);

 const handleFollowCommentAuthor = useCallback(
(authorId: string, isCurrentlyFollowing: boolean) => {
      if (followLoadingRef.current.has(authorId)) return;

     requireAuth(async () => {
        const action = isCurrentlyFollowing ? "Unfollowing" : "Following";
        const actionPast = isCurrentlyFollowing ? "Unfollowed" : "Followed";
        const toastId = toast.loading(
          `${action} user`,
          "Computing proof of work...",
        );

     setTimeout(async () => {
          followLoadingRef.current.add(authorId);
         setFollowLoadingUsers((prev) => new Set(prev).add(authorId));
       try {
            await toggleFollowMutation.mutateAsync({
              userAddress: authorId,
              isCurrentlyFollowing,
            });
           toast.update(toastId, {
              type: "success",
              title: `${actionPast} user`,
            });
            setTimeout(() => toast.dismiss(toastId), 3000);
          } catch {
            toast.update(toastId, {
              type: "error",
              title: `Failed to ${action.toLowerCase()} user`,
            });
            setTimeout(() => toast.dismiss(toastId), 4000);
       } finally {
            followLoadingRef.current.delete(authorId);
           setFollowLoadingUsers((prev) => {
              const next = new Set(prev);
              next.delete(authorId);
              return next;
            });
        }
        }, 50);
      });
  },
    [requireAuth, toast, toggleFollowMutation],
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
        colors={["rgb(102, 126, 234)", "rgb(118, 75, 162)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top }]}
      >
        {/* Left: Close button */}
        <Pressable onPress={handleBack} style={styles.headerButton}>
          <AntDesign name="close" size={22} color="#FFFFFF" />
        </Pressable>

        {/* Spacer */}
        <View style={styles.headerSpacer} />
      </LinearGradient>
    ),
    [insets.top, handleBack],
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
         isTopicFollowed={
            localTopicFollowed ?? (displayPost?.topic
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
          shareUrl={`${getShareBaseUrl(shareServer)}/view_post?post_id=${id}`}
          showUrlCard={false}
          hideCommentAction
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
          onDelete={handleDeleteComment}
          onEdit={handleEditComment}
          onBlockComment={handleBlockComment}
          onBlockUser={handleBlockCommentAuthor}
          onReport={handleReportComment}
          onToggleFollowAuthor={handleToggleFollowCommentAuthor}
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
          onFollowUser={handleFollowPost}
          onFollowTopic={handleFollowTopic}
          onDelete={handleDeletePost}
          onBlockPost={handleBlockPost}
          onBlockUser={handleBlockPostAuthor}
          onReport={handleReportPost}
          onDismiss={() => {}}
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
