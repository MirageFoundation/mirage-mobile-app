import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  LayoutAnimation,
  Platform,
  Pressable,
  UIManager,
  View,
  type GestureResponderEvent,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import YoutubePlayer from "react-native-youtube-iframe";
import { extractYouTubeVideoId, type ResolvedMedia } from "./post-card-utils";
import { MediaGallery } from "./media-gallery";
import { useVideoMuteStore } from "@/src/stores";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_MAX_HEIGHT = 450;
const MEDIA_HORIZONTAL_PADDING = 32; // md padding * 2

export type PostCardMediaRef = {
  pauseVideo: () => void;
};

type PostCardMediaProps = {
  media?: ResolvedMedia;
  mediaList?: ResolvedMedia[];
  isVisible: boolean;
  shouldBlurContent: boolean;
  hasMultipleMedia: boolean;
  extraMediaCount: number;
  /** Whether video autoplay is allowed based on user settings and network */
  allowAutoplay?: boolean;
  /** Whether the screen/feed is active (for pausing videos when navigating away) */
  screenActive?: boolean;
  onRevealContent?: () => void;
  /** Called when media is pressed (for opening preview) */
  onMediaPress?: () => void;
  onGalleryMediaPress?: (index: number) => void;
  /** Whether this is shown in post detail screen */
  isPostDetail?: boolean;
};

const MEDIA_ASPECT_RATIO_CACHE = new Map<string, number>();

function getMediaAspectRatio(media?: ResolvedMedia): number {
  if (!media) return 16 / 9;
  const cached = media.uri
    ? MEDIA_ASPECT_RATIO_CACHE.get(media.uri)
    : undefined;
  if (cached) return cached;
  if (media.aspectRatio) return media.aspectRatio;
  if (media.width && media.height) {
    return media.width / media.height;
  }
  if (media.type === "video") return 4 / 3;
  return 16 / 9;
}

