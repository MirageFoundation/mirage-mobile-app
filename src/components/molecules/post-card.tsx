import { triggerHaptic } from "@/src/components/utils/haptics";
import { logPress } from "@/src/utils/press-logger";
import { memo, useCallback, useMemo, useState } from "react";
import { Linking, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { MediaPreviewModal } from "./media-preview-modal";
import { PostActions } from "./post-actions";
import { PostCardContent } from "./post-card-content";
import { PostCardHeader } from "./post-card-header";
import { PostCardMedia } from "./post-card-media";
import type { Post } from "./post-card-types";
import { resolvePostContent } from "./post-card-utils";

export type { Post, PostAuthor, PostMedia } from "./post-card-types";

type PostCardProps = {
  post: Post;
  isOwnPost?: boolean;
  isVisible?: boolean;
  /** Whether to show the follow button (default: true) */
  showFollowButton?: boolean;
  /** Whether the topic is followed */
  isTopicFollowed?: boolean;
  /** Whether video autoplay is allowed based on user settings and network */
  allowAutoplay?: boolean;
  onPress?: () => void;
  onAuthorPress?: () => void;
  onFollowUser?: () => void;
  onFollowTopic?: () => void;
  onMorePress?: () => void;
  onLikePress?: () => void;
  onDislikePress?: () => void;
  onCommentPress?: () => void;
  onSharePress?: () => void;
  onRevealContent?: () => void;
  contentRevealed?: boolean;
  followLoading?: boolean;
  shareUrl?: string;
  /** Whether to show the URL card/Play Now row (default: true) */
  showUrlCard?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const PostCard = memo(function PostCard({
 post,
 isOwnPost = false,
 isVisible = false,
 showFollowButton = true,
 isTopicFollowed = false,
 allowAutoplay = true,
 onPress,
 onAuthorPress,
 onFollowUser,
 onFollowTopic,
 onMorePress,
 onLikePress,
 onDislikePress,
 onCommentPress,
 onSharePress,
 onRevealContent,
 contentRevealed = false,
 followLoading = false,
 shareUrl,
 showUrlCard = true,
 style,
}: PostCardProps) {
 if (__DEV__) {
   console.log("[render] post_card", post.id);
 }
 const {
   author,
   title,
   body,
   media,
    contentWarnings,
    likes,
    dislikes,
    comments,
    hasLiked,
    hasDisliked,
    isFollowing,
    createdAt,
    topic,
  } = post;

  const shouldBlurContent = !!contentWarnings?.length && !contentRevealed;

  const resolvedContent = useMemo(
    () => resolvePostContent(body, media),
    [body, media]
  );

  const handlePress = useCallback(() => {
    triggerHaptic("selection");
    logPress({ name: "post_card", postId: post.id });
    onPress?.();
  }, [onPress, post.id]);

  const handlePlayNowPress = useCallback(() => {
    if (!resolvedContent.extractedUrl) return;
    triggerHaptic("selection");
    Linking.openURL(resolvedContent.extractedUrl);
  }, [resolvedContent.extractedUrl]);

  const [showMediaPreview, setShowMediaPreview] = useState(false);

  const handleMediaPress = useCallback(() => {
    setShowMediaPreview(true);
  }, []);

  const handleCloseMediaPreview = useCallback(() => {
    setShowMediaPreview(false);
  }, []);

  return (
    <Pressable onPress={handlePress} style={[styles.container, style]}>
      <PostCardHeader
        author={author}
        topic={topic}
        createdAt={createdAt}
        isOwnPost={isOwnPost}
        isFollowing={isFollowing}
        isTopicFollowed={isTopicFollowed}
        followLoading={followLoading}
        showFollowButton={showFollowButton}
        onAuthorPress={onAuthorPress}
        onFollowUser={onFollowUser}
        onFollowTopic={onFollowTopic}
        onMorePress={onMorePress}
      />

      <PostCardContent
        title={title}
        bodyWithoutUrl={resolvedContent.bodyWithoutUrl}
        extractedUrl={resolvedContent.extractedUrl}
        displayDomain={resolvedContent.displayDomain}
        bodyVideoUrl={resolvedContent.bodyVideoUrl}
        shouldBlurContent={shouldBlurContent}
        contentWarnings={contentWarnings}
        showUrlCard={showUrlCard}
        onRevealContent={onRevealContent}
        onPlayNowPress={handlePlayNowPress}
      />

      <PostCardMedia
        media={resolvedContent.resolvedMedia}
        isVisible={isVisible}
        shouldBlurContent={shouldBlurContent}
        hasMultipleMedia={resolvedContent.hasMultipleMedia}
        extraMediaCount={resolvedContent.extraMediaCount}
        allowAutoplay={allowAutoplay}
        onRevealContent={onRevealContent}
        onMediaPress={handleMediaPress}
      />

      <PostActions
        likes={likes}
        dislikes={dislikes}
        comments={comments}
        hasLiked={hasLiked}
        hasDisliked={hasDisliked}
        onLikePress={onLikePress}
        onDislikePress={onDislikePress}
        onCommentPress={onCommentPress}
        onSharePress={onSharePress}
        shareUrl={shareUrl}
        shareTitle={title}
        style={styles.actions}
      />

      <MediaPreviewModal
        visible={showMediaPreview}
        media={resolvedContent.resolvedMedia ?? null}
        onClose={handleCloseMediaPreview}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    backgroundColor: theme.colors.background.default,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  actions: {
    marginTop: theme.spacing.sm,
  },
}));
