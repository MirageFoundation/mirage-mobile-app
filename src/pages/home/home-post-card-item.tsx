import { memo, useCallback, useMemo, useRef, useEffect } from "react";
import type { LayoutChangeEvent } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { Post } from "@/src/components/molecules";
import { PostCard, PostCardCompact } from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { isCommunityJoined as isCommunityJoinedByViewer } from "@/src/domain/communities";
import { logPress } from "@/src/utils/press-logger";
import { markSeen } from "@/src/services/seen-posts";
import { getShareBaseUrl, useFeedDensity } from "@/src/stores";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import { useDraftStore } from "@/src/stores/draft-store";
import { router } from "@/src/navigation/guarded-router";
import { markOptimisticPostError, removeOptimisticPostFromCache } from "@/src/api/write/hooks/use-post";
import { useCreateComposeState } from "@/src/pages/create/create-compose-state";
import {
  useIsPowActionCurrent,
  useIsPowActionQueued,
} from "@/src/services/pow-queue";
import {
  useVoteOverride,
  useCommentCountOverride,
} from "@/src/stores/home-post-card-store";
import {
  useFeedPostCardRuntime,
  useFeedPostCardSelector,
} from "./feed-post-card-runtime";

type HomePostCardItemProps = {
 post: Post;
  feedScreen: 'home' | 'following' | 'community';
  feedContext: string;
  onLayout?: (postId: string, event: LayoutChangeEvent) => void;
};

const APP_STARTED_AT = Date.now();

