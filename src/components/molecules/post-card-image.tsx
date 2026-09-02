import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  type GestureResponderEvent,
} from "react-native";
import type { ResolvedMedia } from "./post-card-utils";
import {
  MEDIA_HORIZONTAL_PADDING,
  MEDIA_LOADED_CACHE,
  MEDIA_MAX_HEIGHT,
  SCREEN_WIDTH,
} from "./post-card-media-constants";
import {
  MediaBlurRevealOverlay,
  MediaOfflineOverlay,
  MediaTypeBadge,
} from "./post-card-media-overlays";
import { postMediaStyles as styles } from "./post-card-media-styles";
import {
  useMediaAspectRatio,
  useMediaLoadedState,
  useMediaPressTransition,
} from "./post-card-media-shared";
import { getMediaImagePolicy, getMediaImageSource } from "./media-image-policy";

type PostCardImageProps = {
  media: ResolvedMedia;
  isConnected: boolean;
  shouldBlurContent: boolean;
  hasMultipleMedia: boolean;
  extraMediaCount: number;
  disabled?: boolean;
  onRevealContent?: () => void;
  onMediaPress?: () => void;
  isPostDetail?: boolean;
  postId?: string;
  isVisible?: boolean;
};

/**
 * Image/GIF surface for a post card: sized frame, cached-load skeleton,
 * press transition, and permanent-error hiding with offline recovery.
 */
export const PostCardImage = memo(function PostCardImage({
  media,
  isConnected,
  shouldBlurContent,
  hasMultipleMedia,
  extraMediaCount,
  disabled = false,
  onRevealContent,
  onMediaPress,
  isPostDetail = false,
  postId,
  isVisible = true,
}: PostCardImageProps) {
  const resolvedMediaUri = media.uri;
  const [imageError, setImageError] = useState(false);
  const wasOfflineRef = useRef(false);

  const { mediaLoaded, setMediaLoaded, clearLoadingFallback } =
    useMediaLoadedState(resolvedMediaUri);
  const { effectiveAspectRatio, updateMediaAspectRatioFromSize } =
    useMediaAspectRatio(media, { preserveFallback: !isPostDetail });
  const { mediaFrameRef, runWithMediaTransition } = useMediaPressTransition({
    isPostDetail,
    postId,
  });

  // Coming back online after an offline failure clears the error state so
  // the image can retry rendering.
  useEffect(() => {
    if (!isConnected) {
      wasOfflineRef.current = true;
      clearLoadingFallback();
    } else if (wasOfflineRef.current && imageError) {
      wasOfflineRef.current = false;
      setTimeout(() => {
        setImageError(false);
      }, 500);
    } else {
      wasOfflineRef.current = false;
    }
  }, [imageError, isConnected, clearLoadingFallback]);

  const handleMediaPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation?.();
      if (disabled) return;
      if (shouldBlurContent) {
        onRevealContent?.();
        return;
      }
      triggerHaptic("selection");
      runWithMediaTransition(media, () => {
        onMediaPress?.();
      });
    },
    [disabled, shouldBlurContent, onRevealContent, runWithMediaTransition, media, onMediaPress],
  );

  if (imageError) return null;

  const containerWidth = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
  const calculatedHeight = containerWidth / effectiveAspectRatio;
  const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;
  const mediaWrapperStyle = exceedsMaxHeight
    ? { height: MEDIA_MAX_HEIGHT }
    : { aspectRatio: effectiveAspectRatio };

  const imagePolicy = getMediaImagePolicy({
    uri: resolvedMediaUri ?? "",
    surface: isPostDetail ? "detail" : "feed",
    mediaType: media.type === "gif" ? "gif" : "image",
    displayWidth: containerWidth,
    intrinsicWidth: media.width,
    intrinsicHeight: media.height,
    visible: isVisible,
  });

  return (
    <View style={styles.mediaContainer}>
      <View ref={mediaFrameRef} style={[styles.mediaWrapper, mediaWrapperStyle]}>
        <Pressable onPress={handleMediaPress} style={styles.media}>
          <Image
            source={getMediaImageSource(imagePolicy)}
            style={styles.media}
            contentFit={imagePolicy.contentFit}
            cachePolicy={imagePolicy.cachePolicy}
            recyclingKey={imagePolicy.recyclingKey}
            allowDownscaling={imagePolicy.allowDownscaling}
            enforceEarlyResizing={imagePolicy.enforceEarlyResizing}
            priority={imagePolicy.priority}
            onLoad={({ source }) => {
              updateMediaAspectRatioFromSize(source?.width, source?.height);
              setMediaLoaded(true);
            }}
            onError={() => setImageError(true)}
            blurRadius={shouldBlurContent ? 50 : 0}
          />
        </Pressable>

        {!mediaLoaded && !(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri)) && !shouldBlurContent && isConnected && (
          <View style={[styles.skeletonOverlay]}>
            <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
          </View>
        )}

        <MediaOfflineOverlay visible={!isConnected && !shouldBlurContent && !mediaLoaded} />

        {hasMultipleMedia && (
          <View style={styles.multiMediaBadge}>
            <Text size="xs" weight="semibold" style={{ color: "#fff" }}>
              +{extraMediaCount}
            </Text>
          </View>
        )}

        <MediaBlurRevealOverlay
          visible={shouldBlurContent}
          onRevealContent={onRevealContent}
        />

        <MediaTypeBadge type={media.type} />
        <View style={styles.borderOverlay} pointerEvents="none" />
      </View>
    </View>
  );
});