export const PostCardMedia = memo(
  forwardRef<PostCardMediaRef, PostCardMediaProps>(function PostCardMedia(
    {
      media,
      mediaList,
      isVisible,
      shouldBlurContent,
      hasMultipleMedia,
      extraMediaCount,
      allowAutoplay = true,
      screenActive = true,
      onRevealContent,
      onMediaPress,
      onGalleryMediaPress,
      isPostDetail = false,
    },
    ref,
  ) {
    const [imageError, setImageError] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [isVideoLoading, setIsVideoLoading] = useState(false);
    const [isVideoProcessing, setIsVideoProcessing] = useState(false);
    const isMuted = useVideoMuteStore((s) => s.isMuted);
    const toggleMute = useVideoMuteStore((s) => s.toggleMute);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const videoRef = useRef<Video | null>(null);

    const aspectRatioLockedRef = useRef(false);
    // Track if user manually initiated playback (vs autoplay)
    const userInitiatedPlayRef = useRef(false);

    useImperativeHandle(ref, () => ({
      pauseVideo: () => {
        if (videoRef.current) {
          videoRef.current.pauseAsync().catch(() => {});
          setIsVideoPlaying(false);
          setIsVideoLoading(false);
          userInitiatedPlayRef.current = false;
        }
      },
    }));

    useEffect(() => {
      return () => {
        videoRef.current?.pauseAsync().catch(() => {});
      };
    }, []);

    const resolvedMediaUri = media?.uri;

    useEffect(() => {
      setMediaLoaded(false);
    }, [resolvedMediaUri]);

    const cachedAspectRatio = resolvedMediaUri
      ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri)
      : undefined;
    const [mediaAspectRatio, setMediaAspectRatio] = useState(
      cachedAspectRatio ?? getMediaAspectRatio(media),
    );

    useEffect(() => {
      if (!media) return;
      const cached = resolvedMediaUri
        ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri)
        : undefined;
      if (cached) {
        setMediaAspectRatio((current) =>
          Math.abs(current - cached) < 0.01 ? current : cached,
        );
        aspectRatioLockedRef.current = true;
        return;
      }

      setMediaAspectRatio(getMediaAspectRatio(media));
      aspectRatioLockedRef.current = false;
    }, [media, resolvedMediaUri]);

    useEffect(() => {
      const isPlayable = media?.type === "video" || media?.type === "youtube";
      if (!isPlayable || shouldBlurContent) {
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
        return;
      }

      // Only auto-play if allowed by settings, visible, and screen is active
      if (isVisible && allowAutoplay && screenActive) {
        // Autoplay - no loading indicator, just play silently in background
        setIsVideoPlaying(true);
      } else if (!isVisible || !screenActive) {
        // Pause when not visible or screen not active
        setIsVideoPlaying(false);
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
        videoRef.current?.pauseAsync().catch(() => {});
      }
    }, [
      media?.type,
      shouldBlurContent,
      isVisible,
      allowAutoplay,
      screenActive,
      resolvedMediaUri,
    ]);

    // Apply mute state changes to video
    useEffect(() => {
      if (videoRef.current && media?.type === "video") {
        videoRef.current.setStatusAsync({ isMuted }).catch(() => {});
      }
    }, [isMuted, media?.type]);

    const updateMediaAspectRatioFromSize = useCallback(
      (width?: number, height?: number) => {
        if (!width || !height) return;
        if (aspectRatioLockedRef.current) return;
        const ratio = width / height;
        if (!Number.isFinite(ratio) || ratio <= 0) return;
        setMediaAspectRatio((current) => {
          if (Math.abs(current - ratio) < 0.01) return current;
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          return ratio;
        });
        if (resolvedMediaUri) {
          MEDIA_ASPECT_RATIO_CACHE.set(resolvedMediaUri, ratio);
        }
        aspectRatioLockedRef.current = true;
      },
      [resolvedMediaUri],
    );

    const mediaSource = useMemo(
      () => ({ uri: resolvedMediaUri ?? "" }),
      [resolvedMediaUri],
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
          // User tapped play, video not loaded yet - show loading
          userInitiatedPlayRef.current = true;
          setIsVideoLoading(true);
          setIsVideoPlaying(true);
          return;
        }
        if (status.isPlaying) {
          await videoRef.current?.pauseAsync();
          setIsVideoPlaying(false);
          setIsVideoLoading(false);
          userInitiatedPlayRef.current = false;
          return;
        }
        // User manually starting/resuming playback
        userInitiatedPlayRef.current = true;
        if (status.didJustFinish) {
          setIsVideoLoading(true);
          await videoRef.current?.replayAsync();
        } else {
          setIsVideoLoading(true);
          await videoRef.current?.playAsync();
        }
        setIsVideoPlaying(true);
      } catch {
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
        // Ignore transient playback errors.
      }
    }, [media?.type, onRevealContent, shouldBlurContent]);

    const handlePlaybackStatusUpdate = useCallback(
      (status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
          return;
        }
        if (status.isPlaying && !status.isBuffering) {
          setIsVideoLoading(false);
          setMediaLoaded(true);
          userInitiatedPlayRef.current = false;
        } else if (status.isBuffering) {
          setIsVideoLoading(true);
        }
      },
      [],
    );

    const handleVideoPress = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        handleVideoToggle();
      },
      [handleVideoToggle],
    );

    const handleMuteToggle = useCallback(
      async (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        triggerHaptic("light");
        const newMutedState = !isMuted;
        toggleMute();

        // When unmuting, we need to pause and resume to initialize audio
        if (videoRef.current) {
          try {
            if (!newMutedState) {
              // Unmuting: pause, set unmuted, then play to initialize audio
              await videoRef.current.pauseAsync();
              await videoRef.current.setStatusAsync({ isMuted: false });
              await videoRef.current.playAsync();
            } else {
              // Muting: just set the status
              await videoRef.current.setStatusAsync({ isMuted: true });
            }
          } catch {}
        }
      },
      [isMuted, toggleMute],
    );

    const handleMediaPress = useCallback(
      (event: GestureResponderEvent) => {
        event.stopPropagation?.();
        if (shouldBlurContent) {
          onRevealContent?.();
          return;
        }
        triggerHaptic("selection");
        onMediaPress?.();
      },
      [shouldBlurContent, onRevealContent, onMediaPress],
    );

    // Don't hide cloudflarestream videos on error - they might be processing
    const isCloudflareVideo =
      media?.uri?.includes("cloudflarestream.com") ||
      media?.uri?.includes("videodelivery.net");
    const shouldHideOnError =
      imageError && !isCloudflareVideo && !isVideoProcessing;

    // Calculate if media would exceed max height - if so, use fixed height instead of aspect ratio
    const containerWidth = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
    const calculatedHeight = containerWidth / mediaAspectRatio;
    const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;

    // When height exceeds max, use fixed height. Otherwise use aspect ratio for natural sizing
    const mediaWrapperStyle = exceedsMaxHeight
      ? { height: MEDIA_MAX_HEIGHT }
      : { aspectRatio: mediaAspectRatio };

    if (!media || shouldHideOnError) return null;

    if (mediaList && mediaList.length > 1) {
      return (
        <View style={styles.mediaContainer}>
          <View style={styles.mediaWrapper}>
            <MediaGallery
              media={mediaList}
              onMediaPress={onGalleryMediaPress}
              screenActive={screenActive}
              allowAutoplay={allowAutoplay}
              isVisible={isVisible}
              isPostDetail={isPostDetail}
            />
          </View>
        </View>
      );
    }

    if (
      __DEV__ &&
      (media.uri?.includes("cloudflarestream") ||
        media.uri?.includes("videodelivery"))
    ) {
      // console.log("[PostCardMedia] Rendering video:", media.uri, "type:", media.type, "imageError:", imageError, "isVideoProcessing:", isVideoProcessing);
    }

    return (
      <View style={styles.mediaContainer}>
        <View style={[styles.mediaWrapper, mediaWrapperStyle]}>
          {media.type === "youtube" ? (
            <YoutubePlayer
              height={exceedsMaxHeight ? MEDIA_MAX_HEIGHT : calculatedHeight}
              videoId={extractYouTubeVideoId(media.uri) ?? ""}
              play={isVideoPlaying && isVisible && screenActive}
              onReady={() => setMediaLoaded(true)}
              webViewProps={{
                allowsInlineMediaPlayback: true,
              }}
            />
          ) : media.type === "video" ? (
            <Pressable onPress={handleMediaPress} style={styles.media}>
              <Video
                ref={videoRef}
                source={mediaSource}
                style={styles.media}
                resizeMode={ResizeMode.COVER}
                shouldPlay={isVideoPlaying && screenActive && isVisible}
                isLooping={true}
                isMuted={isMuted}
                useNativeControls={false}
                onLoad={() => {
                  videoRef.current?.setStatusAsync({ isMuted }).catch(() => {});
                }}
                onReadyForDisplay={(event) => {
                  const { width, height } = event.naturalSize ?? {};
                  updateMediaAspectRatioFromSize(width, height);
                  setMediaLoaded(true);
                  // Video is ready to display - hide loading if user initiated
                  if (userInitiatedPlayRef.current) {
                    setIsVideoLoading(false);
                    userInitiatedPlayRef.current = false;
                  }
                  // Video loaded successfully - clear processing state
                  if (isVideoProcessing) {
                    setIsVideoProcessing(false);
                  }
                  // Ensure mute state is applied
                  videoRef.current?.setStatusAsync({ isMuted }).catch(() => {});
                }}
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                onError={(error) => {
                  if (__DEV__) {
                    console.log(
                      "[PostCardMedia] Video error:",
                      error,
                      "uri:",
                      mediaSource.uri,
                    );
                  }
                  // For cloudflare stream videos, show processing state instead of hiding
                  const isCloudflare =
                    mediaSource.uri?.includes("cloudflarestream.com") ||
                    mediaSource.uri?.includes("videodelivery.net");
                  if (isCloudflare) {
                    setIsVideoProcessing(true);
                  } else {
                    setImageError(true);
                  }
                  setIsVideoLoading(false);
                }}
              />
            </Pressable>
          ) : (
            <Pressable onPress={handleMediaPress} style={styles.media}>
              <Image
                source={mediaSource}
                style={styles.media}
                contentFit="cover"
                cachePolicy="memory-disk"
                onLoad={({ source }) => {
                  updateMediaAspectRatioFromSize(source?.width, source?.height);
                  setMediaLoaded(true);
                }}
                onError={() => setImageError(true)}
                blurRadius={shouldBlurContent ? 50 : 0}
              />
            </Pressable>
          )}

          {!mediaLoaded && !shouldBlurContent && (
            <View style={[styles.skeletonOverlay]}>
              <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
            </View>
          )}

          {media.type === "video" &&
            !shouldBlurContent &&
            !isVideoProcessing && (
              <View style={styles.playOverlay}>
                {isPostDetail ? (
                  <>
                    <Pressable
                      onPress={handleVideoPress}
                      style={styles.videoTapArea}
                    />
                    {isVideoLoading || (isVideoPlaying && !mediaLoaded) ? (
                      <View
                        style={styles.loadingContainer}
                        pointerEvents="none"
                      >
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    ) : !isVideoPlaying ? (
                      <View style={styles.playButton} pointerEvents="none">
                        <Ionicons name="play" size={28} color="#fff" />
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={handleMediaPress}
                      style={styles.videoTapArea}
                    />
                    {isVideoLoading || (isVideoPlaying && !mediaLoaded) ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    ) : (
                      <Pressable
                        onPress={handleVideoPress}
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
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            )}

          {media.type === "video" &&
            !shouldBlurContent &&
            !isVideoProcessing &&
            isPostDetail && (
              <Pressable
                onPress={() => {
                  onMediaPress?.();
                }}
                style={styles.fullscreenButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.fullscreenButtonInner}>
                  <Ionicons name="expand" size={16} color="#fff" />
                </View>
              </Pressable>
            )}

          {/* Mute/Unmute button for videos */}
          {media.type === "video" &&
            !shouldBlurContent &&
            !isVideoProcessing && (
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

          {/* Video processing overlay for Cloudflare Stream */}
          {isVideoProcessing && isCloudflareVideo && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text
                size="sm"
                weight="semibold"
                style={{ color: "#fff", marginTop: 8 }}
              >
                Video processing...
              </Text>
              <Text
                size="xs"
                style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}
              >
                This may take a few moments
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

          {/* Video badge - placed after blur so it's always visible */}
          {media.type === "video" && (
            <View style={styles.videoBadge}>
              <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                VIDEO
              </Text>
            </View>
          )}

          {/* GIF badge - placed after blur so it's always visible */}
          {media.type === "gif" && (
            <View style={styles.gifBadge}>
              <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                GIF
              </Text>
            </View>
          )}

          {/* Image badge - placed after blur so it's always visible */}
          {media.type === "image" && (
            <View style={styles.imageBadge}>
              <Text size="xs" weight="bold" style={{ color: "#fff" }}>
                IMG
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }),
);

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
    borderWidth: 0.3,
    borderColor: theme.colors.border.subtle,
  },
  skeletonOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.md,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  media: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  videoTapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
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
  fullscreenButton: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    zIndex: 20,
  },
  fullscreenButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  gifBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    zIndex: 20,
  },
  videoBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    zIndex: 20,
  },
  imageBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    zIndex: 20,
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
    width: "100%",
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
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 5, 5, 0.97)",
    gap: 8,
  },
}));
