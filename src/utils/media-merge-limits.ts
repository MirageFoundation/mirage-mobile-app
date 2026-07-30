// mp4box can retain the inputs, extracted samples, copied samples, and output at
// once. A 24 MiB input cap keeps a conservative ~5x amplification near 120 MiB.
export const MAX_IN_MEMORY_MEDIA_MERGE_BYTES = 24 * 1024 * 1024;

export const MEDIA_MERGE_FALLBACK_MESSAGE =
  "The video is ready, but its separate audio was too large or could not be verified for safe combining.";

export type MediaMergeLimitReason =
  | "allowed"
  | "unknown-size"
  | "size-overflow"
  | "combined-size-limit";

export type MediaMergeDecision = {
  allowed: boolean;
  reason: MediaMergeLimitReason;
  videoBytes: number | null;
  audioBytes: number | null;
  combinedBytes: number | null;
};

export type MediaMergeFallback = {
  preserveVideo: true;
  message: string;
};

const normalizeKnownSize = (size: number | null | undefined) =>
  typeof size === "number" && Number.isSafeInteger(size) && size >= 0 ? size : null;

export function getMediaMergeDecision(
  videoSize: number | null | undefined,
  audioSize: number | null | undefined,
): MediaMergeDecision {
  const videoBytes = normalizeKnownSize(videoSize);
  const audioBytes = normalizeKnownSize(audioSize);

  if (videoBytes === null || audioBytes === null) {
    return {
      allowed: false,
      reason: "unknown-size",
      videoBytes,
      audioBytes,
      combinedBytes: null,
    };
  }

  if (videoBytes > Number.MAX_SAFE_INTEGER - audioBytes) {
    return {
      allowed: false,
      reason: "size-overflow",
      videoBytes,
      audioBytes,
      combinedBytes: null,
    };
  }

  const combinedBytes = videoBytes + audioBytes;
  return {
    allowed: combinedBytes <= MAX_IN_MEMORY_MEDIA_MERGE_BYTES,
    reason: combinedBytes <= MAX_IN_MEMORY_MEDIA_MERGE_BYTES
      ? "allowed"
      : "combined-size-limit",
    videoBytes,
    audioBytes,
    combinedBytes,
  };
}

export function getMediaMergeFallback(
  decision: MediaMergeDecision,
): MediaMergeFallback | null {
  return decision.allowed
    ? null
    : { preserveVideo: true, message: MEDIA_MERGE_FALLBACK_MESSAGE };
}

export class MediaMergeSizeLimitError extends Error {
  readonly decision: MediaMergeDecision;

  constructor(decision: MediaMergeDecision) {
    super(`Unsafe in-memory media merge: ${decision.reason}`);
    this.name = "MediaMergeSizeLimitError";
    this.decision = decision;
  }
}

export function assertMediaMergeBufferSizes(videoBytes: number, audioBytes: number) {
  const decision = getMediaMergeDecision(videoBytes, audioBytes);
  if (!decision.allowed) {
    throw new MediaMergeSizeLimitError(decision);
  }
}
