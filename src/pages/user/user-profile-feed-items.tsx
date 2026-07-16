import { memo } from "react";

import type { Post as ApiPost } from "@/src/api/types";
import type { Post } from "@/src/components/molecules";
import { PostCardItem } from "@/src/components/molecules/post-card-item";
import { ProfileCommentItem } from "@/src/components/molecules/profile-comment-item";
import { usePostEditStore } from "@/src/stores/post-edit-store";

const MemoizedPostCardItem = memo(PostCardItem, (prev, next) => {
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
 if (p.optimisticStatus !== n.optimisticStatus) return false;
 if (p.optimisticVideoPreviewUntil !== n.optimisticVideoPreviewUntil) return false;
 if (prev.isVisible !== next.isVisible) return false;
 if (prev.isFocused !== next.isFocused) return false;
 if (prev.isNearVisible !== next.isNearVisible) return false;
 if (prev.screenActive !== next.screenActive) return false;
 if (prev.contentRevealed !== next.contentRevealed) return false;
 return true;
});

const MemoizedProfileCommentItem = memo(ProfileCommentItem, (prev, next) => {
 return prev.comment.post_id === next.comment.post_id
  && prev.comment.content === next.comment.content
  && prev.comment.points === next.comment.points;
});

type PostWrapperProps = {
 post: Post;
 isOwnProfile: boolean;
 isVisible?: boolean;
 isFocused?: boolean;
 isNearVisible?: boolean;
 screenActive?: boolean;
 contentRevealed?: boolean;
 shareUrl: string;
 onPostPress: (postId: string) => void;
 onAuthorPress: (authorId: string) => void;
 onCommentPress: (postId: string) => void;
 onMorePress: (postId: string) => void;
 onLikePress: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
 onDislikePress: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
 onBlockUser: (postId: string, authorId: string, authorUsername: string) => void;
 onBlockPost: (postId: string) => void;
 onReport: (postId: string) => void;
 onRevealContent?: (postId: string) => void;
 onTopicPress: (topic: string) => void;
 videoSyncScope?: string;
};

export const UserProfilePostWrapper = memo(function UserProfilePostWrapper({
 post,
 isOwnProfile,
 isVisible,
 isFocused,
 isNearVisible,
 screenActive,
 contentRevealed,
 shareUrl,
 onPostPress,
 onAuthorPress,
 onCommentPress,
 onMorePress,
 onLikePress,
 onDislikePress,
 onBlockUser,
 onBlockPost,
 onReport,
 onRevealContent,
 onTopicPress,
 videoSyncScope,
}: PostWrapperProps) {
 const editOverride = usePostEditStore((s) => s.overrides[post.id]);
 const displayPost = editOverride ? {
   ...post,
   title: editOverride.title,
   body: editOverride.content || undefined,
   topic: editOverride.topic ?? post.topic,
   media: editOverride.media
     ? editOverride.media.map((url: string) => ({ uri: url, type: "image" as const }))
     : post.media,
 } : post;
 return (
   <MemoizedPostCardItem
    post={displayPost}
    isOwnPost={isOwnProfile}
    isVisible={isVisible}
    isFocused={isFocused}
    isNearVisible={isNearVisible}
    screenActive={screenActive}
    contentRevealed={contentRevealed}
    showUrlCard={false}
    videoSyncScope={videoSyncScope}
    showFollowButton={false}
    shareUrl={shareUrl}
    onPostPress={onPostPress}
    onAuthorPress={onAuthorPress}
    onCommentPress={onCommentPress}
    onMorePress={onMorePress}
    onLikePress={onLikePress}
    onDislikePress={onDislikePress}
    onBlockUser={onBlockUser}
    onBlockPost={onBlockPost}
    onReport={onReport}
    onRevealContent={onRevealContent}
    onTopicPress={onTopicPress}
   />
 );
});

export const UserProfileCommentWrapper = memo(function UserProfileCommentWrapper({
 comment,
 onPress,
}: {
 comment: ApiPost;
 onPress: (commentId: string, rootPostId: string) => void;
}) {
 return (
   <MemoizedProfileCommentItem
    comment={comment}
    onPress={onPress}
   />
 );
});
