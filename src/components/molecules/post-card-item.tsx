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
 shareUrl?: string;
  showFollowButton?: boolean;
  showUrlCard?: boolean;
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
  onBlockUser?: (postId: string, authorId: string, authorUsername: string) => void;
  onBlockPost?: (postId: string) => void;
  onReport?: (postId: string) => void;
};

function arePostCardItemPropsEqual(
  prevProps: PostCardItemProps,
  nextProps: PostCardItemProps
): boolean {
  const prev = prevProps.post;
  const next = nextProps.post;
  if (prev.id !== next.id) return false;
  if (prev.likes !== next.likes) return false;
  if (prev.comments !== next.comments) return false;
  if (prev.hasLiked !== next.hasLiked) return false;
  if (prev.hasDisliked !== next.hasDisliked) return false;
  if (prevProps.isOwnPost !== nextProps.isOwnPost) return false;
  return true;
}

export const PostCardItem = memo(function PostCardItem({
post,
isVisible = false,
isOwnPost = false,
isTopicFollowed = false,
contentRevealed = false,
shareUrl,
  showFollowButton = true,
  showUrlCard,
onPostPress,
  onAuthorPress,
  onMorePress,
  onLikePress,
  onDislikePress,
  onCommentPress,
  onFollowUser,
  onFollowTopic,
  onRevealContent,
  onBlockUser,
  onBlockPost,
  onReport,
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

  const handleBlockUser = useCallback(() => {
    logPress({ name: "post_block_user", postId: post.id });
    onBlockUser?.(post.id, post.author.id, post.author.username);
  }, [onBlockUser, post.id, post.author.id, post.author.username]);

  const handleBlockPost = useCallback(() => {
    logPress({ name: "post_block_post", postId: post.id });
    onBlockPost?.(post.id);
  }, [onBlockPost, post.id]);

  const handleReport = useCallback(() => {
    logPress({ name: "post_report", postId: post.id });
    onReport?.(post.id);
  }, [onReport, post.id]);

 return (
   <PostCard
     post={post}
     isOwnPost={isOwnPost}
     isVisible={isVisible}
     isTopicFollowed={isTopicFollowed}
      showFollowButton={showFollowButton}
     onPress={handlePostPress}
     onAuthorPress={handleAuthorPress}
      onMorePress={handleMorePress}
      onLikePress={handleLikePress}
      onDislikePress={handleDislikePress}
      onCommentPress={handleCommentPress}
      onFollowUser={handleFollowUser}
     onFollowTopic={handleFollowTopic}
     onRevealContent={handleRevealContent}
     onBlockUser={handleBlockUser}
     onBlockPost={handleBlockPost}
     onReport={handleReport}
     contentRevealed={contentRevealed}
     shareUrl={shareUrl}
      showUrlCard={showUrlCard}
   />
  );
}, arePostCardItemPropsEqual);
