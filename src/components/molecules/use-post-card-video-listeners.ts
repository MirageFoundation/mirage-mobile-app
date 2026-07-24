import * as Sentry from "@sentry/react-native";
import { useEffect, useRef } from "react";
import { MEDIA_LOADED_CACHE } from "./post-card-media-constants";
import {
  getAppliedVideoSourceUri,
  getVideoSourceUri,
} from "@/src/hooks/use-video-player-controller";
import type { PostCardVideoPlayback } from "./use-post-card-video-playback";

/**
 * Player event listeners for a post-card video: position tracking, honest
 * play state, and source metadata (aspect ratio, saved-position restore)
 * applied only once the player actually holds this card's source.
 */
export function usePostCardVideoListeners({
  playback,
  resolvedMediaUri,
  isPostDetail,
  setMediaLoaded,
  updateMediaAspectRatioFromSize,
}: {
  playback: PostCardVideoPlayback;
  resolvedMediaUri: string;
  isPostDetail: boolean;
  setMediaLoaded: (loaded: boolean) => void;
  updateMediaAspectRatioFromSize: (width?: number, height?: number) => void;
}) {
  const {
    videoPlayer,
    shouldPlayNativeVideo,
    videoPositionKey,
    getPosition,
    currentVideoPositionRef,
    hasRestoredVideoPositionRef,
    userInitiatedPlayRef,
    setIsVideoLoading,
  } = playback;

  const resolvedMediaUriForCacheRef = useRef(resolvedMediaUri);
  resolvedMediaUriForCacheRef.current = resolvedMediaUri;

  useEffect(() => {
    const applySourceMetadata = (
      availableVideoTracks: typeof videoPlayer.availableVideoTracks,
    ) => {
      if (!resolvedMediaUri) return;
      setMediaLoaded(true);
      MEDIA_LOADED_CACHE.add(resolvedMediaUri);
      const size = availableVideoTracks[0]?.size;
      updateMediaAspectRatioFromSize(size?.width, size?.height);

      if (!hasRestoredVideoPositionRef.current && videoPositionKey) {
        const saved = getPosition(videoPositionKey);
        if (saved > 0.5) {
          hasRestoredVideoPositionRef.current = true;
          currentVideoPositionRef.current = saved;
          videoPlayer.currentTime = saved;
        }
      }
    };
    const timeSubscription = videoPlayer.addListener("timeUpdate", ({ currentTime }) => {
      currentVideoPositionRef.current = currentTime;
    });
    const playingSubscription = videoPlayer.addListener(
      "playingChange",
      ({ isPlaying }) => {
        if (!isPlaying) {
          if (shouldPlayNativeVideo && videoPlayer.status === "readyToPlay") {
            videoPlayer.play();
          }
          return;
        }
        setIsVideoLoading(false);
        setMediaLoaded(true);
        if (resolvedMediaUriForCacheRef.current) {
          MEDIA_LOADED_CACHE.add(resolvedMediaUriForCacheRef.current);
        }
        userInitiatedPlayRef.current = false;
      },
    );
    // The player instance is stable while sources are swapped in and out
    // (list recycling), so status/track reads and late events can belong to
    // the previous source. Only apply metadata that matches this card's uri.
    const sourceSubscription = videoPlayer.addListener(
      "sourceLoad",
      ({ availableVideoTracks, videoSource }) => {
        if (getVideoSourceUri(videoSource) !== resolvedMediaUri) return;
        applySourceMetadata(availableVideoTracks);
        if (shouldPlayNativeVideo) videoPlayer.play();
      },
    );
    const statusSubscription = videoPlayer.addListener(
      "statusChange",
      ({ status }) => {
        if (status === "readyToPlay") {
          if (getAppliedVideoSourceUri(videoPlayer) !== resolvedMediaUri) return;
          applySourceMetadata(videoPlayer.availableVideoTracks);
          if (shouldPlayNativeVideo) videoPlayer.play();
          return;
        }
        if (status !== "loading") return;
        const uri = resolvedMediaUriForCacheRef.current;
        if (!uri || !MEDIA_LOADED_CACHE.has(uri)) {
          setIsVideoLoading(true);
        }
      },
    );
    if (
      videoPlayer.status === "readyToPlay" &&
      getAppliedVideoSourceUri(videoPlayer) === resolvedMediaUri
    ) {
      applySourceMetadata(videoPlayer.availableVideoTracks);
    }

    return () => {
      timeSubscription.remove();
      playingSubscription.remove();
      sourceSubscription.remove();
      statusSubscription.remove();
    };
  }, [
    getPosition,
    resolvedMediaUri,
    shouldPlayNativeVideo,
    setMediaLoaded,
    updateMediaAspectRatioFromSize,
    videoPlayer,
    videoPositionKey,
    currentVideoPositionRef,
    hasRestoredVideoPositionRef,
    userInitiatedPlayRef,
    setIsVideoLoading,
  ]);

  // Mount-time diagnostics breadcrumb for feed cards.
  const reportedFeedVideoMountRef = useRef(false);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  useEffect(() => {
    if (reportedFeedVideoMountRef.current || isPostDetail) return;
    reportedFeedVideoMountRef.current = true;
    const current = playbackRef.current;
    Sentry.addBreadcrumb({
      category: "feed-video",
      message: "Feed video card mounted",
      level: "info",
      data: {
        isVisible: current.isVisible,
        isFocused: current.isFocused,
        shouldPlayNativeVideo: current.shouldPlayNativeVideo,
        shouldMountNativeVideo: current.shouldMountNativeVideo,
      },
    });
  }, [isPostDetail]);
}
