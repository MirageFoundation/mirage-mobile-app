import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { Image } from "expo-image";
import { memo, useCallback, useMemo, useRef } from "react";
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Avatar } from "@/src/components/atoms/avatar";
import { ContentWarningBadge } from "@/src/components/atoms/content-warning-badge";
import { TimeAgo } from "@/src/components/atoms/time-ago";
import { Text } from "@/src/components/ui/primitives";
import { logPress } from "@/src/utils/press-logger";
import { setLastPressedPostY } from "@/src/utils/post-transition";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { usePreferencesStore } from "@/src/stores";
import { getUsernameColor } from "@/src/utils/tiers";

import { PostActions } from "./post-actions";
import type { Post } from "./post-card-types";
import {
  extractYouTubeVideoId,
  getVideoThumbnailUri,
  resolvePostContent,
  shouldBlurMatureMedia,
} from "./post-card-utils";

const NEW_USER_COLOR = "rgb(94,194,106)";

const THUMB_SIZE = 72;

type PostCardCompactProps = {
  post: Post;
  isOwnPost?: boolean;
  isCommunityJoined?: boolean;
  contentRevealed?: boolean;
  shareUrl?: string;
  showFollowButton?: boolean;
  showMoreButton?: boolean;
  communityDisabled?: boolean;
  hideCommentAction?: boolean;
  onPress?: () => void;
  onAuthorPress?: () => void;
  onCommunityPress?: () => void;
  onFollowUser?: () => void;
  onToggleCommunityMembership?: () => void;
  onMorePress?: () => void;
  onLikePress?: () => void;
  onDislikePress?: () => void;
  onCommentPress?: () => void;
  onSharePress?: () => void;
  onBlockUser?: () => void;
  onBlockPost?: () => void;
  onBlockCommunity?: () => void;
  onReport?: () => void;
  onHidePost?: () => void;
  onRevealContent?: () => void;
  onMediaPress?: () => void;
  onOptimisticRetryPress?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

export const PostCardCompact = memo(function PostCardCompact({
  post,
  isOwnPost = false,
  contentRevealed = false,
  shareUrl,
  hideCommentAction = false,
  communityDisabled = false,
  onPress,
  onAuthorPress,
  onCommunityPress,
  onLikePress,
  onDislikePress,
  onCommentPress,
  onSharePress,
  onBlockUser,
  onBlockPost,
  onBlockCommunity,
  onReport,
  onHidePost,
  onRevealContent,
  onMediaPress,
  onOptimisticRetryPress,
  onLayout,
  style,
}: PostCardCompactProps) {
  const { theme } = useUnistyles();
  const containerRef = useRef<View>(null);

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
    createdAt,
    community,
    optimisticStatus,
    optimisticError,
  } = post;

  const blurSensitiveMedia = usePreferencesStore((s) => s.blurSensitiveMedia);
  const shouldBlurContent = shouldBlurMatureMedia(
    blurSensitiveMedia,
    contentWarnings,
    contentRevealed,
  );

  const resolved = useMemo(
    () => resolvePostContent(body, media),
    [body, media],
  );

  const resolvedMedia = resolved.resolvedMedia;
  const isVideoThumb =
    resolvedMedia?.type === "video" || resolvedMedia?.type === "youtube";
  const isGifThumb = resolvedMedia?.type === "gif";
  const thumbUri = useMemo(() => {
    if (!resolvedMedia) return null;
    if (resolvedMedia.type === "youtube") {
      const ytId = extractYouTubeVideoId(resolvedMedia.uri);
      if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    }
    if (resolvedMedia.type === "video") {
      const videoThumb = getVideoThumbnailUri(
        resolvedMedia.uri,
        resolvedMedia.posterUri,
      );
      if (videoThumb) return videoThumb;
      if (resolvedMedia.posterUri) return resolvedMedia.posterUri;
      return null;
    }
    return resolvedMedia.posterUri ?? resolvedMedia.uri ?? null;
  }, [resolvedMedia]);
  const hasMediaSlot = !!thumbUri;
  const avatarSeed = author.avatarSeed ?? author.id ?? author.username;

  const usernameColor = useMemo(() => {
    if (author.isNewUser) return NEW_USER_COLOR;
    if (author.level != null) {
      const tierColor = getUsernameColor(author.level);
      if (tierColor) return tierColor;
    }
    return theme.colors.text.subtle;
  }, [author.isNewUser, author.level, theme.colors.text.subtle]);

  const disableInteractions =
    !!optimisticStatus && optimisticStatus !== "success";

  const handlePress = useCallback(() => {
    if (disableInteractions) return;
    triggerHaptic("selection");
    logPress({ name: "post_card_compact", postId: post.id });
    if (containerRef.current) {
      containerRef.current.measureInWindow((_x, y) => {
        setLastPressedPostY(y);
        onPress?.();
      });
    } else {
      onPress?.();
    }
  }, [disableInteractions, onPress, post.id]);

  const handleThumbPress = useCallback(() => {
    if (disableInteractions) return;
    if (shouldBlurContent) {
      onRevealContent?.();
      return;
    }
    if (onMediaPress) {
      onMediaPress();
      return;
    }
    handlePress();
  }, [disableInteractions, handlePress, onMediaPress, onRevealContent, shouldBlurContent]);

  const handleAuthorPress = useCallback(() => {
    if (disableInteractions) return;
    triggerHaptic("selection");
    onAuthorPress?.();
  }, [disableInteractions, onAuthorPress]);

  const handleCommunityPress = useCallback(() => {
    if (disableInteractions || communityDisabled || !community) return;
    triggerHaptic("selection");
    onCommunityPress?.();
  }, [disableInteractions, onCommunityPress, community, communityDisabled]);

  const optimisticStatusColor =
    optimisticStatus === "error"
      ? theme.colors.error[500]
      : optimisticStatus === "success"
      ? theme.colors.success[500]
      : theme.colors.warning[500];

  const optimisticCardStyle = optimisticStatus
    ? {
        backgroundColor: optimisticStatusColor + "08",
        borderLeftColor: optimisticStatusColor,
        borderLeftWidth: 3,
      }
    : null;

  return (
    <Pressable
      ref={containerRef}
      onLayout={onLayout}
      onPress={handlePress}
      disabled={disableInteractions}
      style={[styles.container, optimisticCardStyle, style]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={handleThumbPress}
          disabled={disableInteractions}
          style={[
            styles.thumb,
            { backgroundColor: theme.colors.background.subtle },
          ]}
        >
          {hasMediaSlot ? (
            <>
              <Image
                source={{ uri: thumbUri! }}
                style={styles.thumbImage}
                contentFit="cover"
                blurRadius={shouldBlurContent ? 24 : 0}
                transition={120}
                cachePolicy="memory-disk"
                onError={(event) => {
                  Sentry.addBreadcrumb({
                    category: "compact-thumb",
                    message: "Compact post thumbnail failed to load",
                    level: "warning",
                    data: {
                      postId: post.id,
                      mediaType: resolvedMedia?.type,
                      uri: thumbUri,
                      error: String(event?.error ?? "unknown"),
                    },
                  });
                }}
              />
              {(isVideoThumb || isGifThumb) && !shouldBlurContent && (
                <View style={styles.thumbBadge}>
                  <Ionicons
                    name={isGifThumb ? "infinite" : "play"}
                    size={14}
                    color="#FFFFFF"
                  />
                </View>
              )}
              {shouldBlurContent && (
                <View style={styles.thumbBadgeCenter}>
                  <Ionicons name="eye-off" size={18} color="#FFFFFF" />
                </View>
              )}
            </>
          ) : (
            <Avatar
              seed={avatarSeed}
              size={THUMB_SIZE}
              rounded="md"
              containerStyle={styles.avatarContainer}
            />
          )}
        </Pressable>

        <View style={styles.content}>
          <View style={styles.metaRow}>
            {community ? (
              <Pressable
                onPress={handleCommunityPress}
                hitSlop={4}
                disabled={disableInteractions || communityDisabled}
              >
                <Text
                  size="sm"
                  weight="medium"
                  numberOfLines={1}
                  style={{ color: theme.colors.text.subtle }}
                >
                  [{community}]
                </Text>
              </Pressable>
            ) : null}
            {community ? (
              <Text size="sm" style={{ color: theme.colors.text.subtle }}>
                ·
              </Text>
            ) : null}
            <Pressable
              onPress={handleAuthorPress}
              hitSlop={4}
              disabled={disableInteractions}
            >
              <Text
                size="sm"
                weight="semibold"
                numberOfLines={1}
                style={{ color: usernameColor }}
              >
                @{author.username}
              </Text>
            </Pressable>
            <Text size="sm" style={{ color: theme.colors.text.subtle }}>
              ·
            </Text>
            <TimeAgo
              timestamp={createdAt}
              size="sm"
              style={{ color: theme.colors.text.subtle }}
            />
          </View>

          {contentWarnings && contentWarnings.length > 0 && (
            <View style={styles.warningBadge}>
              <ContentWarningBadge types={contentWarnings} compact />
            </View>
          )}

          <Text
            size="md"
            weight="semibold"
            numberOfLines={2}
            style={styles.title}
          >
            {title}
          </Text>

          <PostActions
            moderationTarget={{ postId: post.id, authorId: author.id, community: post.rootCommunity || post.community, lens: post.lens }}
            likes={likes}
            dislikes={dislikes}
            comments={comments}
            hasLiked={hasLiked}
            hasDisliked={hasDisliked}
            onLikePress={disableInteractions ? undefined : onLikePress}
            onDislikePress={disableInteractions ? undefined : onDislikePress}
            onCommentPress={disableInteractions ? undefined : onCommentPress}
            onSharePress={disableInteractions ? undefined : onSharePress}
            shareUrl={shareUrl}
            shareTitle={title}
            isOwnPost={isOwnPost}
            authorUsername={author.username}
            onBlockUser={disableInteractions ? undefined : onBlockUser}
            onBlockPost={disableInteractions ? undefined : onBlockPost}
            onBlockCommunity={disableInteractions ? undefined : onBlockCommunity}
            community={community}
            onReport={disableInteractions ? undefined : onReport}
            postId={post.id}
            onHidePost={disableInteractions ? undefined : onHidePost}
            hideCommentAction={hideCommentAction}
            size="sm"
            style={styles.actions}
            disabled={disableInteractions}
          />
        </View>
      </View>

      {optimisticStatus === "error" && onOptimisticRetryPress && (
        <Pressable
          onPress={onOptimisticRetryPress}
          hitSlop={8}
          style={[
            styles.retryButton,
            { backgroundColor: theme.colors.error[500] },
          ]}
        >
          <Text size="xs" weight="bold" style={{ color: "#FFFFFF" }}>
            {optimisticError ? "Try posting again" : "Try posting again"}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    backgroundColor: theme.colors.background.default,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImage: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
  },
  avatarContainer: {
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  thumbBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbBadgeCenter: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderRadius: 999,
    padding: 6,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  warningBadge: {
    marginTop: theme.spacing.xs,
  },
  title: {
    marginTop: theme.spacing.xs,
    lineHeight: 20,
  },
  actions: {
    marginTop: theme.spacing.xs,
    // Action row must inherit the right column width — otherwise its
    // intrinsic content size can push the trailing buttons (share / more
    // menu) past the right edge on narrow Android devices.
    alignSelf: "stretch",
    width: "100%",
    overflow: "hidden",
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },
}));
