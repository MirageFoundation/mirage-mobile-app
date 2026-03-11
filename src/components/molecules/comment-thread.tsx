import { useCallback, useEffect, useState } from "react";
import { usePreferencesStore } from "@/src/stores";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { CommentItem, type Comment } from "./comment-item";

const EMPTY_LOADING_SET = new Set<string>();

type CommentThreadProps = {
  comment: Comment;
  depth?: number;
  maxDepth?: number;
  currentUserId?: string | null;
  highlightedCommentId?: string | null;
  onAuthorPress?: (authorId: string) => void;
  onLikePress?: (commentId: string, hasLiked: boolean, hasDisliked: boolean, likes: number) => void;
  onDislikePress?: (commentId: string, hasLiked: boolean, hasDisliked: boolean, likes: number) => void;
  onReplyPress?: (comment: Comment) => void;
  onMorePress?: (comment: Comment) => void;
  followedUsers?: string[];
  followLoadingUsers?: Set<string>;
  onFollowPress?: (authorId: string, isCurrentlyFollowing: boolean) => void;
  showDivider?: boolean;
};

export const CommentThread = ({
  comment,
  depth = 0,
  maxDepth = 4,
  currentUserId,
  highlightedCommentId,
  onAuthorPress,
  onLikePress,
  onDislikePress,
  onReplyPress,
  onMorePress,
  followedUsers = [],
  followLoadingUsers = EMPTY_LOADING_SET,
  onFollowPress,
  showDivider = true,
}: CommentThreadProps) => {
  const autoCollapseThreshold = usePreferencesStore((s) => s.autoCollapseThreshold);
  const score = comment.likes - comment.dislikes;
  const shouldAutoCollapse = autoCollapseThreshold !== null && score <= autoCollapseThreshold;
  const [isCollapsed, setIsCollapsed] = useState(shouldAutoCollapse);
  const [showReplies, setShowReplies] = useState(true);

  useEffect(() => {
    setIsCollapsed(shouldAutoCollapse);
  }, [autoCollapseThreshold]);

  const replies = comment.replies ?? [];
  const hasReplies = replies.length > 0;

  const repliesProgress = useSharedValue(1);

  useEffect(() => {
    if (isCollapsed) {
      repliesProgress.value = withTiming(0, {
        duration: 150,
        easing: Easing.out(Easing.quad),
      });
      const timer = setTimeout(() => setShowReplies(false), 160);
      return () => clearTimeout(timer);
    } else {
      setShowReplies(true);
      repliesProgress.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [isCollapsed, repliesProgress]);

  const repliesAnimatedStyle = useAnimatedStyle(() => ({
    opacity: repliesProgress.value,
    transform: [{ scaleY: repliesProgress.value }],
    height: repliesProgress.value === 0 ? 0 : "auto",
    overflow: "hidden" as const,
    transformOrigin: "top",
  }));

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const isOwnComment = currentUserId === comment.author.id;
  const isHighlighted = highlightedCommentId === comment.id;

  return (
    <View style={styles.container}>
      <CommentItem
        comment={comment}
        isOwnComment={isOwnComment}
        isHighlighted={isHighlighted}
        isFollowingAuthor={followedUsers.includes(comment.author.id)}
        isFollowLoading={followLoadingUsers.has(comment.author.id)}
        onFollowPress={() => onFollowPress?.(comment.author.id, followedUsers.includes(comment.author.id))}
        depth={depth}
        maxDepth={maxDepth}
        isCollapsed={isCollapsed}
        onPress={handleToggleCollapse}
        onAuthorPress={() => onAuthorPress?.(comment.author.id)}
        onLikePress={() => onLikePress?.(comment.id, comment.hasLiked ?? false, comment.hasDisliked ?? false, comment.likes)}
        onDislikePress={() => onDislikePress?.(comment.id, comment.hasLiked ?? false, comment.hasDisliked ?? false, comment.likes)}
        onReplyPress={() => onReplyPress?.(comment)}
        onMorePress={() => onMorePress?.(comment)}
      />

      {hasReplies && showReplies && (
        <Animated.View style={[styles.repliesContainer, repliesAnimatedStyle]}>
          {replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              maxDepth={maxDepth}
              currentUserId={currentUserId}
              highlightedCommentId={highlightedCommentId}
              onAuthorPress={onAuthorPress}
              onLikePress={onLikePress}
              onDislikePress={onDislikePress}
              onReplyPress={onReplyPress}
              onMorePress={onMorePress}
              followedUsers={followedUsers}
              followLoadingUsers={followLoadingUsers}
              onFollowPress={onFollowPress}
              showDivider={false}
            />
          ))}
        </Animated.View>
      )}

      {showDivider && depth === 0 && <View style={styles.divider} />}
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {},
  repliesContainer: {},
  divider: {
    height: 5,
    backgroundColor: theme.colors.background.subtle,
  },
}));
