import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, View, type GestureResponderEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ResolvedMedia } from "./post-card-utils";

type PostCardMediaProps = {
  media?: ResolvedMedia;
  isVisible: boolean;
  shouldBlurContent: boolean;
  hasMultipleMedia: boolean;
  extraMediaCount: number;
  onRevealContent?: () => void;
};

const MEDIA_ASPECT_RATIO_CACHE = new Map<string, number>();

function getMediaAspectRatio(media?: ResolvedMedia): number {
  if (!media) return 16 / 9;
  if (media.aspectRatio) return media.aspectRatio;
  if (media.width && media.height) {
    return media.width / media.height;
  }
  return 16 / 9;
}

export const PostCardMedia = memo(function PostCardMedia({
  media,
  isVisible,
  shouldBlurContent,
  hasMultipleMedia,
  extraMediaCount,
  onRevealContent,
}: PostCardMediaProps) {
  const [imageError, setImageError] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<Video | null>(null);
  const aspectRatioLockedRef = useRef(false);

  const resolvedMediaUri = media?.uri;
  const cachedAspectRatio = resolvedMediaUri
    ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri)
    : undefined;
  const [mediaAspectRatio, setMediaAspectRatio] = useState(
    cachedAspectRatio ?? getMediaAspectRatio(media)
  );

  useEffect(() => {
    if (!media) return;
    const cached = resolvedMediaUri
      ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri)
      : undefined;
    if (cached) {
      setMediaAspectRatio((current) =>
        Math.abs(current - cached) < 0.01 ? current : cached
      );
      aspectRatioLockedRef.current = true;
      return;
    }

    setMediaAspectRatio(getMediaAspectRatio(media));
    aspectRatioLockedRef.current = false;
  }, [media, resolvedMediaUri]);

  useEffect(() => {
    const isVideo = media?.type === "video";
    if (!isVideo || shouldBlurContent) {
      setIsVideoPlaying(false);
      return;
    }

    if (isVisible) {
      setIsVideoPlaying(true);
    } else {
      setIsVideoPlaying(false);
      videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [media?.type, shouldBlurContent, isVisible, resolvedMediaUri]);

  const updateMediaAspectRatioFromSize = useCallback(
    (width?: number, height?: number) => {
      if (!width || !height) return;
      if (aspectRatioLockedRef.current) return;
      const ratio = width / height;
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      setMediaAspectRatio((current) =>
        Math.abs(current - ratio) < 0.01 ? current : ratio
      );
      if (resolvedMediaUri) {
        MEDIA_ASPECT_RATIO_CACHE.set(resolvedMediaUri, ratio);
      }
      aspectRatioLockedRef.current = true;
    },
    [resolvedMediaUri]
  );

  const mediaSource = useMemo(
    () => ({ uri: resolvedMediaUri ?? "" }),
    [resolvedMediaUri]
  );

  const handleVideoToggle = useCallback(async () => {
    if (media?.type !== "video") return;
    if (shouldBlurContent) {
      onRevealContent?.();
      return;
    }

    try {
      const status = await videoRef.current?.getStatusAsync();
      if (!status || !status.isLoaded) {
        setIsVideoPlaying(true);
        return;
      }
      if (status.isPlaying) {
        await videoRef.current?.pauseAsync();
        setIsVideoPlaying(false);
        return;
      }
      if (status.didJustFinish) {
        await videoRef.current?.replayAsync();
      } else {
        await videoRef.current?.playAsync();
      }
      setIsVideoPlaying(true);
    } catch {
      // Ignore transient playback errors.
    }
  }, [media?.type, onRevealContent, shouldBlurContent]);

  const handleVideoPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation?.();
      handleVideoToggle();
    },
    [handleVideoToggle]
  );

  const handleMuteToggle = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation?.();
      triggerHaptic("light");
      setIsMuted((prev) => !prev);
    },
    []
  );

  if (!media || imageError) return null;

  return (
    <View style={styles.mediaContainer}>
      <View style={[styles.mediaWrapper, { aspectRatio: mediaAspectRatio }]}>
        {media.type === "video" ? (
          <Video
            ref={videoRef}
            source={mediaSource}
            style={styles.media}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isVideoPlaying}
            isLooping={true}
            isMuted={isMuted}
            useNativeControls={false}
            onLoad={(status) => {
              if (!status.isLoaded) return;
              const { width, height } = status.naturalSize ?? {};
              updateMediaAspectRatioFromSize(width, height);
            }}
            onReadyForDisplay={(event) => {
              const { width, height } = event.naturalSize ?? {};
              updateMediaAspectRatioFromSize(width, height);
            }}
            onError={() => setImageError(true)}
          />
        ) : (
          <Image
            source={mediaSource}
            style={styles.media}
            contentFit="cover"
            cachePolicy="memory-disk"
            onLoad={({ source }) => {
              updateMediaAspectRatioFromSize(source?.width, source?.height);
            }}
            onError={() => setImageError(true)}
            blurRadius={shouldBlurContent ? 30 : 0}
          />
        )}

        {media.type === "video" && !shouldBlurContent && (
          <Pressable onPress={handleVideoPress} style={styles.playOverlay}>
            <View
              style={[
                styles.playButton,
                { opacity: isVideoPlaying ? 0.6 : 1 },
              ]}
            >
              <Ionicons
                name={isVideoPlaying ? "pause" : "play"}
                size={28}
                color="#fff"
              />
            </View>
          </Pressable>
        )}

        {/* Mute/Unmute button for videos */}
        {media.type === "video" && !shouldBlurContent && (
          <Pressable
            onPress={handleMuteToggle}
            style={styles.muteButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.muteButtonInner}>
              <Ionicons
                name={isMuted ? "volume-mute" : "volume-high"}
                size={16}
                color="#fff"
              />
            </View>
          </Pressable>
        )}

        {media.type === "gif" && (
          <View style={styles.gifBadge}>
            <Text size="xs" weight="bold" style={{ color: "#fff" }}>
              GIF
            </Text>
          </View>
        )}

        {hasMultipleMedia && (
          <View style={styles.multiMediaBadge}>
            <Text size="xs" weight="semibold" style={{ color: "#fff" }}>
              +{extraMediaCount}
            </Text>
          </View>
        )}

        {/* Blur overlay with reveal button */}
        {shouldBlurContent && (
          <Pressable onPress={onRevealContent} style={styles.blurOverlay}>
            {Platform.OS === "ios" ? (
              <BlurView
                intensity={80}
                tint="dark"
                style={styles.blurViewFill}
              >
                <View style={styles.revealTextContainer}>
                  <Ionicons name="eye-outline" size={24} color="#fff" />
                  <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
                    Tap to reveal
                  </Text>
                </View>
              </BlurView>
            ) : (
              <View style={styles.androidBlurOverlay}>
                <Ionicons name="eye-outline" size={24} color="#fff" />
                <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
                  Tap to reveal
                </Text>
              </View>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  mediaContainer: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  mediaWrapper: {
    width: "100%",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    position: "absolute",
    bottom: theme.spacing.sm,
    right: theme.spacing.sm,
  },
  muteButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  gifBadge: {
    position: "absolute",
    bottom: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  multiMediaBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  blurViewFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  revealTextContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  androidBlurOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    gap: 8,
  },
}));
