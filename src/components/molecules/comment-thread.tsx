import { useCallback, useEffect, useMemo, useState } from "react";
import { usePreferencesStore } from "@/src/stores";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { CommentItem, type Comment } from "./comment-item";

const EMPTY_LOADING_SET = new Set<string>();
const EMPTY_DEPTHS: number[] = [];
const INITIAL_VISIBLE_REPLY_DEPTH = 5;
const REPLY_DEPTH_INCREMENT = 10;

function findRelativeDepthToComment(
  comment: Comment,
  targetId: string,
  currentRelativeDepth: number,
): number | null {
  if (comment.id === targetId) return currentRelativeDepth;

  for (const reply of comment.replies ?? []) {
    const replyDepth = findRelativeDepthToComment(
      reply,
      targetId,
      currentRelativeDepth + 1,
    );
    if (replyDepth !== null) return replyDepth;
  }

  return null;
}

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
  onLikePress?: (
    commentId: string,
    hasLiked: boolean,
    hasDisliked: boolean,
    likes: number,
  ) => void;
  onDislikePress?: (
    commentId: string,
    hasLiked: boolean,
    hasDisliked: boolean,
    likes: number,
  ) => void;
  onReplyPress?: (comment: Comment) => void;
  onMorePress?: (comment: Comment) => void;
  followedUsers?: string[];
  followLoadingUsers?: Set<string>;
  onFollowPress?: (authorId: string, isCurrentlyFollowing: boolean) => void;
  onHighlightedLayout?: (event: LayoutChangeEvent) => void;
  showDivider?: boolean;
  focusedContextMode?: boolean;
  branchRootDepth?: number;
  visibleReplyDepth?: number;
  onLoadMoreReplyDepth?: () => void;
};

export const CommentThread = ({
  comment,
  depth = 0,
  maxDepth = 20,
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
  focusedContextMode = false,
  branchRootDepth: branchRootDepthProp,
  visibleReplyDepth: visibleReplyDepthProp,
  onLoadMoreReplyDepth,
}: CommentThreadProps) => {
  const autoCollapseThreshold = usePreferencesStore(
    (s) => s.autoCollapseThreshold,
  );
  const [localVisibleReplyDepth, setLocalVisibleReplyDepth] = useState(
    INITIAL_VISIBLE_REPLY_DEPTH,
  );
  const branchRootDepth = branchRootDepthProp ?? depth;
  const visibleReplyDepth = visibleReplyDepthProp ?? localVisibleReplyDepth;
  const handleLoadMoreReplyDepth = useCallback(() => {
    if (onLoadMoreReplyDepth) {
      onLoadMoreReplyDepth();
      return;
    }
    setLocalVisibleReplyDepth((currentDepth) =>
      currentDepth + REPLY_DEPTH_INCREMENT,
    );
  }, [onLoadMoreReplyDepth]);
  const score = comment.likes;
  const shouldAutoCollapse =
    autoCollapseThreshold !== null && score <= autoCollapseThreshold;
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
  const highlightedRelativeDepth = useMemo(() => {
    if (!highlightedCommentId) return null;
    return findRelativeDepthToComment(comment, highlightedCommentId, 0);
  }, [comment, highlightedCommentId]);

  useEffect(() => {
    if (visibleReplyDepthProp !== undefined || highlightedRelativeDepth === null) return;
    setLocalVisibleReplyDepth((currentDepth) =>
      Math.max(currentDepth, highlightedRelativeDepth),
    );
  }, [highlightedRelativeDepth, visibleReplyDepthProp]);

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
    <View style={styles.container}>
      <CommentItem
        comment={comment}
        isOwnComment={isOwnComment}
        isHighlighted={isHighlighted}
        isFollowingAuthor={followedUsers.includes(comment.author.id)}
        isFollowLoading={followLoadingUsers.has(comment.author.id)}
        onFollowPress={() =>
          onFollowPress?.(
            comment.author.id,
            followedUsers.includes(comment.author.id),
          )
        }
        depth={depth}
        maxDepth={maxDepth}
        activeDepths={activeDepths}
        hasChildren={hasReplies}
        isCollapsed={isCollapsed}
        onPress={handleToggleCollapse}
        onAuthorPress={() => onAuthorPress?.(comment.author.id)}
        onLikePress={() =>
          onLikePress?.(
            comment.id,
            comment.hasLiked ?? false,
            comment.hasDisliked ?? false,
            comment.likes,
          )
        }
        onDislikePress={() =>
          onDislikePress?.(
            comment.id,
            comment.hasLiked ?? false,
            comment.hasDisliked ?? false,
            comment.likes,
          )
        }
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
            const replyDepth = depth + 1;
            const replyRelativeDepth = replyDepth - branchRootDepth;
            if (replyRelativeDepth > visibleReplyDepth) return null;

            const replyIsLast = idx === replies.length - 1;
            // Once we descend past the focused comment, its actual
            // replies render as a normal thread, not parent chain.
            const childInFocusedContext =
              focusedContextMode && !comment.isFocusedComment;
            // Normal threads inherit ancestor rails through non-last
            // siblings so sibling subtrees stay connected. Focused
            // comment context is a single parent chain (like web), so
            // each child only needs ONE ancestor rail at its immediate
            // parent's column — drawn full row height — to guarantee
            // an unbroken vertical line across the parent→child row
            // boundary at every depth.
            const replyActiveDepths = childInFocusedContext
              ? [depth]
              : replyIsLast
                ? activeDepths
                : [...activeDepths, depth];
            return (
              <CommentThread
                key={reply.id}
                comment={reply}
                depth={replyDepth}
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
                focusedContextMode={childInFocusedContext}
                branchRootDepth={branchRootDepth}
                visibleReplyDepth={visibleReplyDepth}
                onLoadMoreReplyDepth={handleLoadMoreReplyDepth}
              />
            );
          })}
          {depth + 1 - branchRootDepth > visibleReplyDepth ? (
            <Pressable
              onPress={handleLoadMoreReplyDepth}
              style={[
                styles.loadMoreRepliesButton,
                { marginLeft: Math.min(12 + depth * 14, 96) },
              ]}
            >
              <Text size="xs" weight="semibold" mode="brand">
                {visibleReplyDepth === INITIAL_VISIBLE_REPLY_DEPTH
                  ? "Show more replies"
                  : "Load more replies"}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      )}

      {showDivider && depth === 0 && <View style={styles.divider} />}
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {},
  repliesContainer: {},
  loadMoreRepliesButton: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  divider: {
    height: 5,
    backgroundColor: theme.colors.background.subtle,
  },
}));
