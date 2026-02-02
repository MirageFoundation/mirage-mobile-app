import { useCallback, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CommentItem, type Comment } from "./comment-item";

type CommentThreadProps = {
  /** The root comment with its replies */
  comment: Comment;
  /** Current nesting depth */
  depth?: number;
  /** Maximum depth before collapsing visually */
  maxDepth?: number;
  /** Whether the current user ID matches author (for highlighting own comments) */
  currentUserId?: string | null;
  /** ID of comment to highlight (from navigation) */
  highlightedCommentId?: string | null;
  /** Callback when author avatar/username is pressed */
  onAuthorPress?: (authorId: string) => void;
  /** Callback when like is pressed */
  onLikePress?: (commentId: string, hasLiked: boolean, hasDisliked: boolean, likes: number) => void;
  /** Callback when dislike is pressed */
  onDislikePress?: (commentId: string, hasLiked: boolean, hasDisliked: boolean, likes: number) => void;
  /** Callback when reply is pressed */
  onReplyPress?: (comment: Comment) => void;
  /** Callback when more options is pressed */
  onMorePress?: (comment: Comment) => void;
  /** List of followed user IDs */
  followedUsers?: string[];
  /** Whether follow action is loading */
  isFollowLoading?: boolean;
  /** Callback when follow button is pressed */
  onFollowPress?: (authorId: string, isCurrentlyFollowing: boolean) => void;
  /** Whether to show divider below this thread */
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
  isFollowLoading = false,
  onFollowPress,
  showDivider = true,
}: CommentThreadProps) => {
  // Track collapsed state for this comment
  const [isCollapsed, setIsCollapsed] = useState(false);

  const replies = comment.replies ?? [];
  const hasReplies = replies.length > 0;

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const isOwnComment = currentUserId === comment.author.id;
  const isHighlighted = highlightedCommentId === comment.id;

  return (
    <View style={styles.container}>
      {/* Main comment */}
      <CommentItem
        comment={comment}
        isOwnComment={isOwnComment}
        isHighlighted={isHighlighted}
        isFollowingAuthor={followedUsers.includes(comment.author.id)}
        isFollowLoading={isFollowLoading}
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

      {/* Nested replies - always shown unless parent is collapsed */}
      {hasReplies && !isCollapsed && (
        <View style={styles.repliesContainer}>
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
              isFollowLoading={isFollowLoading}
              onFollowPress={onFollowPress}
              showDivider={false}
            />
          ))}
        </View>
      )}

      {/* Divider below the thread (only for top-level comments) */}
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
