import { triggerHaptic } from "@/src/components/utils/haptics";
import { Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { logPress } from "@/src/utils/press-logger";
import { setLastPressedPostY } from "@/src/utils/post-transition";
import { usePreferencesStore } from "@/src/stores";
import {
  useIsPowActionCurrent,
  useIsPowActionQueued,
} from "@/src/services/pow-queue";
import { useIsConnected } from "@/src/hooks/use-network-state";
import { isPostVideoProcessing } from "@/src/domain/posts/video-processing";
import { markOptimisticVideoProcessingComplete } from "@/src/api/cache/complete-video-processing";
import { useQueryClient } from "@tanstack/react-query";
import { usePendingPostsStore } from "@/src/stores/pending-posts-store";
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
import { ContentWarningBadge } from "@/src/components/atoms/content-warning-badge";
import { PostActions } from "./post-actions";
import { PostCardContent } from "./post-card-content";
import { PostCardHeader } from "./post-card-header";
import { PostCardMedia } from "./post-card-media";
import type { Post } from "./post-card-types";
import { shouldTriggerPostCardPressHaptic } from "./post-card-press";
import {
  isSuccessfulOptimisticPost,
  resolvePostContent,
  resolveOptimisticVideoPreviewMedia,
  shouldBlurMatureMedia,
} from "./post-card-utils";
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
  onHidePost?: () => void;
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
  allowOptimisticMediaPreview?: boolean;
  optimisticQueueState?: {
    isCurrent: boolean;
    isQueued: boolean;
  };
  videoSyncScope?: string;
  style?: StyleProp<ViewStyle>;
};

type PostCardViewProps = PostCardProps & {
  isConnected: boolean;
  isOptimisticActionCurrent: boolean;
  isOptimisticActionQueued: boolean;
};

