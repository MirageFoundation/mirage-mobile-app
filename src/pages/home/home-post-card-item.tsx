import { memo, useCallback, useMemo, useRef, useEffect } from "react";
import type { Post } from "@/src/components/molecules";
import { PostCard } from "@/src/components/molecules";
import { logPress } from "@/src/utils/press-logger";
import { getShareBaseUrl } from "@/src/stores";
import {
  useHomePostCardStore,
  useAllowAutoplay,
  useFeedActive,
  useIsFollowing,
  useIsTopicFollowed,
  useIsOwnPost,
  useIsPostRevealed,
  useIsPostVisible,
  useShareServer,
  useVoteOverride,
  useIsTopicDisabled,
} from "./home-post-card-store";

type HomePostCardItemProps = {
 post: Post;
  feedScreen: 'home' | 'following' | 'topic';
};

function areHomePostCardItemPropsEqual(
  prevProps: HomePostCardItemProps,
  nextProps: HomePostCardItemProps
): boolean {
  const prev = prevProps.post;
  const next = nextProps.post;
  
  if (prev.id !== next.id) return false;
  if (prev.likes !== next.likes) return false;
  if (prev.dislikes !== next.dislikes) return false;
  if (prev.comments !== next.comments) return false;
 if (prev.hasLiked !== next.hasLiked) return false;
 if (prev.hasDisliked !== next.hasDisliked) return false;
  if (prevProps.feedScreen !== nextProps.feedScreen) return false;
 return true;
}

// Get handlers from store without subscribing to changes
const getHandlers = () => useHomePostCardStore.getState().handlers;

export const HomePostCardItem = memo(function HomePostCardItem({
 post,
  feedScreen,
}: HomePostCardItemProps) {
 const isVisible = useIsPostVisible(post.id);
 const isFollowing = useIsFollowing(post.author.id);
 const isTopicFollowed = useIsTopicFollowed(post.topic);
 const contentRevealed = useIsPostRevealed(post.id);
 const voteOverride = useVoteOverride(post.id);
 const isOwnPost = useIsOwnPost(post.author.id);
 const isTopicDisabled = useIsTopicDisabled(post.topic);
 const shareServer = useShareServer();
 const allowAutoplay = useAllowAutoplay();
  const feedActive = useFeedActive(feedScreen);

// Store post data in ref to avoid recreating callbacks
 const postRef = useRef(post);
 const isFollowingRef = useRef(isFollowing);
 const isTopicFollowedRef = useRef(isTopicFollowed);
  const voteOverrideRef = useRef(voteOverride);
 
 useEffect(() => {
   postRef.current = post;
   isFollowingRef.current = isFollowing;
   isTopicFollowedRef.current = isTopicFollowed;
   voteOverrideRef.current = voteOverride;
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

  const handleTopicPress = useCallback(() => {
    const p = postRef.current;
    if (!p.topic) return;
    if (useHomePostCardStore.getState().disabledTopicName === p.topic) return;
    getHandlers().onTopicPress?.(p.topic);
  }, []);

  const handleMorePress = useCallback(() => {
    getHandlers().onMorePress?.(postRef.current.id);
  }, []);

 const handleLikePress = useCallback(() => {
   const p = postRef.current;
   const override = voteOverrideRef.current;
   const currentHasLiked = override?.hasLiked ?? p.hasLiked ?? false;
   const currentHasDisliked = override?.hasDisliked ?? p.hasDisliked ?? false;
   const currentLikes = p.likes + (override?.likeDelta ?? 0);
   logPress({ name: "post_like", postId: p.id });
   getHandlers().onLikePress?.(
     p.id,
     currentHasLiked,
     currentHasDisliked,
     currentLikes
   );
 }, []);

 const handleDislikePress = useCallback(() => {
   const p = postRef.current;
   const override = voteOverrideRef.current;
   const currentHasLiked = override?.hasLiked ?? p.hasLiked ?? false;
   const currentHasDisliked = override?.hasDisliked ?? p.hasDisliked ?? false;
   const currentLikes = p.likes + (override?.likeDelta ?? 0);
   logPress({ name: "post_dislike", postId: p.id });
   getHandlers().onDislikePress?.(
     p.id,
     currentHasLiked,
     currentHasDisliked,
     currentLikes
   );
 }, []);

  const handleCommentPress = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_comment", postId: p.id });
    getHandlers().onCommentPress?.(p.id);
  }, []);

  const handleFollowUser = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_follow_user", postId: p.id });
    getHandlers().onFollowUser?.(p.author.id, p.author.username, isFollowingRef.current);
  }, []);

  const handleFollowTopic = useCallback(() => {
    const p = postRef.current;
    if (!p.topic) return;
    logPress({ name: "post_follow_topic", postId: p.id });
    getHandlers().onFollowTopic?.(p.topic, isTopicFollowedRef.current);
  }, []);

  const handleRevealContent = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_reveal", postId: p.id });
    getHandlers().onRevealContent?.(p.id);
  }, []);

  const handleBlockUser = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_block_user", postId: p.id });
    getHandlers().onBlockUser?.(p.id, p.author.id, p.author.username);
  }, []);

  const handleBlockPost = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_block_post", postId: p.id });
    getHandlers().onBlockPost?.(p.id);
  }, []);

  const handleReport = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_report", postId: p.id });
    getHandlers().onReport?.(p.id);
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
      isTopicFollowed={isTopicFollowed}
      showFollowButton={false}
      showUrlCard={false}
      allowAutoplay={allowAutoplay}
      screenActive={feedActive}
      onPress={handlePostPress}
      onAuthorPress={handleAuthorPress}
      onTopicPress={handleTopicPress}
      topicDisabled={isTopicDisabled}
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
    onMediaPress={handlePostPress}
    contentRevealed={contentRevealed}
      shareUrl={`${getShareBaseUrl(shareServer)}/view_post?post_id=${post.id}`}
  />
  );
}, areHomePostCardItemPropsEqual);
