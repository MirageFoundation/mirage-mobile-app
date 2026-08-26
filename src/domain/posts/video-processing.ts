const PROCESSING_MARKER_MAX_AGE_MS = 15 * 60 * 1000;

type VideoProcessingPost = {
  optimisticVideoPreviewUntil?: number;
  optimistic_video_preview_until?: number;
  optimisticDraft?: { attachmentType?: string | null };
  optimistic_draft?: { attachmentType?: string | null };
};

export function isPostVideoProcessing(
  post: VideoProcessingPost | null | undefined,
  now = Date.now(),
): boolean {
  if (!post) return false;
  const marker = post.optimisticVideoPreviewUntil ?? post.optimistic_video_preview_until;
  const draft = post.optimisticDraft ?? post.optimistic_draft;
  return (
    draft?.attachmentType === "video" &&
    typeof marker === "number" &&
    marker > 0 &&
    marker >= now - PROCESSING_MARKER_MAX_AGE_MS
  );
}
