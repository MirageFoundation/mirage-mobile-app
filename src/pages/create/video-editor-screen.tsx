import { Feather } from "@expo/vector-icons";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { removeAudioFromVideo } from "@/src/utils/video-processing";

const SCREEN_WIDTH = Dimensions.get("window").width;
const TIMELINE_PADDING = 24;
const TIMELINE_WIDTH = SCREEN_WIDTH - TIMELINE_PADDING * 2;
const MIN_TRIM_DURATION = 1000; // 1 second minimum

export function VideoEditorScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ uri: string; width?: string; height?: string }>();
  
  const videoUri = params.uri;
  const videoWidth = params.width ? parseInt(params.width) : 1920;
  const videoHeight = params.height ? parseInt(params.height) : 1080;
  
  const videoRef = useRef<Video>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Trim state (in milliseconds)
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  
  // Shared values for trim handles
  const leftTrimPosition = useSharedValue(0);
  const rightTrimPosition = useSharedValue(TIMELINE_WIDTH);
  
  const aspectRatio = videoWidth / videoHeight;
  const videoDisplayHeight = Math.min(SCREEN_WIDTH / aspectRatio, 400);

  useEffect(() => {
    if (duration > 0 && trimEnd === 0) {
      setTrimEnd(duration);
      rightTrimPosition.value = TIMELINE_WIDTH;
    }
  }, [duration, trimEnd]);

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    
    if (status.durationMillis && duration === 0) {
      setDuration(status.durationMillis);
      setTrimEnd(status.durationMillis);
    }
    
    setCurrentPosition(status.positionMillis);
    setIsPlaying(status.isPlaying);
    
    // Loop within trim region
    if (status.positionMillis >= trimEnd && trimEnd > 0) {
      videoRef.current?.setPositionAsync(trimStart);
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

  const handleMuteToggle = useCallback(() => {
    triggerHaptic("light");
    setIsMuted(prev => !prev);
  }, []);

  const updateTrimFromPosition = useCallback((position: number, isLeft: boolean) => {
    const newTime = Math.round((position / TIMELINE_WIDTH) * duration);
    
    if (isLeft) {
      const maxStart = trimEnd - MIN_TRIM_DURATION;
      const clampedTime = Math.max(0, Math.min(newTime, maxStart));
      setTrimStart(clampedTime);
      leftTrimPosition.value = (clampedTime / duration) * TIMELINE_WIDTH;
    } else {
      const minEnd = trimStart + MIN_TRIM_DURATION;
      const clampedTime = Math.max(minEnd, Math.min(newTime, duration));
      setTrimEnd(clampedTime);
      rightTrimPosition.value = (clampedTime / duration) * TIMELINE_WIDTH;
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

  const handleClose = useCallback(() => {
    triggerHaptic("selection");
    router.back();
  }, []);

  const handleNext = useCallback(async () => {
    if (!videoUri) return;
    
    triggerHaptic("medium");
    
    let processedUri = videoUri;
    
    // Process video if muted
    if (isMuted) {
      setIsProcessing(true);
      try {
        processedUri = await removeAudioFromVideo(videoUri);
      } catch (error) {
        console.error("[VideoEditor] Failed to remove audio:", error);
        // Continue with original video if processing fails
      }
      setIsProcessing(false);
    }
    
    // Navigate back to create screen with video data
    router.replace({
      pathname: "/(tabs)/create",
      params: {
        videoUri: processedUri,
        videoWidth: videoWidth.toString(),
        videoHeight: videoHeight.toString(),
        trimStart: trimStart.toString(),
        trimEnd: trimEnd.toString(),
        isMuted: isMuted ? "1" : "0",
      },
    });
  }, [videoUri, videoWidth, videoHeight, trimStart, trimEnd, isMuted]);

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
      <Box flex background="base" style={{ paddingTop: insets.top }}>
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

        {/* Video Preview */}
        <View style={styles.videoContainer}>
          <Pressable onPress={handlePlayPause} style={styles.videoWrapper}>
            <Video
              ref={videoRef}
              source={{ uri: videoUri }}
              style={[styles.video, { height: videoDisplayHeight }]}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isLooping={false}
              isMuted={isMuted}
              onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
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
          {/* Mute Button */}
          <Pressable
            onPress={handleMuteToggle}
            style={[
              styles.muteButton,
              { backgroundColor: isMuted ? theme.colors.warning[500] : theme.colors.background.subtle },
            ]}
          >
            <Feather
              name={isMuted ? "volume-x" : "volume-2"}
              size={20}
              color={isMuted ? "#fff" : theme.colors.text.default}
            />
            <Text
              size="sm"
              weight="medium"
              style={{ marginLeft: 8, color: isMuted ? "#fff" : theme.colors.text.default }}
            >
              {isMuted ? "Audio removed" : "Keep audio"}
            </Text>
          </Pressable>

          {/* Duration info */}
          <View style={styles.durationInfo}>
            <Text size="sm" mode="subtle">
              Selected: {formatTime(trimDuration)} / {formatTime(duration)}
            </Text>
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
                <View style={[styles.playheadLine, { backgroundColor: theme.colors.text.default }]} />
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
          <Text size="xs" mode="subtle" style={styles.instructions}>
            Drag the handles to trim your video
          </Text>
        </View>

        {/* Processing overlay */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <View style={styles.processingContent}>
              <ActivityIndicator size="large" color={theme.colors.brand[500]} />
              <Text size="md" weight="medium" style={{ marginTop: 16 }}>
                Processing video...
              </Text>
              <Text size="sm" mode="subtle" style={{ marginTop: 4 }}>
                Removing audio
              </Text>
            </View>
          </View>
        )}
      </Box>
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
  videoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
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
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  processingContent: {
    alignItems: "center",
    padding: theme.spacing.xl,
  },
}));
