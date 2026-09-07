import { memo, useCallback, useMemo } from "react";
import { PostCard } from "./post-card";
import { PostCardCompact } from "./post-card-compact";
import type { Post } from "./post-card-types";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import {
  useCommentCountOverride,
  useVoteOverride,
} from "@/src/stores/home-post-card-store";
import { useFeedDensity } from "@/src/stores";
import { logPress } from "@/src/utils/press-logger";
import { markSeen } from "@/src/services/seen-posts";

type PostCardItemProps = {
  post: Post;
 isVisible?: boolean;
 isFocused?: boolean;
 isNearVisible?: boolean;
 screenActive?: boolean;
 isOwnPost?: boolean;
 isCommunityJoined?: boolean;
 contentRevealed?: boolean;
 shareUrl?: string;
  showFollowButton?: boolean;
  showUrlCard?: boolean;
  allowAutoplay?: boolean;
  videoSyncScope?: string;
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
  onToggleCommunityMembership?: (topic: string, isCurrentlyFollowed: boolean) => void;
  onRevealContent?: (postId: string) => void;
  onBlockUser?: (postId: string, authorId: string, authorUsername: string) => void;
  onBlockPost?: (postId: string) => void;
  onBlockCommunity?: (postId: string, topic: string) => void;
  onReport?: (postId: string) => void;
  onCommunityPress?: (topic: string) => void;
};

export const PostCardItem = memo(function PostCardItem({
post,
isVisible = false,
isFocused,
isNearVisible,
screenActive = true,
isOwnPost = false,
isCommunityJoined = false,
contentRevealed = false,
shareUrl,
  showFollowButton = true,
  showUrlCard,
  allowAutoplay,
  videoSyncScope,
onPostPress,
  onAuthorPress,
  onMorePress,
  onLikePress,
  onDislikePress,
  onCommentPress,
  onFollowUser,
  onToggleCommunityMembership,
  onRevealContent,
  onBlockUser,
  onBlockPost,
  onBlockCommunity,
  onReport,
  onCommunityPress,
}: PostCardItemProps) {
  const editOverride = usePostEditStore((s) => s.overrides[post.id]);
  const voteOverride = useVoteOverride(post.id);
  const commentCountOverride = useCommentCountOverride(post.id);
  const [feedDensity] = useFeedDensity();
  const displayPost = useMemo(() => {
    let result = post;

    if (voteOverride) {
      result = {
        ...result,
        likes: voteOverride.likes ?? result.likes,
        hasLiked: voteOverride.hasLiked ?? result.hasLiked,
        hasDisliked: voteOverride.hasDisliked ?? result.hasDisliked,
      };
    }

    if (commentCountOverride && result.comments === commentCountOverride.baseComments) {
      result = {
        ...result,
        comments:
          commentCountOverride.baseComments +
          (commentCountOverride.commentDelta ?? 0),
      };
    }

    if (!editOverride) return result;

    return {
      ...result,
      title: editOverride.title,
      body: editOverride.content || undefined,
      community: editOverride.community ?? result.community,
      media: editOverride.media
        ? editOverride.media.map((url) => ({ uri: url, type: "image" as const }))
        : result.media,
    };
  }, [post, voteOverride, commentCountOverride, editOverride]);

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
    logPress({ name: "post_like", postId: displayPost.id });
    onLikePress?.(
      displayPost.id,
      displayPost.hasLiked ?? false,
      displayPost.hasDisliked ?? false,
      displayPost.likes
    );
  }, [onLikePress, displayPost]);

  const handleDislikePress = useCallback(() => {
    logPress({ name: "post_dislike", postId: displayPost.id });
    onDislikePress?.(
      displayPost.id,
      displayPost.hasLiked ?? false,
      displayPost.hasDisliked ?? false,
      displayPost.likes
    );
  }, [onDislikePress, displayPost]);

  const handleCommentPress = useCallback(() => {
    logPress({ name: "post_comment", postId: post.id });
    onCommentPress?.(post.id);
  }, [onCommentPress, post.id]);

  const handleFollowUser = useCallback(() => {
    logPress({ name: "post_follow_user", postId: post.id });
    onFollowUser?.(post.author.id, post.author.username, displayPost.isFollowing ?? false);
  }, [onFollowUser, post.id, post.author.id, post.author.username, displayPost.isFollowing]);

  const handleToggleCommunityMembership = useCallback(() => {
    if (!post.community) return;
    logPress({ name: "post_follow_topic", postId: post.id });
    onToggleCommunityMembership?.(post.community, isCommunityJoined);
  }, [onToggleCommunityMembership, post.community, post.id, isCommunityJoined]);

  const handleRevealContent = useCallback(() => {
    logPress({ name: "post_reveal", postId: post.id });
    markSeen(post.id, "open", post.title);
    onRevealContent?.(post.id);
  }, [onRevealContent, post.id, post.title]);

  const handleBlockUser = useCallback(() => {
    logPress({ name: "post_block_user", postId: post.id });
    onBlockUser?.(post.id, post.author.id, post.author.username);
  }, [onBlockUser, post.id, post.author.id, post.author.username]);

  const handleBlockPost = useCallback(() => {
    logPress({ name: "post_block_post", postId: post.id });
    onBlockPost?.(post.id);
  }, [onBlockPost, post.id]);

  const handleBlockCommunity = useCallback(() => {
    if (!post.community) return;
    logPress({ name: "post_block_topic", postId: post.id });
    onBlockCommunity?.(post.id, post.community);
  }, [onBlockCommunity, post.id, post.community]);

  const handleReport = useCallback(() => {
    logPress({ name: "post_report", postId: post.id });
    onReport?.(post.id);
  }, [onReport, post.id]);

  const handleCommunityPress = useCallback(() => {
    if (!post.community) return;
    logPress({ name: "post_topic_press", postId: post.id });
    onCommunityPress?.(post.community);
  }, [onCommunityPress, post.community, post.id]);

 if (feedDensity === "compact") {
   return (
     <PostCardCompact
       post={displayPost}
       isOwnPost={isOwnPost}
       isCommunityJoined={isCommunityJoined}
       showFollowButton={showFollowButton}
       contentRevealed={contentRevealed}
       shareUrl={shareUrl}
       onPress={handlePostPress}
       onAuthorPress={handleAuthorPress}
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
       onCommunityPress={handleCommunityPress}
       onMediaPress={handlePostPress}
     />
   );
 }

 return (
   <PostCard
     post={displayPost}
     isOwnPost={isOwnPost}
     isVisible={isVisible}
     isFocused={isFocused ?? isVisible}
     isNearVisible={isNearVisible}
     isCommunityJoined={isCommunityJoined}
      showFollowButton={showFollowButton}
     screenActive={screenActive}
     allowAutoplay={allowAutoplay}
     videoSyncScope={videoSyncScope}
    onPress={handlePostPress}
    onAuthorPress={handleAuthorPress}
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
    onCommunityPress={handleCommunityPress}
     onMediaPress={handlePostPress}
    contentRevealed={contentRevealed}
     shareUrl={shareUrl}
      showUrlCard={showUrlCard}
   />
  );
});
