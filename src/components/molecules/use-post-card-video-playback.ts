import { useVideoPlaybackIntent } from "./use-video-playback-intent";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import type { ResolvedMedia } from "./post-card-utils";
import { MEDIA_LOADED_CACHE } from "./post-card-media-constants";
import {
  buildVideoPositionKey,
  useIsFeedScrolling,
  useVideoMuteStore,
  useVideoPositionStore,
} from "@/src/stores";
import {
  applyVideoBufferProfile,
  useVideoPlayerController,
  useVideoPlayerLeaseVersion,
} from "@/src/hooks/use-video-player-controller";
import {
  adoptHandoffPlayer,
  isVideoPlayerControlledElsewhere,
  releaseHandoffPlayer,
  type VideoPlayerLease,
} from "@/src/utils/video-player-handoff";
import { canonicalVideoAssetId } from "@/src/utils/video-asset-id";
import {
  clearVideoPrepareMark,
  markVideoPrepareStart,
} from "@/src/utils/video-ttff";
import { useVideoForegroundRecovery } from "./use-video-foreground-recovery";

/**
 * Core native-video playback state for a post card: player
 * ownership (stable controller + feed->detail handoff adoption), viewability
 * driven play/pause orchestration, audio focus, saved-position restore, and
 * surface-repaint recovery. Extracted verbatim from the former monolithic
 * PostCardMedia component.
 */

let nextNativeAudioFocusId = 0;
let activeNativeAudioFocus: {
  id: string;
  onLoseFocus: () => void;
} | null = null;

export type PostCardVideoPlaybackOptions = {
  media: ResolvedMedia;
  isVisible: boolean;
  isFocused: boolean;
  isNearVisible?: boolean;
  screenActive: boolean;
  shouldBlurContent: boolean;
  allowAutoplay: boolean;
  isPostDetail: boolean;
  videoSyncScope?: string;
  postId?: string;
  shouldPrimeOptimisticVideo: boolean;
};

