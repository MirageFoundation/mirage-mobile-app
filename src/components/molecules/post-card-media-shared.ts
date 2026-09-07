import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, View } from "react-native";
import { getIntrinsicMediaAspectRatio } from "./media-gallery-sizing";
import { getVideoThumbnailUri, type ResolvedMedia } from "./post-card-utils";
import {
  MEDIA_ASPECT_RATIO_CACHE,
  MEDIA_LOADED_CACHE,
  MEDIA_HORIZONTAL_PADDING,
  SCREEN_WIDTH,
  getMediaAspectRatio,
} from "./post-card-media-constants";
import { setLastPressedMediaTransition } from "@/src/utils/post-transition";

/**
 * Shared state helpers used by every post-card media surface (video,
 * YouTube, image, gallery frame). Extracted from the former monolithic
 * PostCardMedia component; behavior is a verbatim port.
 */

/** Metadata wins; decoded dimensions fill missing metadata for this asset only. */
export function useMediaAspectRatio(media: ResolvedMedia | undefined) {
  const resolvedMediaUri = media?.uri;
  const currentUriRef = useRef(resolvedMediaUri);
  currentUriRef.current = resolvedMediaUri;
  const [decoded, setDecoded] = useState<{ uri: string; ratio: number }>();
  const metadataRatio = getIntrinsicMediaAspectRatio(media);
  const effectiveAspectRatio = metadataRatio
    ?? (decoded?.uri === resolvedMediaUri ? decoded?.ratio : undefined)
    ?? getMediaAspectRatio(media);

  const updateMediaAspectRatioFromSize = useCallback(
    (width?: number, height?: number) => {
      if (metadataRatio || !resolvedMediaUri) return;
      const ratio = getIntrinsicMediaAspectRatio({ width, height });
      if (!ratio || currentUriRef.current !== resolvedMediaUri) return;
      MEDIA_ASPECT_RATIO_CACHE.set(resolvedMediaUri, ratio);
      setDecoded((current) =>
        current?.uri === resolvedMediaUri && Math.abs(current.ratio - ratio) < 0.001
          ? current
          : { uri: resolvedMediaUri, ratio },
      );
    },
    [metadataRatio, resolvedMediaUri],
  );

  return { effectiveAspectRatio, updateMediaAspectRatioFromSize };
}

export function useMediaFrameWidth() {
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING);
  const onMediaLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (!Number.isFinite(width) || width <= 0) return;
    setContainerWidth((current) => Math.abs(current - width) < 1 ? current : width);
  }, []);
  return { containerWidth, onMediaLayout };
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
