import { useCallback, useEffect, useState } from "react";
import { usePreferencesStore } from "@/src/stores";
import { View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
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
  const score = comment.likes;
  const shouldAutoCollapse = autoCollapseThreshold !== null && score <= autoCollapseThreshold;
  const [isCollapsed, setIsCollapsed] = useState(shouldAutoCollapse);

  useEffect(() => {
    setIsCollapsed(shouldAutoCollapse);
  }, [autoCollapseThreshold]);

  const replies = comment.replies ?? [];
  const hasReplies = replies.length > 0;

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
        isCollapsed={isCollapsed}
        onPress={handleToggleCollapse}
        onAuthorPress={() => onAuthorPress?.(comment.author.id)}
        onLikePress={() => onLikePress?.(comment.id, comment.hasLiked ?? false, comment.hasDisliked ?? false, comment.likes)}
        onDislikePress={() => onDislikePress?.(comment.id, comment.hasLiked ?? false, comment.hasDisliked ?? false, comment.likes)}
        onReplyPress={() => onReplyPress?.(comment)}
        onMorePress={() => onMorePress?.(comment)}
      />

      {hasReplies && !isCollapsed && (
        <Animated.View
          style={styles.repliesContainer}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(120)}
        >
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