export function usePostCardVideoPlayback({
  media,
  isVisible: isVisibleProp,
  isFocused: isFocusedProp,
  isNearVisible,
  screenActive,
  shouldBlurContent,
  allowAutoplay,
  isPostDetail,
  videoSyncScope,
  postId,
  shouldPrimeOptimisticVideo,
}: PostCardVideoPlaybackOptions) {
  const resolvedMediaUri = media.uri;
  const isFeedScrolling = useIsFeedScrolling(
    !isPostDetail ? videoSyncScope : undefined,
  );

  // Optimistic just-created posts keep their video primed (treated as
  // visible/focused) until the user actually scrolls the feed.
  const [optimisticVideoPrimeDismissed, setOptimisticVideoPrimeDismissed] =
    useState(false);
  const primeOptimisticVideo =
    shouldPrimeOptimisticVideo && !optimisticVideoPrimeDismissed;
  const isVisible = primeOptimisticVideo || isVisibleProp;
  const isFocused = primeOptimisticVideo || isFocusedProp;

  useEffect(() => {
    if (!shouldPrimeOptimisticVideo) {
      setOptimisticVideoPrimeDismissed(false);
      return;
    }
    if (isFeedScrolling) {
      setOptimisticVideoPrimeDismissed(true);
    }
  }, [isFeedScrolling, postId, shouldPrimeOptimisticVideo]);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoReadyForDisplay, setVideoReadyForDisplay] = useState(false);
  const [showVideoPrepSpinner, setShowVideoPrepSpinner] = useState(false);
  const [retainPlayerForDetail, setRetainPlayerForDetail] = useState(false);
  const retainedPlayerWasInactiveRef = useRef(false);
  const userInitiatedPlayRef = useRef(false);
  const prevShouldBlurRef = useRef(shouldBlurContent);
  const videoPrepSpinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const nativeAudioFocusIdRef = useRef(`native-video-${++nextNativeAudioFocusId}`);
  const [hasNativeAudioFocus, setHasNativeAudioFocus] = useState(isPostDetail);
  const effectiveMuted = isPostDetail
    ? globalMuted
    : allowAutoplay
      ? (globalMuted || !isFocused)
      : globalMuted;
  const videoMuted =
    effectiveMuted || !videoReadyForDisplay || (!isPostDetail && !hasNativeAudioFocus);

  const isLocalFileMedia = !!resolvedMediaUri && resolvedMediaUri.startsWith("file://");
  const [feedTappedToPlay, setFeedTappedToPlay] = useState(isLocalFileMedia);

  useEffect(() => {
    if (isLocalFileMedia) {
      setFeedTappedToPlay(true);
      setIsVideoPlaying(true);
    }
  }, [isLocalFileMedia, resolvedMediaUri]);

  const videoPositionKey = resolvedMediaUri
    ? buildVideoPositionKey(resolvedMediaUri, videoSyncScope)
    : "";
  const getPosition = useVideoPositionStore((s) => s.getPosition);
  const setPosition = useVideoPositionStore((s) => s.setPosition);
  const currentVideoPositionRef = useRef(0);
  const hasRestoredVideoPositionRef = useRef(false);

  const mediaWasCached = !!(resolvedMediaUri && MEDIA_LOADED_CACHE.has(resolvedMediaUri));
  const shouldDeferHeavyMedia =
    Platform.OS === "android" &&
    !isPostDetail &&
    !!videoSyncScope &&
    isFeedScrolling &&
    !isFocused &&
    !feedTappedToPlay &&
    !mediaWasCached;
  const shouldKeepFeedVideoMounted =
    isLocalFileMedia || isNearVisible || isFocused || feedTappedToPlay || isVideoPlaying;
  const shouldPrepareNativeVideo =
    isPostDetail ||
    retainPlayerForDetail ||
    (!shouldDeferHeavyMedia && shouldKeepFeedVideoMounted);
  const shouldMountNativeVideo =
    shouldPrepareNativeVideo &&
    (isPostDetail || screenActive || retainPlayerForDetail);
  const shouldPlayNativeVideo =
    (isVideoPlaying || isLocalFileMedia) &&
    screenActive &&
    !shouldBlurContent;
  const videoBufferProfile = isPostDetail
    ? "detail"
    : shouldPlayNativeVideo
      ? "feedActive"
      : "feedWarm";
  const videoHandoffKey =
    resolvedMediaUri && !isLocalFileMedia
      ? `${postId ? `${postId}:` : ""}${canonicalVideoAssetId(resolvedMediaUri)}`
      : null;

  // Detail screens adopt the feed card's already-buffered player for this
  // video when one exists (the feed stays mounted underneath in the nav
  // stack), instead of creating a fresh player and re-streaming the HLS
  // from scratch on every open.
  const [adoptedLease, setAdoptedLease] = useState<VideoPlayerLease | null>(null);
  const adoptedPlayer = adoptedLease?.player ?? null;
  useLayoutEffect(() => {
    if (!isPostDetail || !videoHandoffKey || !resolvedMediaUri) return;
    const lease = adoptHandoffPlayer(videoHandoffKey, resolvedMediaUri);
    if (!lease) return;
    setAdoptedLease(lease);
    return () => {
      setAdoptedLease(null);
      releaseHandoffPlayer(lease);
    };
  }, [isPostDetail, videoHandoffKey, resolvedMediaUri]);

  const controllerPlayer = useVideoPlayerController(
    shouldPrepareNativeVideo && !adoptedLease ? resolvedMediaUri : null,
    {
      loop: true,
      muted: videoMuted,
      shouldPlay: shouldPlayNativeVideo && !adoptedLease,
      timeUpdateInterval: 0.1,
      bufferProfile: videoBufferProfile,
      // Offer the player onward: feed offers to detail, detail offers to
      // fullscreen. (Controllers only offer once they own a source, so a
      // detail card that adopted the feed's player adds no duplicate offer.)
      handoffKey: videoHandoffKey,
    },
  );
  const videoPlayer = adoptedPlayer ?? controllerPlayer;

  // Whether some surface stacked above us (e.g. the fullscreen preview)
  // currently holds a newer lease on our player. While true, all writes are
  // suppressed; the lease-version bump on release re-runs these effects so
  // this surface re-asserts its state.
  const leaseVersion = useVideoPlayerLeaseVersion();
  const controlledElsewhere = isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease);
  const returningIntent = useVideoPlaybackIntent(videoPlayer, isVideoPlaying, screenActive, controlledElsewhere, setIsVideoPlaying);

  // An adopted player bypasses the controller's option effects, so detail
  // applies its settings directly.
  useEffect(() => {
    if (!adoptedPlayer) return;
    if (isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      applyVideoBufferProfile(adoptedPlayer, "detail");
      adoptedPlayer.loop = true;
      adoptedPlayer.timeUpdateEventInterval = 0.1;
    } catch {
      // Native player was released underneath us (feed unmounted).
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, leaseVersion]);
  useEffect(() => {
    if (!adoptedPlayer) return;
    if (isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      adoptedPlayer.muted = videoMuted;
    } catch {
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, videoMuted, leaseVersion]);
  useEffect(() => {
    if (!adoptedPlayer) return;
    if (isVideoPlayerControlledElsewhere(adoptedPlayer, adoptedLease)) return;
    try {
      if (shouldPlayNativeVideo) {
        adoptedPlayer.play();
      } else {
        adoptedPlayer.pause();
      }
    } catch {
      setAdoptedLease(null);
    }
  }, [adoptedPlayer, adoptedLease, shouldPlayNativeVideo, leaseVersion]);


  useEffect(() => {
    if (!resolvedMediaUri) return;
    const uri = resolvedMediaUri;
    if (shouldPrepareNativeVideo) {
      markVideoPrepareStart(uri);
      return;
    }
    clearVideoPrepareMark(uri);
  }, [resolvedMediaUri, shouldPrepareNativeVideo]);

  // Reset per-video state when a recycled card is handed a different video.
  const resolvedMediaUriRef = useRef(resolvedMediaUri);
  useEffect(() => {
    const uriChanged = resolvedMediaUriRef.current !== resolvedMediaUri;
    resolvedMediaUriRef.current = resolvedMediaUri;
    if (!uriChanged) return;
    hasRestoredVideoPositionRef.current = false;
    currentVideoPositionRef.current = 0;
    retainedPlayerWasInactiveRef.current = false;
    setRetainPlayerForDetail(false);
    // The native player is stable across list recycling; keep the poster
    // overlay up until the new source renders its first frame so the
    // previous video's last frame never shows through.
    setVideoReadyForDisplay(false);
    setShowVideoPrepSpinner(false);
  }, [resolvedMediaUri]);

  // Release a retained (handed-off) player shortly after the feed screen
  // becomes active again following a detail visit.
  useEffect(() => {
    if (!retainPlayerForDetail) {
      retainedPlayerWasInactiveRef.current = false;
      return;
    }
    if (!screenActive) {
      retainedPlayerWasInactiveRef.current = true;
      return;
    }
    if (!retainedPlayerWasInactiveRef.current) return;
    const releaseTimer = setTimeout(() => {
      setRetainPlayerForDetail(false);
    }, 1000);
    return () => clearTimeout(releaseTimer);
  }, [retainPlayerForDetail, screenActive]);

  useEffect(() => {
    if (!shouldMountNativeVideo) {
      setVideoReadyForDisplay(false);
    }
  }, [shouldMountNativeVideo]);

  const saveVideoPosition = useCallback(() => {
    if (!videoPositionKey) return;
    const seconds = currentVideoPositionRef.current;
    if (seconds > 0.5) setPosition(videoPositionKey, seconds);
  }, [videoPositionKey, setPosition]);

  const saveVideoPositionFresh = useCallback(async () => {
    if (!videoPositionKey) return;
    const seconds = videoPlayer.currentTime;
    if (seconds > 0.5) {
      setPosition(videoPositionKey, seconds);
    } else {
      saveVideoPosition();
    }
  }, [saveVideoPosition, setPosition, videoPlayer, videoPositionKey]);

  const stopNativeVideoPlayback = useCallback(async () => {
    videoPlayer.pause();
  }, [videoPlayer]);

  // Single-owner audio focus across feed cards: only one card may be unmuted
  // at a time; gaining focus silences and pauses the previous owner.
  useEffect(() => {
    const nativeAudioFocusId = nativeAudioFocusIdRef.current;
    const shouldOwnNativeAudioFocus =
      !isPostDetail &&
      screenActive &&
      !shouldBlurContent &&
      isVisible &&
      isFocused;

    if (shouldOwnNativeAudioFocus) {
      if (activeNativeAudioFocus?.id !== nativeAudioFocusId) {
        activeNativeAudioFocus?.onLoseFocus();
        activeNativeAudioFocus = {
          id: nativeAudioFocusId,
          onLoseFocus: () => {
            setHasNativeAudioFocus(false);
            void stopNativeVideoPlayback();
            setIsVideoPlaying(false);
            setIsVideoLoading(false);
            userInitiatedPlayRef.current = false;
          },
        };
      }
      if (!hasNativeAudioFocus) {
        setHasNativeAudioFocus(true);
      }
    } else if (!isPostDetail && hasNativeAudioFocus) {
      if (activeNativeAudioFocus?.id === nativeAudioFocusId) {
        activeNativeAudioFocus = null;
      }
      setHasNativeAudioFocus(false);
    }

    return () => {
      if (activeNativeAudioFocus?.id === nativeAudioFocusId) {
        activeNativeAudioFocus = null;
      }
    };
  }, [
    isPostDetail,
    screenActive,
    shouldBlurContent,
    isVisible,
    isFocused,
    hasNativeAudioFocus,
    stopNativeVideoPlayback,
  ]);

  // Flush the last known position (and release audio focus) on unmount.
  useEffect(() => {
    const nativeAudioFocusId = nativeAudioFocusIdRef.current;
    return () => {
      if (videoPositionKey && currentVideoPositionRef.current > 0.5) {
        useVideoPositionStore.getState().setPosition(videoPositionKey, currentVideoPositionRef.current);
      }
      if (videoPrepSpinnerTimeoutRef.current) {
        clearTimeout(videoPrepSpinnerTimeoutRef.current);
      }
      if (activeNativeAudioFocus?.id === nativeAudioFocusId) {
        activeNativeAudioFocus = null;
      }
    };
  }, [videoPositionKey]);

  // Delayed prep spinner: only shown when playback was requested but the
  // first frame is taking noticeably long.
  useEffect(() => {
    const needsVideoPrep =
      isVideoPlaying && !videoReadyForDisplay && !shouldBlurContent;

    if (!needsVideoPrep) {
      setShowVideoPrepSpinner(false);
      if (videoPrepSpinnerTimeoutRef.current) {
        clearTimeout(videoPrepSpinnerTimeoutRef.current);
        videoPrepSpinnerTimeoutRef.current = null;
      }
      return;
    }

    if (videoPrepSpinnerTimeoutRef.current) {
      clearTimeout(videoPrepSpinnerTimeoutRef.current);
    }

    videoPrepSpinnerTimeoutRef.current = setTimeout(() => {
      setShowVideoPrepSpinner(true);
      videoPrepSpinnerTimeoutRef.current = null;
    }, 220);

    return () => {
      if (videoPrepSpinnerTimeoutRef.current) {
        clearTimeout(videoPrepSpinnerTimeoutRef.current);
        videoPrepSpinnerTimeoutRef.current = null;
      }
    };
  }, [isVideoPlaying, shouldBlurContent, videoReadyForDisplay]);

  // Viewability/blur/screen-state driven play/pause orchestration.
  useEffect(() => {
    if (controlledElsewhere) return;
    if (screenActive && returningIntent.current !== null) {
      setIsVideoPlaying(returningIntent.current);
      returningIntent.current = null;
      return;
    }
    const canAutoPlayFeedMedia = allowAutoplay && (isPostDetail || isFocused);
    const canAutoPlayCurrentMedia =
      isLocalFileMedia || canAutoPlayFeedMedia || feedTappedToPlay;
    if (shouldBlurContent) {
      setIsVideoPlaying(false);
      setIsVideoLoading(false);
      userInitiatedPlayRef.current = false;
      void stopNativeVideoPlayback();
      prevShouldBlurRef.current = shouldBlurContent;
      return;
    }

    const wasBlurred = prevShouldBlurRef.current;
    prevShouldBlurRef.current = shouldBlurContent;

    if (wasBlurred && !shouldBlurContent && screenActive && canAutoPlayCurrentMedia) {
      setIsVideoPlaying(true);
    }

    if ((isVisible || isLocalFileMedia) && screenActive && canAutoPlayCurrentMedia) {
      setIsVideoPlaying(true);
    } else if (!screenActive) {
      setIsVideoPlaying(false);
      setIsVideoLoading(false);
      userInitiatedPlayRef.current = false;
      void stopNativeVideoPlayback();
    } else if ((!isVisible && !isLocalFileMedia) || (!isPostDetail && !canAutoPlayCurrentMedia)) {
      setIsVideoPlaying(false);
      setIsVideoLoading(false);
      userInitiatedPlayRef.current = false;
      void stopNativeVideoPlayback();
    }
  }, [
    shouldBlurContent,
    isVisible,
    allowAutoplay,
    screenActive,
    resolvedMediaUri,
    feedTappedToPlay,
    isLocalFileMedia,
    isPostDetail,
    isFocused,
    stopNativeVideoPlayback,
    controlledElsewhere,
    returningIntent,
  ]);

  useEffect(() => {
    if (!isPostDetail && !isVisible && !isLocalFileMedia && feedTappedToPlay) {
      setFeedTappedToPlay(false);
    }
  }, [isPostDetail, isVisible, isLocalFileMedia, feedTappedToPlay]);

  // Save position when the screen deactivates; restore (and repaint if
  // needed) when it becomes active again.
  const wasScreenInactiveForVideoRef = useRef(false);
  useLayoutEffect(() => {
    if (!videoPositionKey) return;
    if (!screenActive) {
      wasScreenInactiveForVideoRef.current = true;
      saveVideoPositionFresh();
    } else if (wasScreenInactiveForVideoRef.current) {
      wasScreenInactiveForVideoRef.current = false;
      if (isVideoPlayerControlledElsewhere(videoPlayer, adoptedLease) || returningIntent.current !== null) return;
      const saved = getPosition(videoPositionKey);
      if (saved > 0.5) {
        videoPlayer.currentTime = saved;
      }
    }
  }, [screenActive, videoPositionKey, getPosition, saveVideoPositionFresh, videoPlayer, adoptedLease, returningIntent]);

  // Returning from background/lock can leave the video frozen (the OS pauses
  // the native player and blocks play() while locked) or blank (surface needs
  // a repaint). A seek-in-place + play on foreground recovers both.
  // Feed cards also clear viewability on background, so recovery stays armed
  // until play is requested again (BUG-006).
  useVideoForegroundRecovery({
    sourceKey: resolvedMediaUri,
    shouldPlay: shouldPlayNativeVideo,
    videoPlayer,
    adoptedLease,
    maxReloadAttempts: 0,
  });

  return {
    // Effective visibility (optimistic prime applied).
    isVisible,
    isFocused,
    // Player.
    videoPlayer,
    adoptedPlayer,
    adoptedLease,
    controlledElsewhere,
    // Playback state.
    isVideoPlaying,
    setIsVideoPlaying,
    isVideoLoading,
    setIsVideoLoading,
    videoReadyForDisplay,
    setVideoReadyForDisplay,
    showVideoPrepSpinner,
    feedTappedToPlay,
    setFeedTappedToPlay,
    setRetainPlayerForDetail,
    // Mount gates.
    shouldPrepareNativeVideo,
    shouldMountNativeVideo,
    shouldPlayNativeVideo,
    isLocalFileMedia,
    mediaWasCached,
    // Mute.
    videoMuted,
    effectiveMuted,
    hasNativeAudioFocus,
    // Position.
    videoPositionKey,
    currentVideoPositionRef,
    hasRestoredVideoPositionRef,
    getPosition,
    setPosition,
    saveVideoPosition,
    saveVideoPositionFresh,
    stopNativeVideoPlayback,
    userInitiatedPlayRef,
  };
}

export type PostCardVideoPlayback = ReturnType<typeof usePostCardVideoPlayback>;
