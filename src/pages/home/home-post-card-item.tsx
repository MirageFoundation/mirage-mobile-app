import { memo, useCallback, useMemo, useRef, useEffect } from "react";
import type { Post } from "@/src/components/molecules";
import { PostCard } from "@/src/components/molecules";
import { logPress } from "@/src/utils/press-logger";
import { getShareBaseUrl } from "@/src/stores";
import {
  useHomePostCardStore,
  useAllowAutoplay,
  useIsFollowLoading,
  useIsFollowing,
  useIsOwnPost,
  useIsPostRevealed,
  useIsPostVisible,
  useShareServer,
  useVoteOverride,
} from "./home-post-card-store";

type HomePostCardItemProps = {
  post: Post;
};

// Get handlers from store without subscribing to changes
const getHandlers = () => useHomePostCardStore.getState().handlers;

export const HomePostCardItem = memo(function HomePostCardItem({
  post,
}: HomePostCardItemProps) {
  const isVisible = useIsPostVisible(post.id);
  const isFollowing = useIsFollowing(post.author.id);
  const isFollowLoading = useIsFollowLoading(post.author.id);
  const contentRevealed = useIsPostRevealed(post.id);
  const voteOverride = useVoteOverride(post.id);
  const isOwnPost = useIsOwnPost(post.author.id);
  const shareServer = useShareServer();
  const allowAutoplay = useAllowAutoplay();

  // Store post data in ref to avoid recreating callbacks
  const postRef = useRef(post);
  const isFollowingRef = useRef(isFollowing);
  
  useEffect(() => {
    postRef.current = post;
    isFollowingRef.current = isFollowing;
  });

  // Stable callbacks that read from refs
  const handlePostPress = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_card_item", postId: p.id });
    getHandlers().onPostPress?.(p.id);
  }, []);

  const handleAuthorPress = useCallback(() => {
    getHandlers().onAuthorPress?.(postRef.current.author.id);
  }, []);

  const handleMorePress = useCallback(() => {
    getHandlers().onMorePress?.(postRef.current.id);
  }, []);

  const handleLikePress = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_like", postId: p.id });
    getHandlers().onLikePress?.(
      p.id,
      p.hasLiked ?? false,
      p.hasDisliked ?? false,
      p.likes
    );
  }, []);

  const handleDislikePress = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_dislike", postId: p.id });
    getHandlers().onDislikePress?.(
      p.id,
      p.hasLiked ?? false,
      p.hasDisliked ?? false,
      p.likes
    );
  }, []);

  const handleCommentPress = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_comment", postId: p.id });
    getHandlers().onCommentPress?.(p.id);
  }, []);

  const handleFollowPress = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_follow", postId: p.id });
    getHandlers().onFollowPress?.(p.author.id, p.author.username, isFollowingRef.current);
  }, []);

  const handleRevealContent = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_reveal", postId: p.id });
    getHandlers().onRevealContent?.(p.id);
  }, []);

  const displayPost = useMemo(() => {
    const needsFollowingUpdate = (post.isFollowing ?? false) !== isFollowing;
    const needsVoteUpdate = !!voteOverride;
    if (!needsFollowingUpdate && !needsVoteUpdate) return post;
    return {
      ...post,
      isFollowing,
      ...(voteOverride && {
        likes: post.likes + (voteOverride.likeDelta ?? 0),
        hasLiked: voteOverride.hasLiked ?? post.hasLiked,
        hasDisliked: voteOverride.hasDisliked ?? post.hasDisliked,
      }),
    };
  }, [post, isFollowing, voteOverride]);

  return (
    <PostCard
      post={displayPost}
      isOwnPost={isOwnPost}
      isVisible={isVisible}
      showFollowButton={false}
      topicPosition="right"
      showUrlCard={false}
      allowAutoplay={allowAutoplay}
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
      shareUrl={`${getShareBaseUrl(shareServer)}/post/${post.id}`}
    />
  );
});
