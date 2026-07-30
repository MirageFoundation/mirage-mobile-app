import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import YoutubePlayer, { type YoutubeIframeRef } from "react-native-youtube-iframe";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { extractYouTubeVideoId, type ResolvedMedia } from "./post-card-utils";
import { Text } from "@/src/components/ui/primitives";
import {
  buildVideoPositionKey,
  useVideoMuteStore,
  useVideoPositionStore,
} from "@/src/stores";
import {
  YouTubeAutoplayEmbed,
  type YouTubeAutoplayEmbedRef,
} from "./youtube-autoplay-embed";
import { previewItemStyles } from "./media-preview-item-styles";

type PreviewYouTubeItemProps = {
  item: ResolvedMedia;
  width: number;
  height: number;
  isActive: boolean;
  videoSyncScope?: string;
};

/**
 * Fullscreen YouTube page inside the media preview: platform-specific embed
 * (Android autoplay embed with custom controls vs iOS iframe), transient
 * center controls, position save/restore, and "Watch on YouTube".
 */
export const PreviewYouTubeItem = memo(function PreviewYouTubeItem({
  item,
  width,
  height,
  isActive,
  videoSyncScope,
}: PreviewYouTubeItemProps) {
  const embedRef = useRef<YouTubeAutoplayEmbedRef | null>(null);
  const iframeRef = useRef<YoutubeIframeRef | null>(null);
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState(true);
  const [, setIsLoading] = useState(true);
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
        <View style={previewItemStyles.centerControlsOverlay} pointerEvents="box-none">
          <View style={previewItemStyles.centerControlsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rewind 10 seconds"
              onPress={() => { handleSeekBy(-10); showControlsTemporarily(); }}
              style={previewItemStyles.youtubeControlButton}
              hitSlop={8}
            >
              <Ionicons name="play-back" size={22} color="#fff" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? "Pause video" : "Play video"}
              onPress={() => { handleTogglePlay(); showControlsTemporarily(); }}
              style={previewItemStyles.centerPlayButton}
            >
              <Ionicons name={playing ? "pause" : "play"} size={36} color="#fff" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fast-forward 10 seconds"
              onPress={() => { handleSeekBy(10); showControlsTemporarily(); }}
              style={previewItemStyles.youtubeControlButton}
              hitSlop={8}
            >
              <Ionicons name="play-forward" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
      {isAndroid && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={muted ? "Unmute video" : "Mute video"}
          onPress={handleToggleMute}
          style={[previewItemStyles.muteButton, { bottom: insets.bottom + 10, right: 16 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={previewItemStyles.muteButtonInner}>
            <Ionicons name={muted ? "volume-mute" : "volume-high"} size={22} color="#fff" />
          </View>
        </Pressable>
      )}
      {isAndroid && (
        <Pressable
          onPress={() => {
            if (item.uri) Linking.openURL(item.uri);
          }}
          style={[previewItemStyles.watchOnYouTubeButton, { bottom: insets.bottom + 10, left: 16 }]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <View style={previewItemStyles.watchOnYouTubeInner}>
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
