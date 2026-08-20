type VideoVariant = {
  url?: string | null;
  type?: string | null;
  content_type?: string | null;
  bitrate?: number | string | null;
  bit_rate?: number | string | null;
};

export function selectHighestQualityMp4Variant(
  variants: VideoVariant[] | null | undefined,
): string | null {
  if (!Array.isArray(variants)) return null;
  return variants
    .filter((variant) => {
      const type = variant?.type ?? variant?.content_type;
      return !!variant?.url && (
        type === "video/mp4" ||
        /\.mp4(?:\?|$)/i.test(variant.url)
      );
    })
    .sort((a, b) => {
      const bitrateA = Number(a.bitrate ?? a.bit_rate) || 0;
      const bitrateB = Number(b.bitrate ?? b.bit_rate) || 0;
      return bitrateB - bitrateA;
    })[0]?.url ?? null;
}

type RedditPreviewVideo = {
  fallback_url?: string | null;
  width?: number | string | null;
  height?: number | string | null;
};

const MIN_REDDIT_PREVIEW_VIDEO_PIXELS = 320 * 180;

export function selectRedditPreviewVideoUrl(
  preview: RedditPreviewVideo | null | undefined,
): string | null {
  if (!preview?.fallback_url) return null;
  const width = Number(preview.width) || 0;
  const height = Number(preview.height) || 0;
  if (width > 0 && height > 0 && width * height < MIN_REDDIT_PREVIEW_VIDEO_PIXELS) {
    return null;
  }
  return preview.fallback_url.replace(/&amp;/g, "&");
}
