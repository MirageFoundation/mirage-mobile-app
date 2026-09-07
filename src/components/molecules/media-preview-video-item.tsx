import { Ionicons } from "@expo/vector-icons";
import { VideoView } from "expo-video";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import type { ResolvedMedia } from "./post-card-utils";
import { useVideoPlayerController } from "@/src/hooks/use-video-player-controller";
import {
  buildVideoPositionKey,
  useVideoMuteStore,
  useVideoPositionStore,
} from "@/src/stores";
import { canonicalVideoAssetId } from "@/src/utils/video-asset-id";
import {
  adoptHandoffPlayer,
  releaseHandoffPlayer,
  type VideoPlayerLease,
} from "@/src/utils/video-player-handoff";
import { previewItemStyles } from "./media-preview-item-styles";
import { getVideoSourceUri, isVideoPlayerControlledElsewhere, getVideoPlaybackIntent, setVideoPlaybackIntent } from "@/src/utils/video-player-handoff";
import { useVideoSourceRecovery } from "./use-video-source-recovery";
import { VideoUnavailableOverlay } from "./video-unavailable-overlay";
import { FullscreenVideoControls } from "./fullscreen-video-controls";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useMediaDismissGesture } from "./use-media-dismiss-gesture";

type PreviewVideoItemProps = {
  item: ResolvedMedia;
  width: number;
  height: number;
  isActive: boolean;
  shouldPrepare: boolean;
  videoSyncScope?: string;
  nativeControls?: boolean;
  playbackControls?: boolean;
  allowAutoplay?: boolean;
  onDismiss?: () => void;
  postId?: string;
};

/**
 * Fullscreen native-video page inside the media-preview gallery. Owns its
 * player, tap-to-toggle playback, mute, and saved-position sync.
 */
