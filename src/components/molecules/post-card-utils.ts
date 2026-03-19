import type { PostMedia } from "./post-card-types";

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const MARKDOWN_LINK_REGEX = /!?\[[^\]]*\]\([^)]+\)/g;
// Regex to find standalone URLs (not inside markdown links)
const STANDALONE_URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]()]+/gi;

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
  "mpeg",
  "mpg",
  "m3u8",
  "mpd",
]);

export type ResolvedMedia = {
  uri: string;
  type: "image" | "video" | "gif" | "youtube";
  width?: number;
  height?: number;
  aspectRatio?: number;
};

export type ResolvedPostContent = {
  extractedUrl: string | null;
  bodyWithoutUrl?: string;
  displayDomain: string | null;
  bodyVideoUrl: string | null;
  resolvedMedia?: ResolvedMedia;
  resolvedMediaList: ResolvedMedia[];
  hasMultipleMedia: boolean;
  extraMediaCount: number;
};

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (
      parsedUrl.hostname === "youtube.com" ||
      parsedUrl.hostname === "www.youtube.com" ||
      parsedUrl.hostname === "m.youtube.com"
    ) {
      if (parsedUrl.pathname === "/watch") {
        return parsedUrl.searchParams.get("v");
      }
      const shortsMatch = parsedUrl.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) return shortsMatch[1];
      const embedMatch = parsedUrl.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
      if (embedMatch) return embedMatch[1];
    }
    if (parsedUrl.hostname === "youtu.be") {
      const id = parsedUrl.pathname.slice(1).split("/")[0];
      return id || null;
    }
  } catch {
    return null;
  }
  return null;
}

export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

// Find positions of all markdown links in text
function findMarkdownLinkPositions(text: string): { start: number; end: number }[] {
  const positions: { start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(MARKDOWN_LINK_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    positions.push({ start: match.index, end: match.index + match[0].length });
  }
  return positions;
}

// Check if a position is inside any markdown link
function isInsideMarkdownLink(offset: number, positions: { start: number; end: number }[]): boolean {
  return positions.some(link => offset >= link.start && offset < link.end);
}

export function extractFirstUrl(text?: string): string | null {
  if (!text) return null;
  const mdPositions = findMarkdownLinkPositions(text);
  let match: RegExpExecArray | null;
  const regex = new RegExp(STANDALONE_URL_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    if (!isInsideMarkdownLink(match.index, mdPositions)) {
      return match[0];
    }
  }
  return null;
}

export function removeFirstUrl(text?: string): string | undefined {
  if (!text) return undefined;
  const firstUrl = extractFirstUrl(text);
  if (!firstUrl) return text;
  return text.replace(firstUrl, "").trim() || undefined;
}

export function normalizeVideoUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("cloudflarestream.com")) {
      return url;
    }
    if (parsedUrl.hostname.includes("videodelivery.net")) {
      if (parsedUrl.pathname.endsWith("/iframe")) {
        parsedUrl.pathname = parsedUrl.pathname.replace(
          "/iframe",
          "/manifest/video.m3u8"
        );
        return parsedUrl.toString();
      }
      if (parsedUrl.pathname.endsWith("/manifest")) {
        parsedUrl.pathname = `${parsedUrl.pathname}/video.m3u8`;
        return parsedUrl.toString();
      }
    }
  } catch {
    if (url.includes("videodelivery.net") && url.endsWith("/iframe")) {
      return url.replace("/iframe", "/manifest/video.m3u8");
    }
    if (url.includes("videodelivery.net") && url.endsWith("/manifest")) {
      return `${url}/video.m3u8`;
    }
  }

  return url;
}

export function resolveRedgifsVideoUrl(posterUrl: string): string | null {
  try {
    const parsedUrl = new URL(posterUrl);
    if (!parsedUrl.hostname.includes("redgifs.com")) return null;
    if (/\.(mp4|m4v|webm)$/i.test(parsedUrl.pathname)) {
      return posterUrl;
    }
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(parsedUrl.pathname)) {
      const mobile = posterUrl.replace(/-poster(\.\w+)$/, "-mobile.mp4").replace(/\.(jpg|jpeg|png|webp|gif)$/i, ".mp4");
      return mobile;
    }
    return posterUrl;
  } catch {
    if (!posterUrl.includes("redgifs.com")) return null;
    if (/\.(mp4|m4v|webm)/i.test(posterUrl)) {
      return posterUrl;
    }
    if (/\.(jpg|jpeg|png|webp|gif)/i.test(posterUrl)) {
      return posterUrl.replace(/-poster(\.\w+)$/, "-mobile.mp4").replace(/\.(jpg|jpeg|png|webp|gif)$/i, ".mp4");
    }
    return posterUrl;
  }
}

export function getMediaTypeFromUrl(url: string): "image" | "video" | "gif" | "youtube" {
  if (isYouTubeUrl(url)) return "youtube";
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("cloudflarestream.com")) {
      return "video";
    }
    if (parsedUrl.hostname.includes("videodelivery.net")) {
      return "video";
    }
    if (parsedUrl.hostname.includes("redgifs.com")) {
      return "gif";
    }
    const path = parsedUrl.pathname.toLowerCase();
    const extension = path.split(".").pop() ?? "";
    if (extension === "gif") return "gif";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
  } catch {
    const path = url.toLowerCase().split("?")[0];
    const extension = path.split(".").pop() ?? "";
    if (url.includes("cloudflarestream.com")) return "video";
    if (url.includes("videodelivery.net")) return "video";
    if (url.includes("redgifs.com")) return "gif";
    if (extension === "gif") return "gif";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
  }

  return "image";
}

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif",
]);

