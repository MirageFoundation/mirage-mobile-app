import { memo, useCallback, useMemo } from "react";
import type { Post } from "@/src/components/molecules";
import { PostCard } from "@/src/components/molecules";
import { logPress } from "@/src/utils/press-logger";
import {
  useHomePostCardStore,
  useIsFollowLoading,
  useIsFollowing,
  useIsPostRevealed,
  useIsPostVisible,
} from "./home-post-card-store";

type HomePostCardItemProps = {
  post: Post;
};

export const HomePostCardItem = memo(function HomePostCardItem({
  post,
}: HomePostCardItemProps) {
  const isVisible = useIsPostVisible(post.id);
  const isFollowing = useIsFollowing(post.author.id);
  const isFollowLoading = useIsFollowLoading(post.author.id);
  const contentRevealed = useIsPostRevealed(post.id);
  const isOwnPost = useHomePostCardStore((state) => state.isOwnPost(post));
  const onPostPress = useHomePostCardStore(
    (state) => state.handlers.onPostPress
  );
  const onAuthorPress = useHomePostCardStore(
    (state) => state.handlers.onAuthorPress
  );
  const onMorePress = useHomePostCardStore(
    (state) => state.handlers.onMorePress
  );
  const onLikePress = useHomePostCardStore(
    (state) => state.handlers.onLikePress
  );
  const onDislikePress = useHomePostCardStore(
    (state) => state.handlers.onDislikePress
  );
  const onCommentPress = useHomePostCardStore(
    (state) => state.handlers.onCommentPress
  );
  const onFollowPress = useHomePostCardStore(
    (state) => state.handlers.onFollowPress
  );
  const onRevealContent = useHomePostCardStore(
    (state) => state.handlers.onRevealContent
  );

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

  const handleFollowPress = useCallback(() => {
    logPress({ name: "post_follow", postId: post.id });
    onFollowPress?.(
      post.author.id,
      post.author.username,
      isFollowing
    );
  }, [onFollowPress, post.author.id, post.author.username, post.id, isFollowing]);

  const handleRevealContent = useCallback(() => {
    logPress({ name: "post_reveal", postId: post.id });
    onRevealContent?.(post.id);
  }, [onRevealContent, post.id]);

  const postWithFollowing = useMemo(() => {
    const current = post.isFollowing ?? false;
    if (current === isFollowing) return post;
    return { ...post, isFollowing };
  }, [post, isFollowing]);

  return (
    <PostCard
      post={postWithFollowing}
      isOwnPost={isOwnPost}
      isVisible={isVisible}
      onPress={handlePostPress}
      onAuthorPress={handleAuthorPress}
      onMorePress={handleMorePress}
      onLikePress={handleLikePress}
      onDislikePress={handleDislikePress}
      onCommentPress={handleCommentPress}
      onFollowPress={handleFollowPress}
      onRevealContent={handleRevealContent}
      contentRevealed={contentRevealed}
      followLoading={isFollowLoading}
      shareUrl={`https://mirage.app/post/${post.id}`}
    />
  );
});