export const PreviewVideoItem = memo(function PreviewVideoItem({
  item,
  width,
  height,
  isActive,
  shouldPrepare,
  videoSyncScope,
  nativeControls = false,
  playbackControls = false,
  allowAutoplay = true,
  onDismiss,
  postId,
}: PreviewVideoItemProps) {
  const [playing, setPlaying] = useState(allowAutoplay);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const dismiss = useMediaDismissGesture(onDismiss);
  const videoHeight = Math.max(1, height - (playbackControls ? 64 : 0));
  const muted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const getPosition = useVideoPositionStore((s) => s.getPosition);
  const setPositionStore = useVideoPositionStore((s) => s.setPosition);
  const positionKey = buildVideoPositionKey(item.uri, videoSyncScope);
  const currentPositionRef = useRef(0);
  const hasRestoredRef = useRef(false);
  // Adopt the underlying screen's already-buffered player for this video
  // (feed or detail card stays mounted beneath the fullscreen modal), so
  // fullscreen opens continue instantly instead of re-streaming. The
  // adopted player is already at the live position, so the saved-position
  // restore must be skipped.
  const handoffKey = item.uri.startsWith("file://")
    ? null
    : `${postId ? `${postId}:` : ""}${canonicalVideoAssetId(item.uri)}`;
  const [adoptedLease, setAdoptedLease] = useState<VideoPlayerLease | null>(null);
  const adoptedPlayer = adoptedLease?.player ?? null;
  // The route borrows only its active gallery item. Legacy modal callers
  // retain their lease until unmount because their underlying screen is focused.
  const adoptedLeaseRef = useRef<VideoPlayerLease | null>(null);
  useLayoutEffect(() => {
    if (postId && !shouldPrepare && adoptedLeaseRef.current) {
      releaseHandoffPlayer(adoptedLeaseRef.current);
      adoptedLeaseRef.current = null;
      setAdoptedLease(null);
    }
    if (!handoffKey || !shouldPrepare || adoptedLeaseRef.current) return;
    const lease = adoptHandoffPlayer(handoffKey, item.uri);
    if (!lease) return;
    adoptedLeaseRef.current = lease;
    hasRestoredRef.current = true;
    currentPositionRef.current = lease.player.currentTime;
    setPosition(lease.player.currentTime);
    setPlaying(getVideoPlaybackIntent(lease.player));
    setAdoptedLease(lease);
  }, [handoffKey, item.uri, shouldPrepare, postId]);
  useEffect(() => {
    return () => {
      if (adoptedLeaseRef.current) {
        releaseHandoffPlayer(adoptedLeaseRef.current);
        adoptedLeaseRef.current = null;
      }
      setAdoptedLease(null);
    };
  }, [item.uri]);
  const controllerPlayer = useVideoPlayerController(
    shouldPrepare && !adoptedLease ? item.uri : null,
    {
      loop: true,
      muted,
      shouldPlay: playing && isActive && !adoptedLease,
      timeUpdateInterval: 0.1,
    },
  );
  const player = adoptedPlayer ?? controllerPlayer;
  const recovery = useVideoSourceRecovery({ uri: item.uri, player, lease: adoptedLease, enabled: shouldPrepare, shouldPlay: playing && isActive });
  const isLoading = playing && isActive && (recovery.phase === "loading" || recovery.phase === "recovering");
  const { acceptsEvent } = recovery;

  // An adopted player bypasses the controller's option effects; as the top
  // lease holder this surface applies its settings directly.
  useEffect(() => {
    if (!adoptedPlayer || isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      adoptedPlayer.loop = true;
      adoptedPlayer.timeUpdateEventInterval = 0.1;
    } catch {
      // Native player was released underneath us.
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease]);
  useEffect(() => {
    if (!adoptedPlayer || isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      adoptedPlayer.muted = muted;
    } catch {
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, muted]);
  useEffect(() => {
    if (!adoptedPlayer || isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      if (playing && isActive) {
        adoptedPlayer.play();
      } else {
        adoptedPlayer.pause();
      }
    } catch {
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, playing, isActive]);

  useEffect(() => {
    if (!isActive) {
      if (item.uri && currentPositionRef.current > 0.5) {
        setPositionStore(positionKey, currentPositionRef.current);
      }
    }
  }, [isActive, item.uri, positionKey, setPositionStore]);

  useEffect(() => {
    return () => {
      if (item.uri && currentPositionRef.current > 0.5) {
        useVideoPositionStore.getState().setPosition(positionKey, currentPositionRef.current);
      }
    };
  }, [item.uri, positionKey]);

  useEffect(() => {
    if (!shouldPrepare) return;
    const restorePosition = (sourceUri?: string | null) => {
      if (!acceptsEvent(sourceUri)) return;
      setDuration(Number.isFinite(player.duration) ? player.duration : 0);
      if (hasRestoredRef.current || !item.uri) return;
      const saved = getPosition(positionKey);
      if (saved > 0.5) {
        hasRestoredRef.current = true;
        player.currentTime = saved;
      }
    };
    const timeSubscription = player.addListener("timeUpdate", ({ currentTime }) => {
      if (!acceptsEvent()) return;
      currentPositionRef.current = currentTime;
      setPosition(currentTime);
      setDuration(Number.isFinite(player.duration) ? player.duration : 0);
    });
    const statusSubscription = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") {
        restorePosition();
      }
    });
    const playingSubscription = player.addListener("playingChange", ({ isPlaying }) => {
      if (acceptsEvent() && isActive && (isPlaying || (nativeControls && player.status === "readyToPlay"))) {
        setPlaying(isPlaying);
      }
    });
    const sourceSubscription = player.addListener("sourceLoad", ({ videoSource }) => {
      if (getVideoSourceUri(videoSource) !== item.uri) return;
      restorePosition(getVideoSourceUri(videoSource));
    });
    if (player.status === "readyToPlay") {
      restorePosition();
    }

    return () => {
      timeSubscription.remove();
      statusSubscription.remove();
      playingSubscription.remove();
      sourceSubscription.remove();
    };
  }, [getPosition, isActive, item.uri, player, positionKey, shouldPrepare, acceptsEvent, nativeControls]);

  const handleTogglePlay = useCallback(() => {
    if (isVideoPlayerControlledElsewhere(player, adoptedLease)) return;
    setVideoPlaybackIntent(player, !playing);
    setPlaying(!playing);
  }, [player, adoptedLease, playing]);

  const handleToggleMute = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  return (
    <View style={{ width, height, justifyContent: "center", alignItems: "center" }}>
      <GestureDetector gesture={dismiss.gesture}>
      <Animated.View style={dismiss.style}>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause video" : "Play video"} onPress={nativeControls ? undefined : handleTogglePlay} style={{ width, height: videoHeight }}>
        {shouldPrepare ? (
          <VideoView
            key={`${item.uri}:${recovery.revision}`}
            player={player}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            nativeControls={nativeControls}
            fullscreenOptions={{ enable: false }}
            allowsPictureInPicture={false}
            surfaceType={Platform.OS === "android" ? "textureView" : undefined}
            onFirstFrameRender={recovery.firstFrame}
          />
        ) : null}
        {isLoading && (
          <View pointerEvents="none" style={previewItemStyles.playOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        {!nativeControls && !playing && !isLoading && (
          <View style={previewItemStyles.playOverlay}>
            <View style={previewItemStyles.playButton}>
              <Ionicons name="play" size={40} color="#fff" />
            </View>
          </View>
        )}
      </Pressable>
      </Animated.View>
      </GestureDetector>
      {playbackControls ? <FullscreenVideoControls playing={playing} muted={muted} position={position} duration={duration} onPlayPause={handleTogglePlay} onMute={handleToggleMute} onSeek={(time) => {
        if (!acceptsEvent()) return;
        player.currentTime = time;
        setPosition(time);
      }} /> : <Pressable
        accessibilityRole="button"
        accessibilityLabel={muted ? "Unmute video" : "Mute video"}
        onPress={handleToggleMute}
        style={previewItemStyles.muteButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={previewItemStyles.muteButtonInner}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
        </View>
      </Pressable>}
      <VideoUnavailableOverlay visible={recovery.phase === "terminal"} onRetry={recovery.retry} />
    </View>
  );
});
