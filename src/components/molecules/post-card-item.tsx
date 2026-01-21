import { memo, useCallback } from "react";
import { PostCard } from "./post-card";
import type { Post } from "./post-card-types";
import { logPress } from "@/src/utils/press-logger";

type PostCardItemProps = {
  post: Post;
  isVisible?: boolean;
  isOwnPost?: boolean;
  isTopicFollowed?: boolean;
  contentRevealed?: boolean;
  followLoading?: boolean;
  shareUrl?: string;
  onPostPress?: (postId: string) => void;
  onAuthorPress?: (authorId: string) => void;
  onMorePress?: (postId: string) => void;
  onLikePress?: (
    postId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  onDislikePress?: (
    postId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  onCommentPress?: (postId: string) => void;
  onFollowUser?: (
    authorId: string,
    authorUsername: string,
    isCurrentlyFollowing: boolean
  ) => void;
  onFollowTopic?: (topic: string, isCurrentlyFollowed: boolean) => void;
  onRevealContent?: (postId: string) => void;
};

export const PostCardItem = memo(function PostCardItem({
  post,
  isVisible = false,
  isOwnPost = false,
  isTopicFollowed = false,
  contentRevealed = false,
  followLoading = false,
  shareUrl,
  onPostPress,
  onAuthorPress,
  onMorePress,
  onLikePress,
  onDislikePress,
  onCommentPress,
  onFollowUser,
  onFollowTopic,
  onRevealContent,
}: PostCardItemProps) {
  const handlePostPress = useCallback(() => {
    logPress({ name: "post_card_item", postId: post.id });
    onPostPress?.(post.id);
  }, [onPostPress, post.id]);

  const handleAuthorPress = useCallback(() => {
    onAuthorPress?.(post.author.id);
  }, [onAuthorPress, post.author.id]);

  const handleMorePress = useCallback(() => {
    onMorePress?.(post.id);
  }, [onMorePress, post.id]);

  const handleLikePress = useCallback(() => {
    logPress({ name: "post_like", postId: post.id });
    onLikePress?.(
      post.id,
      post.hasLiked ?? false,
      post.hasDisliked ?? false,
      post.likes
    );
  }, [onLikePress, post.id, post.hasLiked, post.hasDisliked, post.likes]);

  const handleDislikePress = useCallback(() => {
    logPress({ name: "post_dislike", postId: post.id });
    onDislikePress?.(
      post.id,
      post.hasLiked ?? false,
      post.hasDisliked ?? false,
      post.likes
    );
  }, [onDislikePress, post.id, post.hasLiked, post.hasDisliked, post.likes]);

  const handleCommentPress = useCallback(() => {
    logPress({ name: "post_comment", postId: post.id });
    onCommentPress?.(post.id);
  }, [onCommentPress, post.id]);

  const handleFollowUser = useCallback(() => {
    logPress({ name: "post_follow_user", postId: post.id });
    onFollowUser?.(post.author.id, post.author.username, post.isFollowing ?? false);
  }, [onFollowUser, post.author.id, post.author.username, post.isFollowing]);

  const handleFollowTopic = useCallback(() => {
    if (!post.topic) return;
    logPress({ name: "post_follow_topic", postId: post.id });
    onFollowTopic?.(post.topic, isTopicFollowed);
  }, [onFollowTopic, post.topic, post.id, isTopicFollowed]);

  const handleRevealContent = useCallback(() => {
    logPress({ name: "post_reveal", postId: post.id });
    onRevealContent?.(post.id);
  }, [onRevealContent, post.id]);

  return (
    <PostCard
      post={post}
      isOwnPost={isOwnPost}
      isVisible={isVisible}
      isTopicFollowed={isTopicFollowed}
      onPress={handlePostPress}
      onAuthorPress={handleAuthorPress}
      onMorePress={handleMorePress}
      onLikePress={handleLikePress}
      onDislikePress={handleDislikePress}
      onCommentPress={handleCommentPress}
      onFollowUser={handleFollowUser}
      onFollowTopic={handleFollowTopic}
      onRevealContent={handleRevealContent}
      contentRevealed={contentRevealed}
      followLoading={followLoading}
      shareUrl={shareUrl}
    />
  );
});
