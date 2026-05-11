import { useCallback, useEffect, useMemo, useState } from "react";
import { usePreferencesStore } from "@/src/stores";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { CommentItem, type Comment } from "./comment-item";

const EMPTY_LOADING_SET = new Set<string>();
const EMPTY_DEPTHS: number[] = [];

type CommentThreadProps = {
  comment: Comment;
  depth?: number;
  maxDepth?: number;
  /**
   * Ancestor rail depths to draw through this comment's row. Inherited
   * from the parent thread; depth-0 (top-level) starts with `[]`.
   *
   * A depth K in this array means the ancestor at depth K is NOT the
   * last child in its own subtree, so a vertical rail should run
   * through this comment's full card height at that ancestor's avatar
   * column. Mirrors the web `getAncestorRailDepths` calc.
   */
  activeDepths?: number[];
  /** Whether this comment is the last child in its parent's reply list. */
  isLastChild?: boolean;
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
  onHighlightedLayout?: (event: LayoutChangeEvent) => void;
  showDivider?: boolean;
};

export const CommentThread = ({
  comment,
  depth = 0,
  maxDepth = 4,
  activeDepths = EMPTY_DEPTHS,
  isLastChild = true,
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
  onHighlightedLayout,
  showDivider = true,
}: CommentThreadProps) => {
  const autoCollapseThreshold = usePreferencesStore((s) => s.autoCollapseThreshold);
  const score = comment.likes;
  const shouldAutoCollapse = autoCollapseThreshold !== null && score <= autoCollapseThreshold;
  const [isCollapsed, setIsCollapsed] = useState(shouldAutoCollapse);
  const replies = comment.replies ?? [];
  const hasReplies = replies.length > 0;
  const containsHighlightedComment = useMemo(() => {
    if (!highlightedCommentId) return false;
    const containsComment = (target: Comment): boolean => {
      if (target.id === highlightedCommentId) return true;
      return target.replies?.some(containsComment) ?? false;
    };
    return containsComment(comment);
  }, [comment, highlightedCommentId]);

  useEffect(() => {
    if (containsHighlightedComment) {
      setIsCollapsed(false);
      return;
    }
    setIsCollapsed(shouldAutoCollapse);
  }, [containsHighlightedComment, shouldAutoCollapse]);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const isOwnComment = currentUserId === comment.author.id;
  const isHighlighted = highlightedCommentId === comment.id;

  return (
    <Animated.View style={styles.container} layout={LinearTransition.duration(250)}>
      <CommentItem
        comment={comment}
        isOwnComment={isOwnComment}
        isHighlighted={isHighlighted}
        isFollowingAuthor={followedUsers.includes(comment.author.id)}
        isFollowLoading={followLoadingUsers.has(comment.author.id)}
        onFollowPress={() => onFollowPress?.(comment.author.id, followedUsers.includes(comment.author.id))}
        depth={depth}
        maxDepth={maxDepth}
        activeDepths={activeDepths}
        hasChildren={hasReplies}
        isCollapsed={isCollapsed}
        onPress={handleToggleCollapse}
        onAuthorPress={() => onAuthorPress?.(comment.author.id)}
        onLikePress={() => onLikePress?.(comment.id, comment.hasLiked ?? false, comment.hasDisliked ?? false, comment.likes)}
        onDislikePress={() => onDislikePress?.(comment.id, comment.hasLiked ?? false, comment.hasDisliked ?? false, comment.likes)}
        onReplyPress={() => onReplyPress?.(comment)}
        onMorePress={() => onMorePress?.(comment)}
        onHighlightedLayout={onHighlightedLayout}
      />

      {hasReplies && !isCollapsed && (
        <Animated.View
          style={styles.repliesContainer}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(120)}
        >
          {replies.map((reply, idx) => {
            const replyIsLast = idx === replies.length - 1;
            // Each child inherits our `activeDepths` always. If THIS
            // child is not the last sibling, our own column (depth)
            // must also run through that child's subtree so the rail
            // reaches the next sibling below — this is what makes a
            // parent with multiple children connect through its first
            // child to the next one.
            const replyActiveDepths = replyIsLast
              ? activeDepths
              : [...activeDepths, depth];
            return (
              <CommentThread
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                maxDepth={maxDepth}
                activeDepths={replyActiveDepths}
                isLastChild={replyIsLast}
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
                onHighlightedLayout={onHighlightedLayout}
                showDivider={false}
              />
            );
          })}
        </Animated.View>
      )}

      {showDivider && depth === 0 && <View style={styles.divider} />}
    </Animated.View>
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
