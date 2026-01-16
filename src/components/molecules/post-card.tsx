import { triggerHaptic } from "@/src/components/utils/haptics";
import { logPress } from "@/src/utils/press-logger";
import { memo, useCallback, useMemo } from "react";
import { Linking, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

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
  onPress?: () => void;
  onAuthorPress?: () => void;
  onFollowPress?: () => void;
  onMorePress?: () => void;
  onLikePress?: () => void;
  onDislikePress?: () => void;
  onCommentPress?: () => void;
  onSharePress?: () => void;
  onRevealContent?: () => void;
  contentRevealed?: boolean;
  followLoading?: boolean;
  shareUrl?: string;
  style?: StyleProp<ViewStyle>;
};

export const PostCard = memo(function PostCard({
 post,
 isOwnPost = false,
 isVisible = false,
 onPress,
 onAuthorPress,
 onFollowPress,
 onMorePress,
 onLikePress,
 onDislikePress,
 onCommentPress,
 onSharePress,
 onRevealContent,
 contentRevealed = false,
 followLoading = false,
 shareUrl,
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

  return (
    <Pressable onPress={handlePress} style={[styles.container, style]}>
      <PostCardHeader
        author={author}
        topic={topic}
        createdAt={createdAt}
        isOwnPost={isOwnPost}
        isFollowing={isFollowing}
        followLoading={followLoading}
        onAuthorPress={onAuthorPress}
        onFollowPress={onFollowPress}
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
        onRevealContent={onRevealContent}
        onPlayNowPress={handlePlayNowPress}
      />

      <PostCardMedia
        media={resolvedContent.resolvedMedia}
        isVisible={isVisible}
        shouldBlurContent={shouldBlurContent}
        hasMultipleMedia={resolvedContent.hasMultipleMedia}
        extraMediaCount={resolvedContent.extraMediaCount}
        onRevealContent={onRevealContent}
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
