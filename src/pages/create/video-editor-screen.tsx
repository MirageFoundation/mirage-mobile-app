import { Feather } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import { useLocalSearchParams } from "expo-router";
import { router } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { processVideo } from "@/src/utils/video-processing";
import { setPendingVideoResult } from "@/src/stores/video-editor-result-store";

const SCREEN_WIDTH = Dimensions.get("window").width;
const TIMELINE_PADDING = 24;
const TIMELINE_WIDTH = SCREEN_WIDTH - TIMELINE_PADDING * 2;
const MIN_TRIM_DURATION = 1000; // 1 second minimum
const MAX_TRIM_DURATION = 59000; // 59 seconds maximum

export function VideoEditorScreen() {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ uri: string; width?: string; height?: string; initialTrimStart?: string; initialTrimEnd?: string; replacingUri?: string; returnTo?: string }>();
  
  const videoUri = params.uri;
  const initialVideoWidth = params.width ? parseInt(params.width) : 1920;
  const initialVideoHeight = params.height ? parseInt(params.height) : 1080;
  
  const videoRef = useRef<Video>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resolvedVideoSize, setResolvedVideoSize] = useState({
    width: initialVideoWidth,
    height: initialVideoHeight,
  });
  
  const initialTrimStartMs = params.initialTrimStart ? parseInt(params.initialTrimStart) : 0;
  const initialTrimEndMs = params.initialTrimEnd ? parseInt(params.initialTrimEnd) : 0;

  // Trim state (in milliseconds)
  const [trimStart, setTrimStart] = useState(initialTrimStartMs);
  const [trimEnd, setTrimEnd] = useState(initialTrimEndMs);
  
  // Shared values for trim handles
  const leftTrimPosition = useSharedValue(0);
  const rightTrimPosition = useSharedValue(TIMELINE_WIDTH);
  
  const aspectRatio =
    resolvedVideoSize.width > 0 && resolvedVideoSize.height > 0
      ? resolvedVideoSize.width / resolvedVideoSize.height
      : 16 / 9;
  const videoDisplayHeight = Math.min(SCREEN_WIDTH / aspectRatio, 400);

  useEffect(() => {
    if (duration > 0 && trimEnd === 0) {
      const maxEnd = Math.min(duration, MAX_TRIM_DURATION);
      setTrimEnd(maxEnd);
      rightTrimPosition.value = (maxEnd / duration) * TIMELINE_WIDTH;
    }
    if (duration > 0 && initialTrimStartMs > 0) {
      leftTrimPosition.value = (initialTrimStartMs / duration) * TIMELINE_WIDTH;
      videoRef.current?.setPositionAsync(initialTrimStartMs).catch(() => {});
    }
    if (duration > 0 && initialTrimEndMs > 0 && initialTrimEndMs < duration) {
      const clampedEnd = Math.min(initialTrimEndMs, initialTrimStartMs + MAX_TRIM_DURATION);
      setTrimEnd(clampedEnd);
      rightTrimPosition.value = (clampedEnd / duration) * TIMELINE_WIDTH;
    }
  }, [duration]);

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    
    if (status.durationMillis && duration === 0) {
      setDuration(status.durationMillis);
      setTrimEnd(Math.min(status.durationMillis, MAX_TRIM_DURATION));
    }
    
    setCurrentPosition(status.positionMillis);
    setIsPlaying(status.isPlaying);
    
    // Loop within trim region
    if (status.positionMillis >= trimEnd && trimEnd > 0) {
      videoRef.current?.setPositionAsync(trimStart).catch(() => {});
    }
  }, [duration, trimStart, trimEnd]);

  const handlePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    triggerHaptic("light");
    
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    
    if (status.isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      // If at end of trim, restart from trim start
      if (status.positionMillis >= trimEnd) {
        await videoRef.current.setPositionAsync(trimStart);
      }
      await videoRef.current.playAsync();
    }
  }, [trimStart, trimEnd]);

  const stopEditorPlayback = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      const status = await videoRef.current.getStatusAsync();
      if (!status.isLoaded) return;

      await videoRef.current.pauseAsync().catch(() => {});
      await videoRef.current.setStatusAsync({
        shouldPlay: false,
        isMuted: true,
        positionMillis: trimStart,
      }).catch(() => {});
      await videoRef.current.unloadAsync().catch(() => {});
    } catch {
      // no-op
    }

    setIsPlaying(false);
  }, [trimStart]);

  useEffect(() => {
    return () => {
      void stopEditorPlayback();
    };
  }, [stopEditorPlayback]);

  const updateTrimFromPosition = useCallback((position: number, isLeft: boolean) => {
    const newTime = Math.round((position / TIMELINE_WIDTH) * duration);
    
    if (isLeft) {
      const maxStart = trimEnd - MIN_TRIM_DURATION;
      const minStart = trimEnd - MAX_TRIM_DURATION;
      const clampedTime = Math.max(Math.max(0, minStart), Math.min(newTime, maxStart));
      setTrimStart(clampedTime);
      leftTrimPosition.value = (clampedTime / duration) * TIMELINE_WIDTH;
      videoRef.current?.setPositionAsync(clampedTime).catch(() => {});
    } else {
      const minEnd = trimStart + MIN_TRIM_DURATION;
      const maxEnd = Math.min(duration, trimStart + MAX_TRIM_DURATION);
      const clampedTime = Math.max(minEnd, Math.min(newTime, maxEnd));
      setTrimEnd(clampedTime);
      rightTrimPosition.value = (clampedTime / duration) * TIMELINE_WIDTH;
      videoRef.current?.setPositionAsync(clampedTime).catch(() => {});
    }
  }, [duration, trimStart, trimEnd]);

  const leftPanGesture = Gesture.Pan()
    .onUpdate((event) => {
      const newPosition = Math.max(0, Math.min(event.absoluteX - TIMELINE_PADDING, rightTrimPosition.value - 20));
      leftTrimPosition.value = newPosition;
      runOnJS(updateTrimFromPosition)(newPosition, true);
    })
    .onEnd(() => {
      runOnJS(triggerHaptic)("light");
    });

  const rightPanGesture = Gesture.Pan()
    .onUpdate((event) => {
      const newPosition = Math.max(leftTrimPosition.value + 20, Math.min(event.absoluteX - TIMELINE_PADDING, TIMELINE_WIDTH));
      rightTrimPosition.value = newPosition;
      runOnJS(updateTrimFromPosition)(newPosition, false);
    })
    .onEnd(() => {
      runOnJS(triggerHaptic)("light");
    });

  const leftHandleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftTrimPosition.value }],
  }));

  const rightHandleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightTrimPosition.value - 20 }],
  }));

  const selectedRegionStyle = useAnimatedStyle(() => ({
    left: leftTrimPosition.value,
    width: rightTrimPosition.value - leftTrimPosition.value,
  }));

  const playheadStyle = useAnimatedStyle(() => {
    if (duration === 0) return { transform: [{ translateX: 0 }] };
    const position = (currentPosition / duration) * TIMELINE_WIDTH;
    return { transform: [{ translateX: position }] };
  });

  const handleClose = useCallback(async () => {
    triggerHaptic("selection");
    await stopEditorPlayback();
    router.back();
  }, [stopEditorPlayback]);

  const handleNext = useCallback(async () => {
    if (!videoUri) return;
    
    triggerHaptic("medium");
    await stopEditorPlayback();
    
    let processedUri = videoUri;
    
    // Always process selected videos so Android/iOS uploads are compressed for
    // faster Cloudflare processing. The helper trims only when needed.
    const needsTrim = trimStart > 100 || (duration > 0 && trimEnd < duration - 100);
    
    setIsProcessing(true);
    try {
      console.log("[VideoEditor] Processing video:", {
        trimStart,
        trimEnd,
        duration,
        needsTrim,
      });
      
      const result = await processVideo(videoUri, {
        trimStartMs: trimStart,
        trimEndMs: trimEnd,
        totalDurationMs: duration,
      });
      processedUri = result.uri;
    } catch (error) {
      Sentry.captureException(error, { tags: { feature: "video-editor", operation: "process" } });
    } finally {
      setIsProcessing(false);
    }
    
    if (params.returnTo) {
      setPendingVideoResult({
        videoUri: processedUri,
        originalVideoUri: videoUri,
        videoWidth: resolvedVideoSize.width,
        videoHeight: resolvedVideoSize.height,
        trimStart,
        trimEnd,
        replacingUri: params.replacingUri ?? "",
      });
      router.back();
    } else {
      router.replace({
        pathname: "/(tabs)/create",
        params: {
          videoUri: processedUri,
          originalVideoUri: videoUri,
          videoWidth: resolvedVideoSize.width.toString(),
          videoHeight: resolvedVideoSize.height.toString(),
          trimStart: trimStart.toString(),
          trimEnd: trimEnd.toString(),
          replacingUri: params.replacingUri ?? "",
        },
      });
    }
  }, [videoUri, resolvedVideoSize.height, resolvedVideoSize.width, trimStart, trimEnd, params.returnTo, params.replacingUri, stopEditorPlayback]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const trimDuration = trimEnd - trimStart;

  if (!videoUri) {
    return (
      <Box flex background="base" style={{ paddingTop: insets.top }}>
        <Text>No video selected</Text>
      </Box>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Box flex background="base" style={{ paddingTop: Platform.OS === 'ios' ? 0 : insets.top }}>
        {/* Header */}
        <View style={styles.header}>
          <Button
            variant="ghost"
            size="auto"
            onPress={handleClose}
            style={styles.headerButton}
          >
            <Button.Icon>
              <Feather name="x" size={24} color={theme.colors.text.default} />
            </Button.Icon>
          </Button>

          <Text size="lg" weight="semibold">Edit Video</Text>

          <Button
            variant="ghost"
            size="auto"
            onPress={handleNext}
            disabled={isProcessing}
            style={styles.headerButton}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={theme.colors.brand[500]} />
            ) : (
              <Text size="md" weight="semibold" style={{ color: theme.colors.brand[500] }}>
                Next
              </Text>
            )}
          </Button>
        </View>

        <View style={[styles.headerDivider, { backgroundColor: theme.colors.border.default }]} />

        {/* Video Preview */}
        <View style={[styles.videoContainer, { backgroundColor: theme.colors.background.base }]}>
          <Pressable onPress={handlePlayPause} style={styles.videoWrapper}>
            <Video
              ref={videoRef}
              source={{ uri: videoUri }}
              style={[styles.video, { height: videoDisplayHeight }]}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isLooping={false}
              onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
              onReadyForDisplay={(event) => {
                const { width, height } = event.naturalSize ?? {};
                if (!width || !height) return;
                if (width === resolvedVideoSize.width && height === resolvedVideoSize.height) return;
                setResolvedVideoSize({ width, height });
              }}
            />
            
            {/* Play/Pause overlay */}
            <View style={styles.playOverlay}>
              <View style={styles.playButton}>
                <Feather
                  name={isPlaying ? "pause" : "play"}
                  size={32}
                  color="#fff"
                />
              </View>
            </View>
          </Pressable>
        </View>

        {/* Controls */}
        <View style={styles.controlsContainer}>
          {/* Duration info */}
          <View style={styles.durationInfo}>
            <Text size="sm" mode="subtle">
              Selected: {formatTime(trimDuration)} / {formatTime(duration)}
            </Text>
          {trimDuration > MAX_TRIM_DURATION && (
            <Text size="xs" style={{ color: theme.colors.error[500], marginTop: 2 }}>
              Video exceeds 59 second limit
            </Text>
          )}
          </View>

          {/* Timeline */}
          <View style={styles.timelineContainer}>
            <View style={styles.timeline}>
              {/* Background track */}
              <View style={[styles.timelineTrack, { backgroundColor: theme.colors.background.subtle }]} />
              
              {/* Selected region */}
              <Animated.View
                style={[
                  styles.selectedRegion,
                  { backgroundColor: theme.colors.brand[500] + "40" },
                  selectedRegionStyle,
                ]}
              />
              
              {/* Playhead */}
              <Animated.View style={[styles.playhead, playheadStyle]}>
                <View style={[styles.playheadLine, { backgroundColor: theme.colors.brand[500] }]} />
              </Animated.View>
              
              {/* Left trim handle */}
              <GestureDetector gesture={leftPanGesture}>
                <Animated.View style={[styles.trimHandle, styles.leftHandle, leftHandleStyle]}>
                  <View style={[styles.handleBar, { backgroundColor: theme.colors.brand[500] }]}>
                    <View style={styles.handleGrip} />
                  </View>
                </Animated.View>
              </GestureDetector>
              
              {/* Right trim handle */}
              <GestureDetector gesture={rightPanGesture}>
                <Animated.View style={[styles.trimHandle, styles.rightHandle, rightHandleStyle]}>
                  <View style={[styles.handleBar, { backgroundColor: theme.colors.brand[500] }]}>
                    <View style={styles.handleGrip} />
                  </View>
                </Animated.View>
              </GestureDetector>
            </View>
            
            {/* Time labels */}
            <View style={styles.timeLabels}>
              <Text size="xs" mode="subtle">{formatTime(trimStart)}</Text>
              <Text size="xs" mode="subtle">{formatTime(trimEnd)}</Text>
            </View>
          </View>

          {/* Instructions */}
          <Text size="sm" mode="subtle" style={styles.instructions}>
            Maximum duration: 59 seconds
          </Text>
        </View>

      </Box>

      {/* Processing overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <BlurView
            intensity={50}
            tint={isDark ? "dark" : "light"}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View
            style={[
              styles.processingContent,
              {
                backgroundColor: isDark
                  ? "rgba(25, 25, 25, 0.98)"
                  : "rgba(255, 255, 255, 0.98)",
              },
            ]}
          >
            <ActivityIndicator size="large" color={isDark ? "#fff" : theme.colors.brand[500]} />
            <Text size="lg" weight="bold" style={styles.processingTitle}>
              Processing Video
            </Text>
            <Text size="sm" style={styles.processingText}>
              This may take a moment...
            </Text>
          </View>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  videoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  videoWrapper: {
    width: "100%",
    position: "relative",
  },
  video: {
    width: "100%",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlsContainer: {
    paddingHorizontal: TIMELINE_PADDING,
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.colors.background.default,
  },
  muteButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    marginBottom: theme.spacing.md,
  },
  durationInfo: {
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  timelineContainer: {
    marginBottom: theme.spacing.sm,
  },
  timeline: {
    height: 44,
    position: "relative",
    justifyContent: "center",
  },
  timelineTrack: {
    height: 4,
    borderRadius: 2,
    width: "100%",
  },
  selectedRegion: {
    position: "absolute",
    height: 44,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.brand[500],
  },
  playhead: {
    position: "absolute",
    height: 52,
    width: 2,
    top: -4,
  },
  playheadLine: {
    width: 2,
    height: "100%",
    borderRadius: 1,
  },
  trimHandle: {
    position: "absolute",
    height: 44,
    width: 20,
    justifyContent: "center",
  },
  leftHandle: {
    left: 0,
  },
  rightHandle: {
    left: 0,
  },
  handleBar: {
    width: 20,
    height: "100%",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  handleGrip: {
    width: 4,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 2,
  },
  timeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing.xs,
  },
  instructions: {
    textAlign: "center",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  processingContent: {
    width: "100%",
    maxWidth: 340,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 16,
  },
  processingTitle: {
    textAlign: "center" as const,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  processingText: {
    textAlign: "center" as const,
    paddingHorizontal: theme.spacing.md,
  },
}));
