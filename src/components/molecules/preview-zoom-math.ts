export const MIN_ZOOM_SCALE = 1;
export const MAX_ZOOM_SCALE = 4;

export function clampZoomScale(scale: number): number {
  "worklet";
  if (!Number.isFinite(scale)) return MIN_ZOOM_SCALE;
  return Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, scale));
}

export function maxZoomTranslation(extent: number, scale: number): number {
  "worklet";
  // With a centered transform origin, a container scaled by `s` can shift at
  // most (extent * (s - 1)) / 2 in each direction before its edge crosses the
  // matching viewport edge. Invalid/zero extents have no pannable range.
  if (!Number.isFinite(extent) || extent <= 0 || !Number.isFinite(scale)) {
    return 0;
  }
  return Math.max(0, (extent * (scale - 1)) / 2);
}

export function clampZoomTranslation(
  value: number,
  extent: number,
  scale: number,
): number {
  "worklet";
  const max = maxZoomTranslation(extent, scale);
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(-max, value));
}

export function settleZoomTransform(
  translationX: number,
  translationY: number,
  scale: number,
  containerWidth: number,
  containerHeight: number,
): { x: number; y: number; scale: number } {
  "worklet";
  const settledScale = clampZoomScale(scale);
  return {
    scale: settledScale,
    x: clampZoomTranslation(translationX, containerWidth, settledScale),
    y: clampZoomTranslation(translationY, containerHeight, settledScale),
  };
}
