import { memo } from "react";

import type { Post as ApiPost } from "@/src/api/types";
import { ProfileCommentItem } from "@/src/components/molecules/profile-comment-item";
import { PostCardItem } from "@/src/components/molecules/post-card-item";
import type { Post } from "@/src/components/molecules";
import { usePostEditStore } from "@/src/stores/post-edit-store";

export const MemoizedPostCardItem = memo(PostCardItem, (prev, next) => {
  const p = prev.post;
  const n = next.post;
  if (p.id !== n.id) return false;
  if (p.title !== n.title) return false;
  if (p.body !== n.body) return false;
  if (p.likes !== n.likes) return false;
  if (p.dislikes !== n.dislikes) return false;
  if (p.comments !== n.comments) return false;
  if (p.hasLiked !== n.hasLiked) return false;
  if (p.hasDisliked !== n.hasDisliked) return false;
  if (p.awards?.length !== n.awards?.length) return false;
  if (prev.isVisible !== next.isVisible) return false;
  if (prev.isFocused !== next.isFocused) return false;
  if (prev.preloadNearby !== next.preloadNearby) return false;
  if (prev.screenActive !== next.screenActive) return false;
  return true;
});

export const MemoizedProfileCommentItem = memo(ProfileCommentItem, (prev, next) => {
  return prev.comment.post_id === next.comment.post_id &&
    prev.comment.content === next.comment.content &&
    prev.comment.points === next.comment.points;
});

export const AnimatedPostWrapper = memo(function AnimatedPostWrapper({
  post,
  isVisible,
  isFocused,
  preloadNearby,
  screenActive,
  onPostPress,
  onAuthorPress,
  onCommentPress,
  onMorePress,
  onTopicPress,
}: {
  post: Post;
  isVisible?: boolean;
  isFocused?: boolean;
  preloadNearby?: boolean;
  screenActive?: boolean;
  onPostPress: (postId: string) => void;
  onAuthorPress: (authorId: string) => void;
  onCommentPress: (postId: string) => void;
  onMorePress: (postId: string) => void;
  onTopicPress: (topic: string) => void;
}) {
  const editOverride = usePostEditStore((state) => state.overrides[post.id]);
  const displayPost = editOverride
    ? {
        ...post,
        title: editOverride.title,
        body: editOverride.content || undefined,
        topic: editOverride.topic ?? post.topic,
        media: editOverride.media
          ? editOverride.media.map((url: string) => ({
              uri: url,
              type: "image" as const,
            }))
          : post.media,
      }
    : post;

  return (
    <MemoizedPostCardItem
      post={displayPost}
      isOwnPost
      isVisible={isVisible}
      isFocused={isFocused}
      preloadNearby={preloadNearby}
      screenActive={screenActive}
      showUrlCard={false}
      onPostPress={onPostPress}
      onAuthorPress={onAuthorPress}
      onCommentPress={onCommentPress}
      onMorePress={onMorePress}
      onTopicPress={onTopicPress}
    />
  );
});

export const MemoizedCommentWrapper = memo(function MemoizedCommentWrapper({
  comment,
  onPress,
}: {
  comment: ApiPost;
  onPress: (commentId: string, rootPostId: string) => void;
}) {
  return <MemoizedProfileCommentItem comment={comment} onPress={onPress} />;
});
