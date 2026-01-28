import { triggerHaptic } from "@/src/components/utils/haptics";
import { Text } from "@/src/components/ui/primitives";
import { logPress } from "@/src/utils/press-logger";
import { memo, useCallback, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from "react-native";
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
  /** Whether the screen/feed is active (for pausing videos) */
  screenActive?: boolean;
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
  shareUrl?: string;
  /** Whether to show the URL card/Play Now row (default: true) */
  showUrlCard?: boolean;
  style?: StyleProp<ViewStyle>;
};

function arePostCardPropsEqual(
  prevProps: PostCardProps,
  nextProps: PostCardProps,
): boolean {
  const prevPost = prevProps.post;
  const nextPost = nextProps.post;

  if (prevPost.id !== nextPost.id) return false;
  if (prevPost.likes !== nextPost.likes) return false;
  if (prevPost.dislikes !== nextPost.dislikes) return false;
  if (prevPost.comments !== nextPost.comments) return false;
  if (prevPost.hasLiked !== nextPost.hasLiked) return false;
  if (prevPost.hasDisliked !== nextPost.hasDisliked) return false;
  if (prevPost.isFollowing !== nextPost.isFollowing) return false;

  if (prevProps.isOwnPost !== nextProps.isOwnPost) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.showFollowButton !== nextProps.showFollowButton) return false;
  if (prevProps.isTopicFollowed !== nextProps.isTopicFollowed) return false;
  if (prevProps.allowAutoplay !== nextProps.allowAutoplay) return false;
  if (prevProps.screenActive !== nextProps.screenActive) return false;
  if (prevProps.contentRevealed !== nextProps.contentRevealed) return false;
  if (prevProps.shareUrl !== nextProps.shareUrl) return false;
  if (prevProps.showUrlCard !== nextProps.showUrlCard) return false;

  return true;
}

export const PostCard = memo(function PostCard({
  post,
  isOwnPost = false,
  isVisible = false,
  showFollowButton = true,
  isTopicFollowed = false,
  allowAutoplay = true,
  screenActive = true,
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
  shareUrl,
  showUrlCard = true,
  style,
}: PostCardProps) {
  if (__DEV__) {
    //  console.log("[render] post_card", post.id);
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
    [body, media],
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
        showFollowButton={showFollowButton}
        onAuthorPress={onAuthorPress}
        onFollowUser={onFollowUser}
        onFollowTopic={onFollowTopic}
        onMorePress={onMorePress}
      />

      <PostCardContent
        title={title}
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
        screenActive={screenActive && !showMediaPreview}
        onRevealContent={onRevealContent}
        onMediaPress={handleMediaPress}
      />

      {resolvedContent.bodyWithoutUrl && !shouldBlurContent && (
        <Text size="md" style={styles.body}>
          {resolvedContent.bodyWithoutUrl}
        </Text>
      )}

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
}, arePostCardPropsEqual);

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
  body: {
    marginTop: theme.spacing.sm,
    lineHeight: 18,
  },
}));