export function isDirectMediaUrl(url: string): boolean {
  if (isYouTubeUrl(url)) return true;
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("cloudflarestream.com")) return true;
    if (parsedUrl.hostname.includes("videodelivery.net")) return true;
    if (parsedUrl.hostname.includes("redgifs.com")) return true;
    const ext = parsedUrl.pathname.toLowerCase().split(".").pop() ?? "";
    return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
  } catch {
    const path = url.toLowerCase().split("?")[0];
    const ext = path.split(".").pop() ?? "";
    if (url.includes("cloudflarestream.com")) return true;
    if (url.includes("videodelivery.net")) return true;
    if (url.includes("redgifs.com")) return true;
    return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
  }
}

export function resolvePostContent(
  body: string | undefined,
  media: PostMedia[] | undefined
): ResolvedPostContent {
  const extractedUrl = extractFirstUrl(body);
  if (__DEV__ && body?.includes("cloudflarestream")) {
    console.log("[resolvePostContent] body:", body, "extractedUrl:", extractedUrl);
  }
  const bodyWithoutUrl = removeFirstUrl(body);
  const displayDomain = extractedUrl ? extractDomain(extractedUrl) : null;
  const bodyVideoUrl =
    extractedUrl && (getMediaTypeFromUrl(extractedUrl) === "video" || getMediaTypeFromUrl(extractedUrl) === "youtube")
      ? normalizeVideoUrl(extractedUrl)
      : null;
  if (__DEV__ && extractedUrl?.includes("cloudflarestream")) {
    console.log("[resolvePostContent] mediaType:", getMediaTypeFromUrl(extractedUrl), "bodyVideoUrl:", bodyVideoUrl);
  }

  const primaryMedia = media?.[0];
  const mediaCount = media?.length ?? 0;
  const hasMultipleMedia = mediaCount > 1;
  const extraMediaCount = mediaCount > 0 ? mediaCount - 1 : 0;

  const isOgThumbnail =
    extractedUrl &&
    !isDirectMediaUrl(extractedUrl) &&
    mediaCount === 1 &&
    primaryMedia?.type === "image" &&
    primaryMedia?.uri &&
    !primaryMedia.uri.includes("imagedelivery.net") &&
    !primaryMedia.uri.includes("cloudflarestream.com") &&
    !primaryMedia.uri.includes("videodelivery.net");

  const resolvedMedia = isOgThumbnail
    ? undefined
    : bodyVideoUrl
    ? (getMediaTypeFromUrl(extractedUrl!) === "youtube"
      ? ({ uri: extractedUrl!, type: "youtube" as const })
      : ({ uri: bodyVideoUrl, type: "video" as const }))
    : primaryMedia
    ? {
        ...primaryMedia,
        type: extractedUrl
          ? getMediaTypeFromUrl(extractedUrl) !== "image"
            ? getMediaTypeFromUrl(extractedUrl)
            : primaryMedia.type
          : primaryMedia.type,
        uri:
          primaryMedia.type === "video"
            ? normalizeVideoUrl(primaryMedia.uri)
            : primaryMedia.uri,
      }
    : undefined;

  const redgifsVideoUrl = resolvedMedia?.type === "gif"
    ? resolveRedgifsVideoUrl(resolvedMedia.uri)
    : null;
  const finalMedia = redgifsVideoUrl && resolvedMedia
    ? { ...resolvedMedia, uri: redgifsVideoUrl, type: "video" as const }
    : resolvedMedia;

  return {
    extractedUrl,
    bodyWithoutUrl: (isOgThumbnail || !bodyVideoUrl) ? body : bodyWithoutUrl,
    displayDomain,
    bodyVideoUrl,
    resolvedMedia: finalMedia,
    resolvedMediaList: isOgThumbnail
      ? []
      : (media ?? []).map((m) => {
          const redgifs = m.type === "gif" ? resolveRedgifsVideoUrl(m.uri) : null;
          return {
            ...m,
            uri: redgifs ?? (m.type === "video" ? normalizeVideoUrl(m.uri) : m.uri),
            type: redgifs ? ("video" as const) : m.type,
          };
        }),
    hasMultipleMedia: isOgThumbnail ? false : hasMultipleMedia,
    extraMediaCount: isOgThumbnail ? 0 : extraMediaCount,
  };
}

export function postHasPlayableVideo(post?: { media?: Array<{ type?: string; uri?: string }>; body?: string }): boolean {
  const hasMediaVideo = !!post?.media?.some(
    (m) =>
      m.type === "video" ||
      m.type === "youtube" ||
      (m.type === "gif" && typeof m.uri === "string" && m.uri.includes("redgifs.com")),
  );
  if (hasMediaVideo) return true;
  if (!post?.body) return false;
  const url = extractFirstUrl(post.body);
  return !!url && isYouTubeUrl(url);
}
