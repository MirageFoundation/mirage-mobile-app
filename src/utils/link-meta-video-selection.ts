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

type RedditSourceVideo = RedditPreviewVideo & {
  dash_url?: string | null;
  hls_url?: string | null;
};

const MIN_REDDIT_PREVIEW_VIDEO_PIXELS = 320 * 180;
const REDDIT_DASH_HEIGHTS = [1080, 720, 480, 360, 240] as const;

function decodeAmp(url: string): string {
  return url.replace(/&amp;/g, "&");
}

/**
 * Prefer a higher DASH MP4 when Reddit's fallback_url is a compressed rung
 * below the reported source dimensions. Share-intent downloads need an MP4,
 * so HLS/DASH playlists are last-resort only.
 */
export function selectRedditSourceVideoUrl(
  video: RedditSourceVideo | null | undefined,
): string | null {
  const fallback = video?.fallback_url ? decodeAmp(video.fallback_url) : null;
  if (!fallback) {
    const dash = video?.dash_url ? decodeAmp(video.dash_url) : null;
    const hls = video?.hls_url ? decodeAmp(video.hls_url) : null;
    return dash ?? hls ?? null;
  }

  const width = Number(video?.width) || 0;
  const height = Number(video?.height) || 0;
  const target = Math.min(width, height) || Math.max(width, height);
  if (target <= 0) return fallback;

  const desired = REDDIT_DASH_HEIGHTS.find((rung) => rung <= target);
  if (!desired) return fallback;

  const currentMatch = fallback.match(/\/DASH_(\d+)/i);
  const current = currentMatch ? Number(currentMatch[1]) : 0;
  if (!current || current >= desired) return fallback;

  return fallback.replace(/\/DASH_\d+/i, `/DASH_${desired}`);
}

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
