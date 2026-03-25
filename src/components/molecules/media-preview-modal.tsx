import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent, useEventListener } from "expo";
import { Image } from "expo-image";
import * as ScreenOrientation from "expo-screen-orientation";
import * as Sentry from "@sentry/react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import YoutubePlayer, { type YoutubeIframeRef } from "react-native-youtube-iframe";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import type { ResolvedMedia } from "./post-card-utils";

import { Text } from "@/src/components/ui/primitives";
import { useAppState } from "@/src/hooks";
import { useScreenOrientation } from "@/src/hooks/use-screen-orientation";
import {
  buildVideoPositionKey,
  useVideoMuteStore,
  useVideoPositionStore,
} from "@/src/stores";
import {
  YouTubeAutoplayEmbed,
  type YouTubeAutoplayEmbedRef,
} from "./youtube-autoplay-embed";
import { extractYouTubeVideoId } from "./post-card-utils";

const PreviewVideoItem = memo(function PreviewVideoItem({
  item,
  width,
  height,
  isActive,
  videoSyncScope,
}: {
  item: ResolvedMedia;
  width: number;
  height: number;
  isActive: boolean;
  videoSyncScope?: string;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const muted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const getPosition = useVideoPositionStore((s) => s.getPosition);
  const setPositionStore = useVideoPositionStore((s) => s.setPosition);
  const positionKey = buildVideoPositionKey(item.uri, videoSyncScope);
  const currentTimeRef = useRef(0);
  const hasRestoredRef = useRef(false);

  const videoSource = useMemo(() => {
    const isHls = item.uri.includes(".m3u8");
    return { uri: item.uri, useCaching: !isHls };
  }, [item.uri]);
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.1;
  });

  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    currentTimeRef.current = currentTime;
  });

  useEventListener(player, "statusChange", ({ status }) => {
    if (status === "readyToPlay") {
      setIsLoading(false);
      if (!hasRestoredRef.current && item.uri) {
        const saved = getPosition(positionKey);
        if (saved > 0.5) {
          hasRestoredRef.current = true;
          player.currentTime = saved;
        }
      }
      player.play();
    }
  });

  useEffect(() => {
    if (firstFrameReady) {
      player.muted = muted;
    }
  }, [muted, firstFrameReady, player]);

  useEffect(() => {
    if (!isActive) {
      if (item.uri && currentTimeRef.current > 0.5) {
        setPositionStore(positionKey, currentTimeRef.current);
      }
      player.pause();
    }
  }, [isActive, item.uri, setPositionStore, positionKey, player]);

  useEffect(() => {
    return () => {
      if (item.uri && currentTimeRef.current > 0.5) {
        useVideoPositionStore.getState().setPosition(positionKey, currentTimeRef.current);
      }
    };
  }, [item.uri, positionKey]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player]);

  const handleToggleMute = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  return (
    <View style={{ width, height, justifyContent: "center", alignItems: "center" }}>
      <Pressable onPress={handleTogglePlay} style={{ width, height }}>
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          nativeControls={false}
          onFirstFrameRender={() => {
            setFirstFrameReady(true);
            setIsLoading(false);
            player.muted = muted;
          }}
        />
        {isLoading && (
          <View style={previewVideoStyles.playOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        {!isPlaying && !isLoading && (
          <View style={previewVideoStyles.playOverlay}>
            <View style={previewVideoStyles.playButton}>
              <Ionicons name="play" size={40} color="#fff" />
            </View>
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={handleToggleMute}
        style={previewVideoStyles.muteButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={previewVideoStyles.muteButtonInner}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
        </View>
      </Pressable>
    </View>
  );
});

const PreviewYouTubeItem = memo(function PreviewYouTubeItem({
  item,
  width,
  height,
  isActive,
  videoSyncScope,
}: {
  item: ResolvedMedia;
  width: number;
  height: number;
  isActive: boolean;
  videoSyncScope?: string;
}) {
  const embedRef = useRef<YouTubeAutoplayEmbedRef | null>(null);
  const iframeRef = useRef<YoutubeIframeRef | null>(null);
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const muted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoId = extractYouTubeVideoId(item.uri) ?? "";
  const positionKey = videoId
    ? buildVideoPositionKey(videoId, videoSyncScope)
    : "";
  const isAndroid = Platform.OS === "android";
  const youtubeHeight = Math.max(240, height - (insets.top + insets.bottom + 32));
  const getPosition = useVideoPositionStore((s) => s.getPosition);
  const setPositionStore = useVideoPositionStore((s) => s.setPosition);
  const hasRestoredRef = useRef(false);
  const lastKnownTimeRef = useRef(0);
  const playingRef = useRef(playing);
  const resumePlaybackRef = useRef(true);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 2000);
  }, []);

  const handleScreenTap = useCallback(() => {
    if (controlsVisible) {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      setControlsVisible(false);
    } else {
      showControlsTemporarily();
    }
  }, [controlsVisible, showControlsTemporarily]);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  const savePositionSync = useCallback(() => {
    if (!positionKey) return;
    if (isAndroid) {
      const t = embedRef.current?.getLastKnownTime?.() ?? lastKnownTimeRef.current;
      if (t > 2) setPositionStore(positionKey, t);
    } else {
      const t = lastKnownTimeRef.current;
      if (t > 2) setPositionStore(positionKey, t);
    }
  }, [positionKey, isAndroid, setPositionStore]);

  const handleTimeUpdate = useCallback((seconds: number) => {
    lastKnownTimeRef.current = seconds;
  }, []);

  const restorePosition = useCallback(() => {
    if (!isAndroid) return;
    if (!positionKey || hasRestoredRef.current) return;
    const saved = getPosition(positionKey);
    if (saved > 2) {
      hasRestoredRef.current = true;
      setTimeout(() => {
        embedRef.current?.seekTo(saved);
        setTimeout(() => embedRef.current?.play(), 600);
      }, 600);
    }
  }, [positionKey, isAndroid, getPosition]);

  useEffect(() => {
    if (!isActive) {
      resumePlaybackRef.current = playingRef.current;
      savePositionSync();
      setPlaying(false);
      if (isAndroid) {
        embedRef.current?.pause();
      }
    } else {
      hasRestoredRef.current = false;
      if (resumePlaybackRef.current) {
        setPlaying(true);
      }
    }
  }, [isActive, isAndroid, savePositionSync]);

  const handleTogglePlay = useCallback(() => {
    setPlaying((prev) => {
      const next = !prev;
      if (isAndroid) {
        if (next) {
          embedRef.current?.play();
        } else {
          embedRef.current?.pause();
        }
      }
      return next;
    });
  }, [isAndroid]);

  const handleToggleMute = useCallback(() => {
    const nextMuted = !muted;
    toggleMute();
    if (isAndroid) {
      embedRef.current?.setMuted(nextMuted);
    }
  }, [muted, toggleMute, isAndroid]);

  const handleSeekBy = useCallback(
    async (seconds: number) => {
      if (isAndroid) {
        embedRef.current?.seekBy(seconds);
        return;
      }
      try {
        const current = await iframeRef.current?.getCurrentTime();
        if (typeof current === "number") {
          const next = Math.max(current + seconds, 0);
          iframeRef.current?.seekTo(next, true);
        }
      } catch {}
    },
    [isAndroid],
  );

  return (
    <View
      style={{
        width,
        height,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Pressable
        onPress={isAndroid ? handleScreenTap : handleTogglePlay}
        style={{ width, height: youtubeHeight }}
      >
        {isAndroid ? (
          <YouTubeAutoplayEmbed
            ref={embedRef}
            height={youtubeHeight}
            videoId={videoId}
            play={playing && isActive}
            muted={muted}
            autoplay={true}
            controls={false}
            loop={true}
            allowFullscreen={false}
            onPress={handleScreenTap}
            onReady={() => setIsLoading(false)}
            onPlaying={() => {
              setIsLoading(false);
              setPlaying(true);
              restorePosition();
            }}
            onTimeUpdate={handleTimeUpdate}
            onStateChange={(state) => {
              if (state === "playing") {
                setPlaying(true);
                setIsLoading(false);
              }
              if (state === "paused" || state === "ended") {
                setPlaying(false);
              }
            }}
          />
        ) : (
          <YoutubePlayer
            ref={iframeRef}
            height={youtubeHeight}
            videoId={videoId}
            play={playing && isActive}
            mute={muted}
            forceAndroidAutoplay={false}
            initialPlayerParams={{
              controls: false,
              preventFullScreen: false,
              rel: false,
            }}
            onReady={() => setIsLoading(false)}
            onChangeState={(event: string) => {
              if (event === "playing") {
                setPlaying(true);
                setIsLoading(false);
                restorePosition();
              }
              if (event === "paused" || event === "ended") {
                setPlaying(false);
              }
            }}
            webViewProps={{
              allowsInlineMediaPlayback: true,
              mediaPlaybackRequiresUserAction: false,
            }}
          />
        )}

      </Pressable>

      {isAndroid && controlsVisible && (
        <View style={previewVideoStyles.centerControlsOverlay} pointerEvents="box-none">
          <View style={previewVideoStyles.centerControlsRow}>
            <Pressable onPress={() => { handleSeekBy(-10); showControlsTemporarily(); }} style={previewVideoStyles.youtubeControlButton}>
              <Ionicons name="play-back" size={22} color="#fff" />
            </Pressable>
            <Pressable onPress={() => { handleTogglePlay(); showControlsTemporarily(); }} style={previewVideoStyles.centerPlayButton}>
              <Ionicons name={playing ? "pause" : "play"} size={36} color="#fff" />
            </Pressable>
            <Pressable onPress={() => { handleSeekBy(10); showControlsTemporarily(); }} style={previewVideoStyles.youtubeControlButton}>
              <Ionicons name="play-forward" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
      {isAndroid && (
        <Pressable
          onPress={handleToggleMute}
          style={[previewVideoStyles.muteButton, { bottom: insets.bottom + 10, right: 16 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={previewVideoStyles.muteButtonInner}>
            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={22} color="#fff" />
          </View>
        </Pressable>
      )}
      {isAndroid && (
        <Pressable
          onPress={() => {
            if (item.uri) Linking.openURL(item.uri);
          }}
          style={[previewVideoStyles.watchOnYouTubeButton, { bottom: insets.bottom + 10, left: 16 }]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <View style={previewVideoStyles.watchOnYouTubeInner}>
            <Ionicons name="logo-youtube" size={14} color="#FF0000" />
            <Text size="xs" weight="semibold" style={{ color: "#fff", marginLeft: 4 }}>
              Watch on YouTube
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
});

const previewVideoStyles = StyleSheet.create({
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    position: "absolute",
    bottom: 80,
    right: 20,
  },
  muteButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerControlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  centerControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  centerPlayButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  youtubeControlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  watchOnYouTubeButton: {
    position: "absolute",
    bottom: 80,
    left: 20,
  },
  watchOnYouTubeInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
});

type MediaPreviewModalProps = {
  visible: boolean;
  media: ResolvedMedia | null;
  mediaList?: ResolvedMedia[];
  initialIndex?: number;
  videoSyncScope?: string;
  onClose: () => void;
};

export const MediaPreviewModal = memo(function MediaPreviewModal({
  visible,
  media,
  mediaList,
  initialIndex = 0,
  videoSyncScope,
  onClose,
}: MediaPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const { screenWidth, screenHeight } = useScreenOrientation();
  const { currentState } = useAppState();
  const mediaSurfaceActive = visible && currentState === "active";

  useEffect(() => {
    if (visible) {
      console.log("[MediaPreview] Setting orientation to DEFAULT (all but upside down)");
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT)
        .then(() => console.log("[MediaPreview] Orientation unlocked for rotation"))
        .catch((e) => {
          Sentry.addBreadcrumb({ category: "media-preview", message: "Orientation lockAsync failed", data: { error: String(e) }, level: "warning" });
        });
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [visible]);
  const isMuted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const [isLoading, setIsLoading] = useState(true);
  const currentVideoTimeRef = useRef(0);
  const hasRestoredVideoRef = useRef(false);
  const videoPositionKey = media?.uri
    ? buildVideoPositionKey(media.uri, videoSyncScope)
    : "";

  const isVideo = media?.type === "video";
  const [singleFirstFrameReady, setSingleFirstFrameReady] = useState(false);
  const singleVideoSource = useMemo(
    () => {
      if (!isVideo || !media?.uri) return null;
      const isHls = media.uri.includes(".m3u8");
      return { uri: media.uri, useCaching: !isHls };
    },
    [isVideo, media?.uri],
  );
  const singleVideoPlayer = useVideoPlayer(singleVideoSource, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.1;
  });

  const { isPlaying: singleVideoIsPlaying } = useEvent(singleVideoPlayer, "playingChange", {
    isPlaying: singleVideoPlayer.playing,
  });

  useEventListener(singleVideoPlayer, "timeUpdate", ({ currentTime }) => {
    currentVideoTimeRef.current = currentTime;
  });

  useEventListener(singleVideoPlayer, "statusChange", ({ status }) => {
    if (status === "readyToPlay") {
      if (!hasRestoredVideoRef.current && media?.uri) {
        const saved = useVideoPositionStore.getState().getPosition(videoPositionKey);
        if (saved > 0.5) {
          hasRestoredVideoRef.current = true;
          singleVideoPlayer.currentTime = saved;
        }
      }
      singleVideoPlayer.play();
    }
  });

  useEffect(() => {
    if (singleFirstFrameReady) {
      singleVideoPlayer.muted = isMuted;
    }
  }, [isMuted, singleFirstFrameReady, singleVideoPlayer]);

  useEffect(() => {
    if (!visible) {
      singleVideoPlayer.pause();
      setSingleFirstFrameReady(false);
      setIsLoading(true);
      hasRestoredVideoRef.current = false;
    }
  }, [visible, singleVideoPlayer]);

  const [activeGalleryIndex, setActiveGalleryIndex] = useState(initialIndex);
  const galleryListRef = useRef<FlatList>(null);
  const hasGallery = mediaList && mediaList.length > 1;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTransforms = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const handleClose = useCallback(() => {
    if (media?.type === "video" && videoPositionKey && currentVideoTimeRef.current > 0.5) {
      useVideoPositionStore.getState().setPosition(videoPositionKey, currentVideoTimeRef.current);
    }
    singleVideoPlayer.pause();
    resetTransforms();
    setIsLoading(true);
    setSingleFirstFrameReady(false);
    hasRestoredVideoRef.current = false;
    onClose();
  }, [onClose, resetTransforms, media, videoPositionKey, singleVideoPlayer]);

  const handleVideoToggle = useCallback(() => {
    if (singleVideoIsPlaying) {
      singleVideoPlayer.pause();
    } else {
      singleVideoPlayer.play();
    }
  }, [singleVideoIsPlaying, singleVideoPlayer]);

  const handleMuteToggle = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > 4) {
        scale.value = withTiming(4);
        savedScale.value = 4;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
      }
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!media && !hasGallery) return null;

  if (hasGallery) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
        statusBarTranslucent
        supportedOrientations={["portrait", "landscape"]}
      >
        <View style={styles.container}>
          <Pressable
            style={[styles.closeButton, { top: insets.top + 10 }]}
            onPress={handleClose}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <View style={styles.closeButtonInner}>
              <Ionicons name="close" size={24} color="#fff" />
            </View>
          </Pressable>

          <FlatList
            ref={galleryListRef}
            data={mediaList}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={initialIndex}
            getItemLayout={(_, index) => ({
              length: screenWidth,
              offset: screenWidth * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
              setActiveGalleryIndex(idx);
            }}
            keyExtractor={(item, index) => `${item.uri}-${index}`}
            renderItem={({ item, index }) =>
              item.type === "video" ? (
                <PreviewVideoItem item={item} width={screenWidth} height={screenHeight} isActive={index === activeGalleryIndex && mediaSurfaceActive} videoSyncScope={videoSyncScope} />
              ) : item.type === "youtube" ? (
                <PreviewYouTubeItem item={item} width={screenWidth} height={screenHeight} isActive={index === activeGalleryIndex && mediaSurfaceActive} videoSyncScope={videoSyncScope} />
              ) : (
                <View style={[styles.mediaContainer, { width: screenWidth, height: screenHeight }]}>
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.fullMedia}
                    contentFit="contain"
                  />
                </View>
              )
            }
          />

          <View style={[styles.pageIndicator, { bottom: insets.bottom + 20 }]}>
            <Text style={styles.pageIndicatorText}>
              {activeGalleryIndex + 1} / {mediaList!.length}
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  const isMediaVideo = media!.type === "video";
  const isYouTube = media!.type === "youtube";
  const isGif = media!.type === "gif";
  const isImage = media!.type === "image";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.container}>
          <Pressable
            style={[styles.closeButton, { top: insets.top + 10 }]}
            onPress={handleClose}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <View style={styles.closeButtonInner}>
              <Ionicons name="close" size={24} color="#fff" />
            </View>
          </Pressable>

          {isImage && (
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={[styles.mediaContainer, { width: screenWidth, height: screenHeight }, animatedStyle]}>
                <Image
                  source={{ uri: media!.uri }}
                  style={styles.fullMedia}
                  contentFit="contain"
                  onLoad={() => setIsLoading(false)}
                />
              </Animated.View>
            </GestureDetector>
          )}

          {isGif && (
            <View style={[styles.mediaContainer, { width: screenWidth, height: screenHeight }]}>
              <Image
                source={{ uri: media!.uri }}
                style={styles.fullMedia}
                contentFit="contain"
                onLoad={() => setIsLoading(false)}
              />
            </View>
          )}

          {isMediaVideo && (
            <Pressable style={[styles.mediaContainer, { width: screenWidth, height: screenHeight }]} onPress={handleVideoToggle}>
              <VideoView
                player={singleVideoPlayer}
                style={styles.fullMedia}
                contentFit="contain"
                nativeControls={false}
                onFirstFrameRender={() => {
                  setSingleFirstFrameReady(true);
                  setIsLoading(false);
                  singleVideoPlayer.muted = isMuted;
                }}
              />
              {!singleVideoIsPlaying && !isLoading && (
                <View style={styles.playOverlay}>
                  <View style={styles.playButton}>
                    <Ionicons name="play" size={40} color="#fff" />
                  </View>
                </View>
              )}
            </Pressable>
          )}

          {isYouTube && (
            <PreviewYouTubeItem item={media!} width={screenWidth} height={screenHeight} isActive={mediaSurfaceActive} videoSyncScope={videoSyncScope} />
          )}

          {!isYouTube && isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}

          {isMediaVideo && (
            <Pressable
              style={[styles.muteButton, { bottom: insets.bottom + 10 }]}
              onPress={handleMuteToggle}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={styles.controlButtonInner}>
                <Ionicons
                  name={isMuted ? "volume-mute" : "volume-high"}
                  size={20}
                  color="#fff"
                />
              </View>
            </Pressable>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const styles = StyleSheet.create((theme) => ({
  gestureRoot: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 100,
  },
  closeButtonInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullMedia: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    position: "absolute",
    right: 16,
    zIndex: 100,
  },
  controlButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageIndicator: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  pageIndicatorText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
}));