const PostCardView = memo(function PostCardView({
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
  onHidePost,
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
  allowOptimisticMediaPreview = false,
  isConnected,
  isOptimisticActionCurrent = false,
  isOptimisticActionQueued = false,
  videoSyncScope,
  style,
}: PostCardViewProps) {
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
  const shouldBlurContent = shouldBlurMatureMedia(
    blurSensitiveMedia,
    contentWarnings,
    contentRevealed,
  );

  const resolvedContent = useMemo(
    () => resolvePostContent(body, media),
    [body, media],
  );

  const containerRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    // No haptic when the card has no press action (e.g. post detail):
    // vibrating on inert body text reads as a broken tap (BUG-020).
    if (!shouldTriggerPostCardPressHaptic(onPress)) return;
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
  const queryClient = useQueryClient();
  const normalizedPostId = post.id.toLowerCase();
  const pendingPost = usePendingPostsStore(
    (state) => state.postsById[normalizedPostId],
  );
  const isOptimisticPostSuccess = isSuccessfulOptimisticPost(post);
  const isOptimisticPostOffline = post.optimisticStatus === "pending" && !isConnected;
  const optimisticStatusColor = post.optimisticStatus === "error" || isOptimisticPostOffline
    ? theme.colors.error[500]
    : isOptimisticPostSuccess
    ? theme.colors.success[500]
    : theme.colors.warning[500];
  const isOptimisticPostWaitingForQueue =
    post.optimisticStatus === "pending" &&
    !!post.optimisticActionId &&
    isOptimisticActionQueued &&
    !isOptimisticActionCurrent;
  const isOptimisticVideoProcessing =
    isPostVideoProcessing(pendingPost) || isPostVideoProcessing(post);
  const isOptimisticVideoPost =
    pendingPost?.optimistic_draft?.attachmentType === "video" ||
    post.optimisticDraft?.attachmentType === "video" ||
    isOptimisticVideoProcessing;
  const showOptimisticVideoProcessing =
    isOptimisticVideoProcessing && !allowOptimisticMediaPreview;
  const localOptimisticVideoPreviewUri = isOptimisticVideoProcessing
    ? pendingPost?.optimistic_draft?.mediaUris?.[0] ??
      post.optimisticDraft?.mediaUris?.[0]
    : undefined;
  const canonicalProcessingMediaUri = isOptimisticVideoProcessing
    ? resolvedContent.resolvedMedia?.uri
    : undefined;
  const optimisticResolvedMedia = resolveOptimisticVideoPreviewMedia(
    isOptimisticVideoPost && resolvedContent.resolvedMedia
      ? { ...resolvedContent.resolvedMedia, type: "video" as const }
      : resolvedContent.resolvedMedia,
    localOptimisticVideoPreviewUri,
    isOptimisticVideoProcessing,
  );
  const optimisticResolvedMediaList =
    isOptimisticVideoPost && resolvedContent.resolvedMediaList
      ? resolvedContent.resolvedMediaList.map((item) => ({ ...item, type: "video" as const }))
      : resolvedContent.resolvedMediaList;
  const isOptimisticPostFinalizingNetwork =
    post.optimisticStatus === "pending" && post.id.startsWith("optimistic-post-") && !isOptimisticVideoProcessing;
  const isOptimisticEdit = !!post.optimisticStatus && !post.optimisticDraft && !isOptimisticVideoPost;
  const disablePostInteractions = !!post.optimisticStatus && !isOptimisticPostSuccess;
  // Allow video playback interactions for optimistic video posts (pending/error)
  // so users can tap-to-play the local video preview while it's being posted.
  const disableMediaInteractions =
    showOptimisticVideoProcessing || (disablePostInteractions && !isOptimisticVideoPost);
  const keepOptimisticMediaMounted =
    isOptimisticPostSuccess ||
    isOptimisticVideoProcessing;
  const shouldPrimeOptimisticVideo =
    allowOptimisticMediaPreview &&
    !isPostDetail &&
    isOptimisticVideoProcessing;
  const handleVideoProcessingComplete = useCallback(() => {
    markOptimisticVideoProcessingComplete(queryClient, post.id);
  }, [post.id, queryClient]);
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
  const mediaComponentKey = `${post.optimisticActionId ?? post.id}:${videoSyncScope ?? "default"}:${resolvedContent.resolvedMedia?.type ?? "none"}`;


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

      {(contentWarnings?.length || post.awards?.length || post.agentEdited) && (
        <View style={styles.badgesRow}>
          {contentWarnings && contentWarnings.length > 0 && (
            <ContentWarningBadge types={contentWarnings} compact />
          )}
          {post.agentEdited && (
            <View style={styles.agentBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#EF4444" />
              <Text size="xs" weight="medium" style={styles.agentBadgeText}>
                Agent modified
              </Text>
            </View>
          )}
          {post.awards && post.awards.length > 0 && (
            <View style={styles.awardsPill}>
              <AwardBadges awards={post.awards} size="sm" />
            </View>
          )}
        </View>
      )}

      {post.optimisticStatus && (
        <View
          style={[
            styles.optimisticBadge,
            post.optimisticStatus === "error" || isOptimisticPostOffline
              ? styles.optimisticBadgeError
              : isOptimisticPostSuccess
              ? styles.optimisticBadgeSuccess
              : styles.optimisticBadgePending,
          ]}
        >
          <Ionicons
            name={
              post.optimisticStatus === "error"
                ? "alert-circle"
                : isOptimisticPostSuccess
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
              : isOptimisticPostSuccess
              ? isOptimisticEdit
                ? "Successfully edited."
                : "Successfully posted."
              : isOptimisticPostOffline
              ? "Waiting for internet connection before publishing your post."
              : isOptimisticPostWaitingForQueue
              ? "Waiting for other actions to finish before publishing your post."
              : isOptimisticVideoProcessing
              ? "Finalizing your post on the network. This can take a few moments."
              : isOptimisticPostFinalizingNetwork
              ? "Finalizing your post on the network. This can take a few moments."
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
        showUrlCard={showUrlCard}
        disabled={disablePostInteractions}
        onRevealContent={disablePostInteractions ? undefined : onRevealContent}
        onPlayNowPress={disablePostInteractions ? undefined : handlePlayNowPress}
      />

      {optimisticResolvedMedia && (
        <PostCardMedia
          key={mediaComponentKey}
          media={optimisticResolvedMedia}
          mediaList={optimisticResolvedMediaList}
          isVisible={isVisible}
          isFocused={isFocused ?? isVisible}
          isNearVisible={keepOptimisticMediaMounted || (isNearVisible ?? isVisible)}
          isConnected={isConnected}
          shouldPrimeOptimisticVideo={shouldPrimeOptimisticVideo}
          shouldBlurContent={shouldBlurContent}
          hasMultipleMedia={resolvedContent.hasMultipleMedia}
          extraMediaCount={resolvedContent.extraMediaCount}
          allowAutoplay={allowAutoplay}
          screenActive={screenActive && !showMediaPreview}
          disabled={disableMediaInteractions}
          onRevealContent={disableMediaInteractions ? undefined : onRevealContent}
          onMediaPress={disablePostInteractions ? undefined : handleMediaPress}
          isPostDetail={isPostDetail}
          videoSyncScope={videoSyncScope}
          postId={post.id}
          forceVideoProcessing={isOptimisticVideoProcessing}
          processingMediaUri={canonicalProcessingMediaUri}
          onVideoProcessingComplete={
            isOptimisticVideoProcessing
              ? handleVideoProcessingComplete
              : undefined
          }
          onGalleryMediaPress={disablePostInteractions ? undefined : handleGalleryMediaPress}
        />
      )}

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
        postId={post.id}
        onHidePost={disablePostInteractions ? undefined : onHidePost}
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
});

const PostCardWithNetworkState = memo(function PostCardWithNetworkState(
  props: Omit<PostCardViewProps, "isConnected">,
) {
  const isConnected = useIsConnected();
  return <PostCardView {...props} isConnected={isConnected} />;
});

function PostCardResolved(props: Omit<PostCardViewProps, "isConnected">) {
  const needsConnectivity =
    !!props.post.optimisticStatus ||
    !!props.post.media?.length ||
    !!props.post.body?.includes("http");

  return needsConnectivity
    ? <PostCardWithNetworkState {...props} />
    : <PostCardView {...props} isConnected />;
}

const PostCardWithQueueState = memo(function PostCardWithQueueState(
  props: PostCardProps,
) {
  const isOptimisticActionCurrent = useIsPowActionCurrent(
    props.post.optimisticActionId,
  );
  const isOptimisticActionQueued = useIsPowActionQueued(
    props.post.optimisticActionId,
  );

  return (
    <PostCardResolved
      {...props}
      isOptimisticActionCurrent={isOptimisticActionCurrent}
      isOptimisticActionQueued={isOptimisticActionQueued}
    />
  );
});

export const PostCard = memo(function PostCard(props: PostCardProps) {
  if (!props.optimisticQueueState && props.post.optimisticActionId) {
    return <PostCardWithQueueState {...props} />;
  }

  return (
    <PostCardResolved
      {...props}
      isOptimisticActionCurrent={props.optimisticQueueState?.isCurrent ?? false}
      isOptimisticActionQueued={props.optimisticQueueState?.isQueued ?? false}
    />
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
  body: {
    marginTop: theme.spacing.sm,
    lineHeight: 18,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.xs,
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
    gap: 4,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.primary[500] + "1A",
  },
  agentBadgeText: {
    color: theme.colors.primary[500],
  },
  awardsPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.primary[500] + "1A",
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
