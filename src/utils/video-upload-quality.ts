/** Matches node `MEDIA_SHORT_CLIP_SEC` / `MEDIA_LONGFORM_MAX_HEIGHT`. */
export const SHORT_CLIP_THRESHOLD_MS = 60 * 1000;
export const LONGFORM_MAX_HEIGHT = 1080;
export const SHORT_CLIP_MAX_LONG_SIDE = 1920;

/** Conservative fallback when source dimensions are unknown. */
export const UNKNOWN_SOURCE_MAX_SIZE = 1280;
export const UNKNOWN_SOURCE_BITRATE = 1_800_000;

export const BITRATE_480P = 1_200_000;
export const BITRATE_720P = 2_500_000;
export const BITRATE_1080P = 4_000_000;
export const BITRATE_1080P_LONGFORM = 3_500_000;

const LONG_SIDE_480P = 854;
const LONG_SIDE_720P = 1280;

export type UploadVideoQualityInput = {
  sourceWidth?: number;
  sourceHeight?: number;
  totalDurationMs?: number;
};

export type UploadVideoCompressionSettings = {
  maxSize: number;
  bitrate: number;
};

function positiveDimension(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0
    ? Math.round(value as number)
    : 0;
}

function bitrateForLongSide(maxSize: number, isLongForm: boolean): number {
  if (maxSize <= LONG_SIDE_480P) return BITRATE_480P;
  if (maxSize <= LONG_SIDE_720P) return BITRATE_720P;
  return isLongForm ? BITRATE_1080P_LONGFORM : BITRATE_1080P;
}

/**
 * Choose compressor maxSize (output longer side) and bitrate from source
 * dimensions. Never upscales. Short clips may keep 1080p; long-form caps
 * height at 1080 so non-transcoding nodes accept the upload.
 */
export function getUploadVideoCompressionSettings(
  input: UploadVideoQualityInput = {},
): UploadVideoCompressionSettings {
  const width = positiveDimension(input.sourceWidth);
  const height = positiveDimension(input.sourceHeight);
  const isLongForm = (input.totalDurationMs ?? 0) > SHORT_CLIP_THRESHOLD_MS;

  if (width <= 0 || height <= 0) {
    return {
      maxSize: isLongForm ? LONGFORM_MAX_HEIGHT : UNKNOWN_SOURCE_MAX_SIZE,
      bitrate: UNKNOWN_SOURCE_BITRATE,
    };
  }

  if (isLongForm) {
    const scale = height > LONGFORM_MAX_HEIGHT
      ? LONGFORM_MAX_HEIGHT / height
      : 1;
    const maxSize = Math.max(
      1,
      Math.round(Math.max(width, height) * scale),
    );
    return {
      maxSize,
      bitrate: bitrateForLongSide(maxSize, true),
    };
  }

  const maxSize = Math.max(1, Math.min(Math.max(width, height), SHORT_CLIP_MAX_LONG_SIDE));
  return {
    maxSize,
    bitrate: bitrateForLongSide(maxSize, false),
  };
}
