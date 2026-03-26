import { useCallback } from "react";
import Animated, { FadeInUp } from "react-native-reanimated";

import { CommentThread, type Comment } from "@/src/components/molecules";

type PostDetailCommentListItemProps = {
  item: Comment;
  currentUserId?: string;
  highlightedCommentId: string | null;
  followedUsers: string[];
  followLoadingUsers: Set<string>;
  onAuthorPress: (authorId: string) => void;
  onLikePress: (
    commentId: string,
    hasLiked: boolean,
    hasDisliked: boolean,
    likes: number,
  ) => void;
  onDislikePress: (
    commentId: string,
    hasLiked: boolean,
    hasDisliked: boolean,
    likes: number,
  ) => void;
  onReplyPress: (comment: Comment) => void;
  onMorePress: (comment: Comment) => void;
  onFollowPress: (authorId: string, isCurrentlyFollowing: boolean) => void;
};

export function PostDetailCommentListItem({
  item,
  currentUserId,
  highlightedCommentId,
  followedUsers,
  followLoadingUsers,
  onAuthorPress,
  onLikePress,
  onDislikePress,
  onReplyPress,
  onMorePress,
  onFollowPress,
}: PostDetailCommentListItemProps) {
  const handleAuthorPress = useCallback(() => {
    onAuthorPress(item.author.id);
  }, [item.author.id, onAuthorPress]);

  return (
    <Animated.View entering={FadeInUp.duration(250).delay(100)}>
      <CommentThread
        comment={item}
        currentUserId={currentUserId}
        highlightedCommentId={highlightedCommentId}
        onAuthorPress={handleAuthorPress}
        onLikePress={onLikePress}
        onDislikePress={onDislikePress}
        onReplyPress={onReplyPress}
        onMorePress={onMorePress}
        followedUsers={followedUsers}
        followLoadingUsers={followLoadingUsers}
        onFollowPress={onFollowPress}
        showDivider
      />
    </Animated.View>
  );
}
