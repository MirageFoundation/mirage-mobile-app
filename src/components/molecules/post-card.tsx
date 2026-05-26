import { triggerHaptic } from "@/src/components/utils/haptics";
import { Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { logPress } from "@/src/utils/press-logger";
import { setLastPressedPostY } from "@/src/utils/post-transition";
import { useIsFeedScrolling, usePreferencesStore } from "@/src/stores";
import { usePowQueueStore } from "@/src/services/pow-queue";
import { useNetworkState } from "@/src/hooks/use-network-state";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { MediaPreviewModal } from "./media-preview-modal";
import { AwardBadges } from "@/src/components/atoms/award-badges";
import { PostActions } from "./post-actions";
import { PostCardContent } from "./post-card-content";
import { PostCardHeader } from "./post-card-header";
import { PostCardMedia } from "./post-card-media";
import type { Post } from "./post-card-types";
import { resolvePostContent } from "./post-card-utils";
import { Ionicons } from "@expo/vector-icons";

export type { Post, PostAuthor, PostMedia } from "./post-card-types";

type PostCardProps = {
  post: Post;
  isOwnPost?: boolean;
  isVisible?: boolean;
  /** Whether this is the focused video post (for sound) */
  isFocused?: boolean;
  isNearVisible?: boolean;
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
  onTopicPress?: () => void;
  onFollowUser?: () => void;
  onFollowTopic?: () => void;
  onMorePress?: () => void;
  onLikePress?: () => void;
  onDislikePress?: () => void;
  onCommentPress?: () => void;
  onSharePress?: () => void;
  onBlockUser?: () => void;
  onBlockPost?: () => void;
  onBlockTopic?: () => void;
  onReport?: () => void;
  onRevealContent?: () => void;
  onMediaPress?: () => void;
  onOptimisticRetryPress?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  contentRevealed?: boolean;
  shareUrl?: string;
  /** Whether to show the URL card/Play Now row (default: true) */
  showUrlCard?: boolean;
  hideCommentAction?: boolean;
  topicDisabled?: boolean;
  directFollowUser?: boolean;
  showMoreButton?: boolean;
  isPostDetail?: boolean;
  videoSyncScope?: string;
  style?: StyleProp<ViewStyle>;
};

function arePostCardPropsEqual(
  prevProps: PostCardProps,
  nextProps: PostCardProps,
): boolean {
  const prevPost = prevProps.post;
  const nextPost = nextProps.post;

  if (prevPost.id !== nextPost.id) return false;
  if (prevPost.title !== nextPost.title) return false;
  if (prevPost.body !== nextPost.body) return false;
  if (prevPost.likes !== nextPost.likes) return false;
  if (prevPost.dislikes !== nextPost.dislikes) return false;
  if (prevPost.comments !== nextPost.comments) return false;
  if (prevPost.hasLiked !== nextPost.hasLiked) return false;
  if (prevPost.hasDisliked !== nextPost.hasDisliked) return false;
  if (prevPost.awards?.length !== nextPost.awards?.length) return false;
  if (prevPost.isFollowing !== nextPost.isFollowing) return false;
  if (prevPost.optimisticStatus !== nextPost.optimisticStatus) return false;
  if (prevPost.optimisticError !== nextPost.optimisticError) return false;
  if (prevPost.optimisticActionId !== nextPost.optimisticActionId) return false;
  if (prevPost.optimisticVideoPreviewUntil !== nextPost.optimisticVideoPreviewUntil) return false;

  if (prevProps.isOwnPost !== nextProps.isOwnPost) return false;
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  if (prevProps.isFocused !== nextProps.isFocused) return false;
  if (prevProps.isNearVisible !== nextProps.isNearVisible) return false;
  if (prevProps.showFollowButton !== nextProps.showFollowButton) return false;
  if (prevProps.isTopicFollowed !== nextProps.isTopicFollowed) return false;
  if (prevProps.allowAutoplay !== nextProps.allowAutoplay) return false;
  if (prevProps.screenActive !== nextProps.screenActive) return false;
  if (prevProps.contentRevealed !== nextProps.contentRevealed) return false;
  if (prevProps.shareUrl !== nextProps.shareUrl) return false;
  if (prevProps.showUrlCard !== nextProps.showUrlCard) return false;
  if (prevProps.topicDisabled !== nextProps.topicDisabled) return false;
  if (prevProps.directFollowUser !== nextProps.directFollowUser) return false;
  if (prevProps.showMoreButton !== nextProps.showMoreButton) return false;
  if (prevProps.isPostDetail !== nextProps.isPostDetail) return false;
  if (prevProps.videoSyncScope !== nextProps.videoSyncScope) return false;
  if (prevProps.onOptimisticRetryPress !== nextProps.onOptimisticRetryPress) return false;

  return true;
}

export const PostCard = memo(function PostCard({
  post,
  isOwnPost = false,
  isVisible = false,
  isFocused,
  isNearVisible,
  showFollowButton = true,
  isTopicFollowed = false,
  allowAutoplay = true,
  screenActive = true,
  onPress,
  onAuthorPress,
  onTopicPress,
  onFollowUser,
  onFollowTopic,
  onMorePress,
  onLikePress,
  onDislikePress,
  onCommentPress,
  onSharePress,
  onBlockUser,
  onBlockPost,
  onBlockTopic,
  onReport,
  onRevealContent,
  onMediaPress: onMediaPressProp,
  onOptimisticRetryPress,
  onLayout,
  contentRevealed = false,
  shareUrl,
  showUrlCard = true,
  hideCommentAction = false,
  topicDisabled = false,
  directFollowUser = false,
  showMoreButton = false,
  isPostDetail = false,
  videoSyncScope,
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

  const blurSensitiveMedia = usePreferencesStore((s) => s.blurSensitiveMedia);
  const shouldBlurContent = blurSensitiveMedia && !!contentWarnings?.length && !contentRevealed;

  const resolvedContent = useMemo(
    () => resolvePostContent(body, media),
    [body, media],
  );

  const containerRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    triggerHaptic("selection");
    logPress({ name: "post_card", postId: post.id });
    if (containerRef.current) {
      containerRef.current.measureInWindow((_x, y) => {
        setLastPressedPostY(y);
        onPress?.();
      });
    } else {
      onPress?.();
    }
  }, [onPress, post.id]);

  const handlePlayNowPress = useCallback(() => {
    if (!resolvedContent.extractedUrl) return;
    triggerHaptic("selection");
    Linking.openURL(resolvedContent.extractedUrl);
  }, [resolvedContent.extractedUrl]);

  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);

  const handleMediaPress = useCallback(() => {
    if (onMediaPressProp) {
      onMediaPressProp();
    } else {
      setSelectedMediaIndex(0);
      setShowMediaPreview(true);
    }
  }, [onMediaPressProp]);

  const { theme } = useUnistyles();
  const currentPowActionId = usePowQueueStore((state) => state.currentAction?.id);
  const isOptimisticPostQueued = usePowQueueStore((state) =>
    post.optimisticActionId
      ? state.queue.some((action) => action.id === post.optimisticActionId)
      : false,
  );
  const { isConnected } = useNetworkState();
  const isOptimisticPostOffline = post.optimisticStatus === "pending" && !isConnected;
  const optimisticStatusColor = post.optimisticStatus === "error" || isOptimisticPostOffline
    ? theme.colors.error[500]
    : post.optimisticStatus === "success"
    ? theme.colors.success[500]
    : theme.colors.warning[500];
  const isOptimisticPostWaitingForQueue =
    post.optimisticStatus === "pending" &&
    !!post.optimisticActionId &&
    isOptimisticPostQueued &&
    currentPowActionId !== post.optimisticActionId;
  const isOptimisticEdit = !!post.optimisticStatus && !post.optimisticDraft;
  const disablePostInteractions = !!post.optimisticStatus && post.optimisticStatus !== "success";
  const keepOptimisticMediaMounted =
    post.optimisticStatus === "success" ||
    (!!post.optimisticVideoPreviewUntil && post.optimisticVideoPreviewUntil > Date.now());
  const shouldPrimeOptimisticVideo =
    !isPostDetail &&
    !!post.optimisticVideoPreviewUntil &&
    post.optimisticVideoPreviewUntil > Date.now();
  const isFeedScrolling = useIsFeedScrolling(!isPostDetail ? videoSyncScope : undefined);
  const [optimisticVideoPrimeDismissed, setOptimisticVideoPrimeDismissed] = useState(false);
  const primeOptimisticVideo = shouldPrimeOptimisticVideo && !optimisticVideoPrimeDismissed;
  const optimisticCardStyle = post.optimisticStatus
    ? {
        marginTop: -1,
        backgroundColor: optimisticStatusColor + "08",
        borderTopColor: optimisticStatusColor + "40",
        borderBottomColor: optimisticStatusColor + "40",
        borderTopWidth: 2,
        borderBottomWidth: 2,
      }
    : null;
  const optimisticErrorText = post.optimisticError
    ? post.optimisticError.startsWith("Post failed")
      ? post.optimisticError
      : `Post failed. ${post.optimisticError}`
    : "Post failed.";
  const MAX_BODY_LENGTH = 700;
  const bodyText = resolvedContent.bodyWithoutUrl ?? "";
  const isTruncated = bodyText.length > MAX_BODY_LENGTH;
  const truncatedBody = isTruncated
    ? bodyText.slice(0, MAX_BODY_LENGTH)
    : bodyText;
  const previousOptimisticStatusRef = useRef<typeof post.optimisticStatus>(undefined);

  useEffect(() => {
    if (!shouldPrimeOptimisticVideo) {
      setOptimisticVideoPrimeDismissed(false);
      return;
    }

    if (isFeedScrolling) {
      setOptimisticVideoPrimeDismissed(true);
    }
  }, [isFeedScrolling, post.id, shouldPrimeOptimisticVideo]);

  useEffect(() => {
    const previousStatus = previousOptimisticStatusRef.current;
    const nextStatus = post.optimisticStatus;

    if (previousStatus !== nextStatus) {
      if (nextStatus === "success") {
        triggerHaptic("success");
      } else if (nextStatus === "error") {
        triggerHaptic("error");
      }
    }

    previousOptimisticStatusRef.current = nextStatus;
  }, [post.optimisticStatus]);

  const handleCloseMediaPreview = useCallback(() => {
    setShowMediaPreview(false);
  }, []);

  const handleGalleryMediaPress = useCallback((index: number) => {
    if (!isPostDetail && onMediaPressProp) {
      onMediaPressProp();
    } else {
      setSelectedMediaIndex(index);
      setShowMediaPreview(true);
    }
  }, [isPostDetail, onMediaPressProp]);

  return (
    <Pressable
      ref={containerRef}
      onLayout={onLayout}
      onPress={handlePress}
      disabled={disablePostInteractions}
      style={[styles.container, optimisticCardStyle, style]}
    >
      <PostCardHeader
        author={author}
        topic={topic}
        createdAt={createdAt}
        isOwnPost={isOwnPost}
        isFollowing={isFollowing}
        isTopicFollowed={isTopicFollowed}
        showFollowButton={showFollowButton}
        onAuthorPress={disablePostInteractions ? undefined : onAuthorPress}
        onTopicPress={disablePostInteractions || topicDisabled ? undefined : onTopicPress}
        topicDisabled={topicDisabled}
        onFollowUser={disablePostInteractions ? undefined : onFollowUser}
        onFollowTopic={disablePostInteractions ? undefined : onFollowTopic}
        onMorePress={disablePostInteractions ? undefined : onMorePress}
        directFollowUser={directFollowUser}
        showMoreButton={!isPostDetail && (showMoreButton || isOwnPost)}
        disabled={disablePostInteractions}
        isPostDetail={isPostDetail}
      />

      {post.awards && post.awards.length > 0 && (
        <View style={styles.awardBadgesRow}>
          <AwardBadges awards={post.awards} size="sm" />
        </View>
      )}

      {post.optimisticStatus && (
        <View
          style={[
            styles.optimisticBadge,
            post.optimisticStatus === "error" || isOptimisticPostOffline
              ? styles.optimisticBadgeError
              : post.optimisticStatus === "success"
              ? styles.optimisticBadgeSuccess
              : styles.optimisticBadgePending,
          ]}
        >
          <Ionicons
            name={
              post.optimisticStatus === "error"
                ? "alert-circle"
                : post.optimisticStatus === "success"
                ? "checkmark-circle"
                : isOptimisticPostOffline
                ? "cloud-offline-outline"
                : "time-outline"
            }
            size={14}
            color={optimisticStatusColor}
          />
          <Text
            size="xs"
            weight="semibold"
            style={{ color: optimisticStatusColor }}
          >
            {post.optimisticStatus === "error"
              ? optimisticErrorText
              : post.optimisticStatus === "success"
              ? isOptimisticEdit
                ? "Successfully edited."
                : "Successfully posted."
              : isOptimisticPostOffline
              ? "Waiting for internet connection before publishing your post."
              : isOptimisticPostWaitingForQueue
              ? "Waiting for other actions to finish before publishing your post."
              : "Finalizing your post on the network. This can take a few moments."}
          </Text>
        </View>
      )}
      {post.optimisticStatus === "error" && onOptimisticRetryPress && (
        <Pressable
          onPress={onOptimisticRetryPress}
          hitSlop={8}
          style={styles.optimisticRetryButton}
        >
          <Text size="xs" weight="bold" style={styles.optimisticRetryText}>
            Try posting again
          </Text>
        </Pressable>
      )}

      <PostCardContent
        title={title}
        extractedUrl={resolvedContent.extractedUrl}
        displayDomain={resolvedContent.displayDomain}
        bodyVideoUrl={resolvedContent.bodyVideoUrl}
        shouldBlurContent={shouldBlurContent}
        contentWarnings={contentWarnings}
        showUrlCard={showUrlCard}
        disabled={disablePostInteractions}
        onRevealContent={disablePostInteractions ? undefined : onRevealContent}
        onPlayNowPress={disablePostInteractions ? undefined : handlePlayNowPress}
      />

      <PostCardMedia
        key={`${post.id}:${videoSyncScope ?? "default"}:${resolvedContent.resolvedMedia?.uri ?? "none"}`}
        media={resolvedContent.resolvedMedia}
        mediaList={resolvedContent.resolvedMediaList}
        isVisible={primeOptimisticVideo || isVisible}
        isFocused={primeOptimisticVideo || (isFocused ?? isVisible)}
        isNearVisible={keepOptimisticMediaMounted || (isNearVisible ?? isVisible)}
        shouldBlurContent={shouldBlurContent}
        hasMultipleMedia={resolvedContent.hasMultipleMedia}
        extraMediaCount={resolvedContent.extraMediaCount}
        allowAutoplay={allowAutoplay}
        screenActive={screenActive && !showMediaPreview}
        disabled={disablePostInteractions}
        onRevealContent={disablePostInteractions ? undefined : onRevealContent}
        onMediaPress={disablePostInteractions ? undefined : handleMediaPress}
        isPostDetail={isPostDetail}
        videoSyncScope={videoSyncScope}
        postId={post.id}
        onGalleryMediaPress={disablePostInteractions ? undefined : handleGalleryMediaPress}
      />

      {bodyText && !shouldBlurContent && (
        <View style={styles.body}>
          <MarkdownContent
            content={
              isPostDetail
                ? bodyText
                : !isPostDetail && isTruncated
                ? truncatedBody + "…"
                : bodyText
            }
          />
        </View>
      )}

      {post.agentEdited && (
        <View style={styles.agentBadge}>
          <Ionicons name="shield-checkmark" size={14} color="#EF4444" />
          <Text size="xs" mode="subtle"> Agent modified</Text>
        </View>
      )}

      {post.appendices && post.appendices.length > 0 &&
        post.appendices.map((appendix, idx) => (
          <View key={idx} style={[styles.appendicesContainer, { backgroundColor: theme.colors.background.subtle }]}>
            <View style={[styles.appendix, { borderLeftColor: theme.colors.border.default }]}>
              <Text size="xs" weight="semibold" style={{ color: "#EF4444" }}>
                @{appendix.agentUsername || appendix.agent.slice(0, 12) + "…"}
              </Text>
              <MarkdownContent content={appendix.text} />
            </View>
          </View>
        ))
      }

      <PostActions
        likes={likes}
        dislikes={dislikes}
        comments={comments}
        hasLiked={hasLiked}
        hasDisliked={hasDisliked}
        onLikePress={disablePostInteractions ? undefined : onLikePress}
        onDislikePress={disablePostInteractions ? undefined : onDislikePress}
        onCommentPress={disablePostInteractions ? undefined : onCommentPress}
        onSharePress={disablePostInteractions ? undefined : onSharePress}
        shareUrl={shareUrl}
        shareTitle={title}
        isOwnPost={isOwnPost}
        authorUsername={author.username}
        onBlockUser={disablePostInteractions ? undefined : onBlockUser}
        onBlockPost={disablePostInteractions ? undefined : onBlockPost}
        onBlockTopic={disablePostInteractions ? undefined : onBlockTopic}
        topic={post.topic}
        onReport={disablePostInteractions ? undefined : onReport}
        hideCommentAction={hideCommentAction}
        style={styles.actions}
        disabled={disablePostInteractions}
      />

      <MediaPreviewModal
        visible={showMediaPreview}
        media={resolvedContent.resolvedMedia ?? null}
        mediaList={resolvedContent.resolvedMediaList}
        initialIndex={selectedMediaIndex}
        videoSyncScope={videoSyncScope}
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
  awardBadgesRow: {
    marginVertical: theme.spacing.xs,
    paddingLeft: 2,
  },
  optimisticBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
  },
  optimisticBadgePending: {
    backgroundColor: theme.colors.warning[500] + "15",
    borderColor: theme.colors.warning[500] + "40",
  },
  optimisticBadgeSuccess: {
    backgroundColor: theme.colors.success[500] + "15",
    borderColor: theme.colors.success[500] + "40",
  },
  optimisticBadgeError: {
    backgroundColor: theme.colors.error[500] + "15",
    borderColor: theme.colors.error[500] + "40",
  },
  optimisticRetryButton: {
    alignSelf: "flex-start",
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.error[500],
  },
  optimisticRetryText: {
    color: "#FFFFFF",
  },
  agentBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.xs,
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
  },
  appendicesContainer: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.md,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  appendix: {
    borderLeftWidth: 3,
    paddingLeft: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
}));
