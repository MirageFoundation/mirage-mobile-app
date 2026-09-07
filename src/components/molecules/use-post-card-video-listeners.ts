import * as Sentry from "@sentry/react-native";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { MEDIA_LOADED_CACHE } from "./post-card-media-constants";
import {
  getAppliedVideoSourceUri,
  getVideoSourceUri,
} from "@/src/hooks/use-video-player-controller";
import { isVideoPlayerControlledElsewhere } from "@/src/utils/video-player-handoff";
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
  updateMediaAspectRatioFromSize,
}: {
  playback: PostCardVideoPlayback;
  resolvedMediaUri: string;
  isPostDetail: boolean;
  updateMediaAspectRatioFromSize: (width?: number, height?: number) => void;
}) {
  const {
    videoPlayer,
    adoptedLease,
    shouldPlayNativeVideo,
    shouldPrepareNativeVideo,
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
    let cancelled = false;
    const acceptsEvent = (sourceUri = getAppliedVideoSourceUri(videoPlayer)) => !cancelled && shouldPrepareNativeVideo &&
      resolvedMediaUriForCacheRef.current === resolvedMediaUri &&
      sourceUri === resolvedMediaUri &&
      !isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease);
    const applySourceMetadata = (
      availableVideoTracks: typeof videoPlayer.availableVideoTracks,
      sourceUri?: string | null,
    ) => {
      if (!resolvedMediaUri || !acceptsEvent(sourceUri)) return;
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
    const registerListeners = () => {
    const timeSubscription = videoPlayer.addListener("timeUpdate", ({ currentTime }) => {
      if (!acceptsEvent()) return;
      currentVideoPositionRef.current = currentTime;
    });
    const playingSubscription = videoPlayer.addListener(
      "playingChange",
      ({ isPlaying }) => {
        if (!acceptsEvent()) return;
        if (!isPlaying) {
          if (
            shouldPlayNativeVideo &&
            // While locked/backgrounded the OS pauses the player and silently
            // rejects play(); retrying here wedges playback in a paused state
            // that persists after unlock. The AppState foreground recovery in
            // use-post-card-video-playback resumes instead (BUG-009).
            AppState.currentState === "active" &&
            videoPlayer.status === "readyToPlay" &&
            // A newer lease holder (fullscreen) may have paused on purpose.
            !isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)
          ) {
            videoPlayer.play();
          }
          return;
        }
        setIsVideoLoading(false);
        userInitiatedPlayRef.current = false;
      },
    );
    // The player instance is stable while sources are swapped in and out
    // (list recycling), so status/track reads and late events can belong to
    // the previous source. Only apply metadata that matches this card's uri.
    const sourceSubscription = videoPlayer.addListener(
      "sourceLoad",
      ({ availableVideoTracks, videoSource }) => {
        if (!acceptsEvent(getVideoSourceUri(videoSource))) return;
        applySourceMetadata(availableVideoTracks, getVideoSourceUri(videoSource));
        if (shouldPlayNativeVideo && !isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) {
          videoPlayer.play();
        }
      },
    );
    const statusSubscription = videoPlayer.addListener(
      "statusChange",
      ({ status }) => {
        if (!acceptsEvent()) return;
        if (status === "readyToPlay") {
          if (getAppliedVideoSourceUri(videoPlayer) !== resolvedMediaUri) return;
          applySourceMetadata(videoPlayer.availableVideoTracks);
          if (shouldPlayNativeVideo && !isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease)) {
            videoPlayer.play();
          }
          return;
        }
        if (status !== "loading") return;
        const uri = resolvedMediaUriForCacheRef.current;
        if (!uri || !MEDIA_LOADED_CACHE.has(uri)) {
          setIsVideoLoading(true);
        }
      },
    );
    return [
      timeSubscription,
      playingSubscription,
      sourceSubscription,
      statusSubscription,
    ];
    };

    // The player is a native shared object that an adopted lease (or list
    // recycling) can release underneath this effect; addListener on a
    // released player throws (Sentry: videoPlayer.addListener crash family).
    let subscriptions: { remove: () => void }[];
    try {
      subscriptions = registerListeners();
    } catch (error) {
      Sentry.addBreadcrumb({
        category: "video-player",
        message: "Skipped listeners on released video player",
        level: "warning",
        data: { error: error instanceof Error ? error.message : String(error) },
      });
      return;
    }

    try {
      if (
        videoPlayer.status === "readyToPlay" &&
        getAppliedVideoSourceUri(videoPlayer) === resolvedMediaUri
      ) {
        applySourceMetadata(videoPlayer.availableVideoTracks);
      }
    } catch {
      // Native player was released underneath us (shared-object teardown
      // race); the mount gates will recreate it.
    }

    return () => {
      cancelled = true;
      try {
        subscriptions.forEach((subscription) => subscription.remove());
      } catch {
        // Listener removal on an already-released native player is a no-op.
      }
    };
  }, [
    getPosition,
    resolvedMediaUri,
    shouldPlayNativeVideo,
    shouldPrepareNativeVideo,
    updateMediaAspectRatioFromSize,
    videoPlayer,
    adoptedLease,
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
