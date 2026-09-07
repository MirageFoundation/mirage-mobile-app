import { forwardRef, memo, useCallback, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import { getRedgifsId, type ResolvedMedia } from "./post-card-utils";
import { MediaGallery } from "./media-gallery";
import { MediaOfflineOverlay } from "./post-card-media-overlays";
import { postMediaStyles as styles } from "./post-card-media-styles";
import {
  useMediaLoadedState,
  useMediaPressTransition,
} from "./post-card-media-shared";
import { PostCardImage } from "./post-card-image";
import { PostCardRedgifs } from "./post-card-redgifs";
import { PostCardVideo, type PostCardVideoRef } from "./post-card-video";
import { PostCardYouTube, type PostCardYouTubeRef } from "./post-card-youtube";

export type PostCardMediaRef = {
  pauseVideo: () => void;
};

type PostCardMediaProps = {
  media?: ResolvedMedia;
  mediaList?: ResolvedMedia[];
  isVisible: boolean;
  isFocused?: boolean;
  isNearVisible?: boolean;
  isConnected: boolean;
  shouldPrimeOptimisticVideo?: boolean;
  shouldBlurContent: boolean;
  hasMultipleMedia: boolean;
  extraMediaCount: number;
  allowAutoplay?: boolean;
  screenActive?: boolean;
  disabled?: boolean;
  onRevealContent?: () => void;
  onMediaPress?: () => void;
  onGalleryMediaPress?: (index: number) => void;
  isPostDetail?: boolean;
  videoSyncScope?: string;
  postId?: string;
  forceVideoProcessing?: boolean;
  processingMediaUri?: string;
  onVideoProcessingComplete?: () => void;
};

/**
 * Media coordinator for a post card: picks the media surface (gallery,
 * native video, YouTube, image) and delegates everything else to it. Each
 * surface owns its own players, hooks, chrome, and failure handling — see
 * `post-card-video.tsx`, `post-card-youtube.tsx`, `post-card-image.tsx`,
 * and `media-gallery.tsx`.
 */
export const PostCardMedia = memo(
  forwardRef<PostCardMediaRef, PostCardMediaProps>(function PostCardMedia(
    {
      media,
      mediaList,
      isVisible,
      isFocused = true,
      isNearVisible,
      isConnected,
      shouldPrimeOptimisticVideo = false,
      shouldBlurContent,
      hasMultipleMedia,
      extraMediaCount,
      allowAutoplay = true,
      screenActive = true,
      disabled = false,
      onRevealContent,
      onMediaPress,
      onGalleryMediaPress,
      isPostDetail = false,
      videoSyncScope,
      postId,
      forceVideoProcessing = false,
      processingMediaUri,
      onVideoProcessingComplete,
    },
    ref,
  ) {
    const videoRef = useRef<PostCardVideoRef | null>(null);
    const youtubeRef = useRef<PostCardYouTubeRef | null>(null);

    useImperativeHandle(ref, () => ({
      pauseVideo: () => {
        videoRef.current?.pauseVideo();
        youtubeRef.current?.pauseVideo();
      },
    }));

    const isGalleryPost = !!(mediaList && mediaList.length > 1);
    const { mediaLoaded } = useMediaLoadedState(
      isGalleryPost ? media?.uri : undefined,
    );
    const { mediaFrameRef, runWithMediaTransition } = useMediaPressTransition({
      isPostDetail,
      postId,
    });

    const handleGalleryMediaPressWithTransition = useCallback(
      (index: number) => {
        runWithMediaTransition(mediaList?.[index], () => onGalleryMediaPress?.(index));
      },
      [runWithMediaTransition, mediaList, onGalleryMediaPress],
    );

    if (!media) return null;

    if (isGalleryPost && mediaList) {
      return (
        <View style={styles.mediaContainer}>
          <View ref={mediaFrameRef} style={styles.mediaWrapper}>
            <MediaGallery
              media={mediaList}
              postId={postId}
              onMediaPress={handleGalleryMediaPressWithTransition}
              screenActive={screenActive}
              allowAutoplay={allowAutoplay}
              isVisible={isVisible}
              isFocused={isFocused}
              isPostDetail={isPostDetail}
              shouldBlurContent={shouldBlurContent}
              onRevealContent={onRevealContent}
            />
            <MediaOfflineOverlay visible={!isConnected && !shouldBlurContent && !mediaLoaded} />
            <View style={styles.borderOverlay} pointerEvents="none" />
          </View>
        </View>
      );
    }

    if (media.type === "gif" && getRedgifsId(media.uri)) {
      return (
        <PostCardRedgifs
          ref={videoRef}
          media={media}
          isVisible={isVisible}
          isFocused={isFocused}
          isNearVisible={isNearVisible}
          isConnected={isConnected}
          shouldBlurContent={shouldBlurContent}
          allowAutoplay={allowAutoplay}
          screenActive={screenActive}
          disabled={disabled}
          onRevealContent={onRevealContent}
          onMediaPress={onMediaPress}
          isPostDetail={isPostDetail}
          videoSyncScope={videoSyncScope}
          postId={postId}
        />
      );
    }

    if (media.type === "youtube") {
      return (
        <PostCardYouTube
          ref={youtubeRef}
          media={media}
          isVisible={isVisible}
          isFocused={isFocused}
          isConnected={isConnected}
          shouldBlurContent={shouldBlurContent}
          hasMultipleMedia={hasMultipleMedia}
          extraMediaCount={extraMediaCount}
          allowAutoplay={allowAutoplay}
          screenActive={screenActive}
          disabled={disabled}
          onRevealContent={onRevealContent}
          onMediaPress={onMediaPress}
          isPostDetail={isPostDetail}
          videoSyncScope={videoSyncScope}
          postId={postId}
        />
      );
    }

    if (media.type === "video") {
      return (
        <PostCardVideo
          ref={videoRef}
          media={media}
          isVisible={isVisible}
          isFocused={isFocused}
          isNearVisible={isNearVisible}
          isConnected={isConnected}
          shouldPrimeOptimisticVideo={shouldPrimeOptimisticVideo}
          shouldBlurContent={shouldBlurContent}
          hasMultipleMedia={hasMultipleMedia}
          extraMediaCount={extraMediaCount}
          allowAutoplay={allowAutoplay}
          screenActive={screenActive}
          disabled={disabled}
          onRevealContent={onRevealContent}
          onMediaPress={onMediaPress}
          isPostDetail={isPostDetail}
          videoSyncScope={videoSyncScope}
          postId={postId}
          forceVideoProcessing={forceVideoProcessing}
          processingMediaUri={processingMediaUri}
          onVideoProcessingComplete={onVideoProcessingComplete}
        />
      );
    }

    return (
      <PostCardImage
        media={media}
        isConnected={isConnected}
        shouldBlurContent={shouldBlurContent}
        hasMultipleMedia={hasMultipleMedia}
        extraMediaCount={extraMediaCount}
        disabled={disabled}
        onRevealContent={onRevealContent}
        onMediaPress={onMediaPress}
        isPostDetail={isPostDetail}
        postId={postId}
        isVisible={isVisible}
      />
    );
  }),
);
