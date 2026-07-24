import { Ionicons } from "@expo/vector-icons";
import { VideoView } from "expo-video";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import type { ResolvedMedia } from "./post-card-utils";
import { useVideoPlayerController } from "@/src/hooks/use-video-player-controller";
import {
  buildVideoPositionKey,
  useVideoMuteStore,
  useVideoPositionStore,
} from "@/src/stores";
import { previewItemStyles } from "./media-preview-item-styles";

type PreviewVideoItemProps = {
  item: ResolvedMedia;
  width: number;
  height: number;
  isActive: boolean;
  shouldPrepare: boolean;
  videoSyncScope?: string;
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
}: PreviewVideoItemProps) {
  const [playing, setPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const muted = useVideoMuteStore((s) => s.isMuted);
  const toggleMute = useVideoMuteStore((s) => s.toggleMute);
  const getPosition = useVideoPositionStore((s) => s.getPosition);
  const setPositionStore = useVideoPositionStore((s) => s.setPosition);
  const positionKey = buildVideoPositionKey(item.uri, videoSyncScope);
  const currentPositionRef = useRef(0);
  const hasRestoredRef = useRef(false);
  const player = useVideoPlayerController(shouldPrepare ? item.uri : null, {
    loop: true,
    muted,
    shouldPlay: playing && isActive,
    timeUpdateInterval: 0.1,
  });

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
    if (player.status !== "readyToPlay") setIsLoading(true);
    const restorePosition = () => {
      if (hasRestoredRef.current || !item.uri) return;
      const saved = getPosition(positionKey);
      if (saved > 0.5) {
        hasRestoredRef.current = true;
        player.currentTime = saved;
      }
    };
    const timeSubscription = player.addListener("timeUpdate", ({ currentTime }) => {
      currentPositionRef.current = currentTime;
    });
    const statusSubscription = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") {
        setIsLoading(false);
        restorePosition();
      }
    });
    const playingSubscription = player.addListener("playingChange", ({ isPlaying }) => {
      if (isActive && isPlaying) {
        setPlaying(true);
      }
    });
    const sourceSubscription = player.addListener("sourceLoad", () => {
      setIsLoading(false);
      restorePosition();
    });
    if (player.status === "readyToPlay") {
      setIsLoading(false);
      restorePosition();
    }

    return () => {
      timeSubscription.remove();
      statusSubscription.remove();
      playingSubscription.remove();
      sourceSubscription.remove();
    };
  }, [getPosition, isActive, item.uri, player, positionKey, shouldPrepare]);

  const handleTogglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  const handleToggleMute = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  return (
    <View style={{ width, height, justifyContent: "center", alignItems: "center" }}>
      <Pressable onPress={handleTogglePlay} style={{ width, height }}>
        {shouldPrepare ? (
          <VideoView
            player={player}
            style={{ width: "100%", height: "100%" }}
            contentFit="contain"
            nativeControls={false}
            fullscreenOptions={{ enable: false }}
            allowsPictureInPicture={false}
            surfaceType={Platform.OS === "android" ? "textureView" : undefined}
            onFirstFrameRender={() => setIsLoading(false)}
          />
        ) : null}
        {isLoading && (
          <View style={previewItemStyles.playOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        {!playing && !isLoading && (
          <View style={previewItemStyles.playOverlay}>
            <View style={previewItemStyles.playButton}>
              <Ionicons name="play" size={40} color="#fff" />
            </View>
          </View>
        )}
      </Pressable>
      <Pressable
        onPress={handleToggleMute}
        style={previewItemStyles.muteButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={previewItemStyles.muteButtonInner}>
          <Ionicons name={muted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
        </View>
      </Pressable>
    </View>
  );
});
