import { useCallback, useEffect, useRef, useState } from "react";
import type { View } from "react-native";
import { getVideoThumbnailUri, type ResolvedMedia } from "./post-card-utils";
import {
  MEDIA_ASPECT_RATIO_CACHE,
  MEDIA_LOADED_CACHE,
  getMediaAspectRatio,
} from "./post-card-media-constants";
import { setLastPressedMediaTransition } from "@/src/utils/post-transition";

/**
 * Shared state helpers used by every post-card media surface (video,
 * YouTube, image, gallery frame). Extracted from the former monolithic
 * PostCardMedia component; behavior is a verbatim port.
 */

/**
 * Aspect-ratio state for the media frame. Prefers the LRU cache, then
 * server-provided dimensions, then detected sizes reported via
 * `updateMediaAspectRatioFromSize` (poster/image loads, video tracks).
 */
export function useMediaAspectRatio(media: ResolvedMedia | undefined) {
  const resolvedMediaUri = media?.uri;
  const aspectRatioLockedRef = useRef(false);
  const cachedAspectRatio = resolvedMediaUri
    ? MEDIA_ASPECT_RATIO_CACHE.get(resolvedMediaUri)
    : undefined;
  const targetAspectRatio = cachedAspectRatio ?? getMediaAspectRatio(media);
  const [mediaAspectRatio, setMediaAspectRatio] = useState(targetAspectRatio);

  const prevMediaUriRef = useRef(resolvedMediaUri);
  const uriChanged = prevMediaUriRef.current !== resolvedMediaUri;
  if (uriChanged) {
    prevMediaUriRef.current = resolvedMediaUri;
    aspectRatioLockedRef.current = !!cachedAspectRatio;
    if (Math.abs(mediaAspectRatio - targetAspectRatio) >= 0.01) {
      setMediaAspectRatio(targetAspectRatio);
    }
  } else if (cachedAspectRatio && !aspectRatioLockedRef.current) {
    aspectRatioLockedRef.current = true;
  }

  const effectiveAspectRatio = uriChanged ? targetAspectRatio : mediaAspectRatio;

  const hasServerAspectRatio = !!(
    media?.aspectRatio ||
    (media?.width && media?.height)
  );

  const updateMediaAspectRatioFromSize = useCallback(
    (width?: number, height?: number) => {
      if (hasServerAspectRatio) return;
      if (!width || !height) return;
      const ratio = width / height;
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      setMediaAspectRatio((current) => {
        if (Math.abs(current - ratio) < 0.01) return current;
        return ratio;
      });
      if (resolvedMediaUri) {
        MEDIA_ASPECT_RATIO_CACHE.set(resolvedMediaUri, ratio);
      }
      aspectRatioLockedRef.current = true;
    },
    [hasServerAspectRatio, resolvedMediaUri],
  );

  return { effectiveAspectRatio, updateMediaAspectRatioFromSize };
}

/**
 * Skeleton/loaded state for a media uri, backed by the LRU loaded cache so
 * recycled cards do not re-show skeletons for media already displayed. When
 * the uri changes to an unseen one, an 8s fallback marks it loaded so the
 * skeleton can never get stuck (`onLoadingTimeout` lets the owner clear its
 * own spinners at the same moment).
 */
export function useMediaLoadedState(
  resolvedMediaUri: string | undefined,
  onLoadingTimeout?: () => void,
) {
  const [mediaLoaded, setMediaLoaded] = useState(() =>
    resolvedMediaUri ? MEDIA_LOADED_CACHE.has(resolvedMediaUri) : false,
  );
  const hasDisplayedMediaRef = useRef(mediaLoaded);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLoadingTimeoutRef = useRef(onLoadingTimeout);
  onLoadingTimeoutRef.current = onLoadingTimeout;
  const uriRef = useRef(resolvedMediaUri);

  useEffect(() => {
    const uriChanged = uriRef.current !== resolvedMediaUri;
    uriRef.current = resolvedMediaUri;
    if (!uriChanged) return;
    const wasLoaded = resolvedMediaUri
      ? MEDIA_LOADED_CACHE.has(resolvedMediaUri)
      : false;
    setMediaLoaded(wasLoaded || hasDisplayedMediaRef.current);
    if (!wasLoaded) {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      loadingTimeoutRef.current = setTimeout(() => {
        setMediaLoaded(true);
        if (resolvedMediaUri) MEDIA_LOADED_CACHE.add(resolvedMediaUri);
        onLoadingTimeoutRef.current?.();
      }, 8000);
    }
  }, [resolvedMediaUri]);

  useEffect(() => {
    if (mediaLoaded) {
      hasDisplayedMediaRef.current = true;
    }
  }, [mediaLoaded]);

  useEffect(
    () => () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    },
    [],
  );

  const clearLoadingFallback = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  return { mediaLoaded, setMediaLoaded, clearLoadingFallback };
}

export type MediaTransitionVideoSnapshot = {
  positionSeconds?: number;
  wasPlaying?: boolean;
};

/**
 * Shared-element-style press transition: measures the media frame in window
 * coordinates and records it (plus an optional video playback snapshot) for
 * the destination screen's entry animation, then runs the navigation. Feed
 * only; detail presses run immediately.
 */
export function useMediaPressTransition({
  isPostDetail,
  postId,
}: {
  isPostDetail: boolean;
  postId?: string;
}) {
  const mediaFrameRef = useRef<View | null>(null);

  const runWithMediaTransition = useCallback(
    (
      targetMedia: ResolvedMedia | undefined,
      run: () => void,
      videoSnapshot?: MediaTransitionVideoSnapshot,
    ) => {
      if (isPostDetail || !postId || !targetMedia?.uri || !mediaFrameRef.current) {
        run();
        return;
      }

      let didRun = false;
      const runOnce = () => {
        if (didRun) return;
        didRun = true;
        run();
      };
      const fallback = setTimeout(runOnce, 80);

      mediaFrameRef.current.measureInWindow((x, y, width, height) => {
        clearTimeout(fallback);
        if (width > 0 && height > 0) {
          setLastPressedMediaTransition({
            postId,
            uri: targetMedia.uri,
            previewUri: targetMedia.type === "video"
              ? getVideoThumbnailUri(targetMedia.uri, targetMedia.posterUri)
              : targetMedia.uri,
            positionSeconds: videoSnapshot?.positionSeconds,
            wasPlaying: videoSnapshot?.wasPlaying,
            type: targetMedia.type,
            x,
            y,
            width,
            height,
          });
        }
        runOnce();
      });
    },
    [isPostDetail, postId],
  );

  return { mediaFrameRef, runWithMediaTransition };
}
