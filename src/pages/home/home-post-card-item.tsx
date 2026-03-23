import { memo, useCallback, useMemo, useRef, useEffect } from "react";
import type { Post } from "@/src/components/molecules";
import { PostCard } from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { logPress } from "@/src/utils/press-logger";
import { getShareBaseUrl, useTimeTickStore } from "@/src/stores";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import {
  useHomePostCardStore,
  useAllowAutoplay,
  useFeedActive,
  useIsFollowing,
  useIsTopicFollowed,
  useIsOwnPost,
  useIsPostRevealed,
  useVideoVisibility,
  useShareServer,
  useVoteOverride,
  useCommentCountOverride,
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
 if (prev.awards?.length !== next.awards?.length) return false;
  if (prevProps.feedScreen !== nextProps.feedScreen) return false;
 return true;
}

// Get handlers from store without subscribing to changes
const getHandlers = () => useHomePostCardStore.getState().handlers;

export const HomePostCardItem = memo(function HomePostCardItem({
 post,
  feedScreen,
}: HomePostCardItemProps) {
 const visibility = useVideoVisibility(post.id, feedScreen);
 const isVisible = (visibility & 2) !== 0;
 const isFocused = (visibility & 1) !== 0;
 const isFollowing = useIsFollowing(post.author.id);
 const isTopicFollowed = useIsTopicFollowed(post.topic);
 const contentRevealed = useIsPostRevealed(post.id);
 const voteOverride = useVoteOverride(post.id);
 const commentCountOverride = useCommentCountOverride(post.id);
 const isOwnPost = useIsOwnPost(post.author.id);
 const isTopicDisabled = useIsTopicDisabled(post.topic);
 const shareServer = useShareServer();
 const allowAutoplay = useAllowAutoplay();
  const feedActive = useFeedActive(feedScreen);
  const timeTick = useTimeTickStore((s) => s.tick);

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
    getHandlers().onMorePress?.(postRef.current);
  }, []);

 const handleLikePress = useCallback(() => {
   const p = postRef.current;
   const override = voteOverrideRef.current;
   const currentHasLiked = override?.hasLiked ?? p.hasLiked ?? false;
   const currentHasDisliked = override?.hasDisliked ?? p.hasDisliked ?? false;
   const currentLikes = override?.likes ?? p.likes;
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
   const currentLikes = override?.likes ?? p.likes;
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
    if (postHasPlayableVideo(p)) {
      useHomePostCardStore.getState().setActiveVideoPostId(feedScreen, p.id);
    }
  }, [feedScreen]);

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

  const handleBlockTopic = useCallback(() => {
    const p = postRef.current;
    if (!p.topic) return;
    logPress({ name: "post_block_topic", postId: p.id });
    getHandlers().onBlockTopic?.(p.id, p.topic);
  }, []);

  const handleReport = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_report", postId: p.id });
    getHandlers().onReport?.(p.id);
  }, []);

  const editOverride = usePostEditStore((s) => s.overrides[post.id]);

  const displayPost = useMemo(() => {
    let result = { ...post };
    const needsFollowingUpdate = (post.isFollowing ?? false) !== isFollowing;
    const needsVoteUpdate = !!voteOverride;
    const needsCommentCountUpdate = !!commentCountOverride;
    if (needsFollowingUpdate || needsVoteUpdate || needsCommentCountUpdate) {
      result = {
        ...result,
        isFollowing,
        ...(voteOverride && {
          likes: voteOverride.likes ?? post.likes,
          hasLiked: voteOverride.hasLiked ?? post.hasLiked,
          hasDisliked: voteOverride.hasDisliked ?? post.hasDisliked,
        }),
        ...(commentCountOverride && {
          comments: post.comments + (commentCountOverride.commentDelta ?? 0),
        }),
      };
    }
    if (editOverride) {
      result = {
        ...result,
        title: editOverride.title,
        body: editOverride.content || undefined,
        topic: editOverride.topic ?? result.topic,
        media: editOverride.media
          ? editOverride.media.map((url) => ({ uri: url, type: "image" as const }))
          : result.media,
      };
    }
    return result;
  }, [post, isFollowing, voteOverride, commentCountOverride, editOverride, timeTick]);

  return (
   <PostCard
     post={displayPost}
     isOwnPost={isOwnPost}
     isVisible={isVisible}
     isFocused={isFocused}
     isTopicFollowed={isTopicFollowed}
      showFollowButton={true}
     showUrlCard={false}
     allowAutoplay={allowAutoplay}
      screenActive={feedActive}
      onPress={handlePostPress}
      onAuthorPress={handleAuthorPress}
      onTopicPress={handleTopicPress}
      topicDisabled={isTopicDisabled}
      onMorePress={handleMorePress}
     directFollowUser={feedScreen === 'topic'}
      onLikePress={handleLikePress}
      onDislikePress={handleDislikePress}
      onCommentPress={handleCommentPress}
     onFollowUser={handleFollowUser}
     onFollowTopic={handleFollowTopic}
     onRevealContent={handleRevealContent}
     onBlockUser={handleBlockUser}
     onBlockPost={handleBlockPost}
     onBlockTopic={handleBlockTopic}
     onReport={handleReport}
    onMediaPress={handlePostPress}
    contentRevealed={contentRevealed}
      shareUrl={`${getShareBaseUrl(shareServer)}/p/${post.id}`}
  />
  );
}, areHomePostCardItemPropsEqual);