const getCreatedAtMs = (createdAt: Post["createdAt"]): number => {
  if (typeof createdAt === "number") return createdAt;
  if (createdAt instanceof Date) return createdAt.getTime();
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const HomePostCardItem = memo(function HomePostCardItem({
 post,
  feedScreen,
  feedContext,
  onLayout,
}: HomePostCardItemProps) {
 const queryClient = useQueryClient();
 const feedRuntime = useFeedPostCardRuntime();
 const visibility = useFeedPostCardSelector((state) =>
   (state.visiblePostIds.has(post.id) ? 2 : 0) |
   (state.activePostId === post.id ? 1 : 0) |
   (state.nearbyPostIds.has(post.id) ? 4 : 0),
 );
 const isVisible = (visibility & 2) !== 0;
 const isFocused = (visibility & 1) !== 0;
 const isNearVisible = (visibility & 4) !== 0;
 const isFollowing = useFeedPostCardSelector((state) =>
   state.followUserOverrides[post.author.id] ?? state.followedUsers.has(post.author.id),
 );
 // `joinedCommunities` is normalized (lowercase); post topics keep display casing.
 const isCommunityJoined = useFeedPostCardSelector((state) =>
   isCommunityJoinedByViewer(state.joinedCommunities, post.community),
 );
 const contentRevealed = useFeedPostCardSelector((state) => state.revealedPosts.has(post.id));
 const voteOverride = useVoteOverride(post.id);
 const commentCountOverride = useCommentCountOverride(post.id);
 const isOwnPost = useFeedPostCardSelector((state) => state.currentUserId === post.author.id);
 const isCommunityDisabled = useFeedPostCardSelector((state) =>
   post.community ? state.disabledCommunityName === post.community : false,
 );
 const shareServer = useFeedPostCardSelector((state) => state.shareServer);
 const allowAutoplay = useFeedPostCardSelector((state) => state.allowAutoplay);
 const feedActive = useFeedPostCardSelector((state) => state.active);
 const [feedDensity] = useFeedDensity();
 const isOptimisticActionCurrent = useIsPowActionCurrent(
   post.optimisticActionId,
 );
 const isOptimisticActionQueued = useIsPowActionQueued(
   post.optimisticActionId,
 );
 const optimisticQueueState = useMemo(
   () => ({
     isCurrent: isOptimisticActionCurrent,
     isQueued: isOptimisticActionQueued,
   }),
   [isOptimisticActionCurrent, isOptimisticActionQueued],
 );

// Store post data in ref to avoid recreating callbacks
 const postRef = useRef(post);
 const isFollowingRef = useRef(isFollowing);
 const isCommunityJoinedRef = useRef(isCommunityJoined);
  const voteOverrideRef = useRef(voteOverride);
 
 useEffect(() => {
   postRef.current = post;
   isFollowingRef.current = isFollowing;
   isCommunityJoinedRef.current = isCommunityJoined;
   voteOverrideRef.current = voteOverride;
 });

 useEffect(() => {
   if (post.optimisticStatus !== "pending") return;
   if (
     post.optimisticActionId &&
     (isOptimisticActionCurrent || isOptimisticActionQueued)
   ) {
     return;
   }
   const optimisticCreatedAt = post.id.startsWith("optimistic-post-")
     ? Number(post.id.replace("optimistic-post-", ""))
     : NaN;
   if (Number.isFinite(optimisticCreatedAt) && Date.now() - optimisticCreatedAt < 15000) {
     return;
   }
   if (
     post.optimisticDraft?.attachmentType === "video" &&
     post.optimisticVideoPreviewUntil &&
     post.optimisticVideoPreviewUntil > Date.now() &&
     getCreatedAtMs(post.createdAt) >= APP_STARTED_AT - 5000
   ) {
     return;
   }
   markOptimisticPostError(
     queryClient,
     post.id,
     "Posting was interrupted. Please try posting again.",
   );
 }, [
   isOptimisticActionCurrent,
   isOptimisticActionQueued,
   post.id,
   post.optimisticActionId,
   post.createdAt,
   post.optimisticDraft?.attachmentType,
   post.optimisticStatus,
   post.optimisticVideoPreviewUntil,
   queryClient,
 ]);

  // Stable callbacks that read from refs
  const handlePostPress = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_card_item", postId: p.id });
    feedRuntime.getState().handlers.onPostPress?.(p.id);
  }, [feedRuntime]);

  const handleAuthorPress = useCallback(() => {
    feedRuntime.getState().handlers.onAuthorPress?.(postRef.current.author.id);
  }, [feedRuntime]);

  const handleCommunityPress = useCallback(() => {
    const p = postRef.current;
    if (!p.community) return;
    if (feedRuntime.getState().disabledCommunityName === p.community) return;
    feedRuntime.getState().handlers.onCommunityPress?.(p.community);
  }, [feedRuntime]);

  const handleMorePress = useCallback(() => {
    feedRuntime.getState().handlers.onMorePress?.(postRef.current);
  }, [feedRuntime]);

 const handleLikePress = useCallback(() => {
   const p = postRef.current;
   const override = voteOverrideRef.current;
   const currentHasLiked = override?.hasLiked ?? p.hasLiked ?? false;
   const currentHasDisliked = override?.hasDisliked ?? p.hasDisliked ?? false;
   const currentLikes = override?.likes ?? p.likes;
   logPress({ name: "post_like", postId: p.id });
   feedRuntime.getState().handlers.onLikePress?.(
     p.id,
     currentHasLiked,
     currentHasDisliked,
     currentLikes
   );
 }, [feedRuntime]);

 const handleDislikePress = useCallback(() => {
   const p = postRef.current;
   const override = voteOverrideRef.current;
   const currentHasLiked = override?.hasLiked ?? p.hasLiked ?? false;
   const currentHasDisliked = override?.hasDisliked ?? p.hasDisliked ?? false;
   const currentLikes = override?.likes ?? p.likes;
   logPress({ name: "post_dislike", postId: p.id });
   feedRuntime.getState().handlers.onDislikePress?.(
     p.id,
     currentHasLiked,
     currentHasDisliked,
     currentLikes
   );
 }, [feedRuntime]);

  const handleCommentPress = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_comment", postId: p.id });
    feedRuntime.getState().handlers.onCommentPress?.(p.id);
  }, [feedRuntime]);

  const handleFollowUser = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_follow_user", postId: p.id });
    feedRuntime.getState().handlers.onFollowUser?.(p.author.id, p.author.username, isFollowingRef.current);
  }, [feedRuntime]);

  const handleToggleCommunityMembership = useCallback(() => {
    const p = postRef.current;
    if (!p.community) return;
    logPress({ name: "post_follow_topic", postId: p.id });
    feedRuntime.getState().handlers.onToggleCommunityMembership?.(p.community, isCommunityJoinedRef.current);
  }, [feedRuntime]);

  const handleRevealContent = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_reveal", postId: p.id });
    markSeen(p.id, "open", p.title);
    feedRuntime.getState().handlers.onRevealContent?.(p.id);
    if (postHasPlayableVideo(p)) {
      feedRuntime.setActivePostId(p.id);
    }
  }, [feedRuntime]);

  const handleBlockUser = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_block_user", postId: p.id });
    feedRuntime.getState().handlers.onBlockUser?.(p.id, p.author.id, p.author.username);
  }, [feedRuntime]);

  const handleBlockPost = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_block_post", postId: p.id });
    feedRuntime.getState().handlers.onBlockPost?.(p.id);
  }, [feedRuntime]);

  const handleBlockCommunity = useCallback(() => {
    const p = postRef.current;
    if (!p.community) return;
    logPress({ name: "post_block_topic", postId: p.id });
    feedRuntime.getState().handlers.onBlockCommunity?.(p.id, p.community);
  }, [feedRuntime]);

  const handleReport = useCallback(() => {
    const p = postRef.current;
    logPress({ name: "post_report", postId: p.id });
    feedRuntime.getState().handlers.onReport?.(p.id);
  }, [feedRuntime]);

  const editOverride = usePostEditStore((s) => s.overrides[post.id]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    onLayout?.(post.id, event);
  }, [onLayout, post.id]);

  const handleOptimisticRetryPress = useCallback(() => {
    const p = postRef.current;
    if (p.optimisticDraft) {
      useDraftStore.setState({ draft: p.optimisticDraft, hasDraft: true });
      useCreateComposeState.getState().setSelectedStickers(p.optimisticDraft.stickerUrls ?? []);
    }
    removeOptimisticPostFromCache(queryClient, p.id);
    router.replace("/create");
  }, [queryClient]);

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
        ...(commentCountOverride && post.comments === commentCountOverride.baseComments && {
          comments: commentCountOverride.baseComments + (commentCountOverride.commentDelta ?? 0),
        }),
      };
    }
    if (editOverride) {
      result = {
        ...result,
        title: editOverride.title,
        body: editOverride.content || undefined,
        community: editOverride.community ?? result.community,
        media: editOverride.media
          ? editOverride.media.map((url) => ({ uri: url, type: "image" as const }))
          : result.media,
      };
    }
    return result;
  }, [post, isFollowing, voteOverride, commentCountOverride, editOverride]);

  if (feedDensity === "compact") {
    return (
      <PostCardCompact
        post={displayPost}
        isOwnPost={isOwnPost}
        isCommunityJoined={isCommunityJoined}
        communityDisabled={isCommunityDisabled}
        contentRevealed={contentRevealed}
        shareUrl={`${getShareBaseUrl(shareServer)}/p/${post.id}`}
        onPress={handlePostPress}
        onAuthorPress={handleAuthorPress}
        onCommunityPress={handleCommunityPress}
        onMorePress={handleMorePress}
        onLikePress={handleLikePress}
        onDislikePress={handleDislikePress}
        onCommentPress={handleCommentPress}
        onFollowUser={handleFollowUser}
        onToggleCommunityMembership={handleToggleCommunityMembership}
        onRevealContent={handleRevealContent}
        onBlockUser={handleBlockUser}
        onBlockPost={handleBlockPost}
        onBlockCommunity={handleBlockCommunity}
        onReport={handleReport}
        onMediaPress={handlePostPress}
        onLayout={handleLayout}
        onOptimisticRetryPress={
          displayPost.optimisticStatus === "error"
            ? handleOptimisticRetryPress
            : undefined
        }
      />
    );
  }

  return (
   <PostCard
     post={displayPost}
     isOwnPost={isOwnPost}
     isVisible={isVisible}
     isFocused={isFocused}
     isNearVisible={isNearVisible}
     isCommunityJoined={isCommunityJoined}
      showFollowButton={true}
     showUrlCard={false}
     allowAutoplay={allowAutoplay}
      screenActive={feedActive}
      allowOptimisticMediaPreview={feedScreen === "home"}
      optimisticQueueState={optimisticQueueState}
      videoSyncScope={feedContext}
      onPress={handlePostPress}
      onAuthorPress={handleAuthorPress}
      onCommunityPress={handleCommunityPress}
      communityDisabled={isCommunityDisabled}
      onMorePress={handleMorePress}
     directFollowUser={feedScreen === 'community'}
      onLikePress={handleLikePress}
      onDislikePress={handleDislikePress}
      onCommentPress={handleCommentPress}
     onFollowUser={handleFollowUser}
     onToggleCommunityMembership={handleToggleCommunityMembership}
     onRevealContent={handleRevealContent}
     onBlockUser={handleBlockUser}
     onBlockPost={handleBlockPost}
     onBlockCommunity={handleBlockCommunity}
     onReport={handleReport}
    onMediaPress={handlePostPress}
    onLayout={handleLayout}
    onOptimisticRetryPress={displayPost.optimisticStatus === "error" ? handleOptimisticRetryPress : undefined}
    contentRevealed={contentRevealed}
      shareUrl={`${getShareBaseUrl(shareServer)}/p/${post.id}`}
  />
  );
});
