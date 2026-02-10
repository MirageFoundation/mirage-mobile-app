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
  type: "image" | "video" | "gif";
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

export function getMediaTypeFromUrl(url: string): "image" | "video" | "gif" {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("cloudflarestream.com")) {
      return "video";
    }
    if (parsedUrl.hostname.includes("videodelivery.net")) {
      return "video";
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
    if (extension === "gif") return "gif";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
  }

  return "image";
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
    extractedUrl && getMediaTypeFromUrl(extractedUrl) === "video"
      ? normalizeVideoUrl(extractedUrl)
      : null;
  if (__DEV__ && extractedUrl?.includes("cloudflarestream")) {
    console.log("[resolvePostContent] mediaType:", getMediaTypeFromUrl(extractedUrl), "bodyVideoUrl:", bodyVideoUrl);
  }

  const primaryMedia = media?.[0];
  const mediaCount = media?.length ?? 0;
  const hasMultipleMedia = mediaCount > 1;
  const extraMediaCount = mediaCount > 0 ? mediaCount - 1 : 0;

  const resolvedMedia = bodyVideoUrl
    ? ({ uri: bodyVideoUrl, type: "video" } as const)
    : primaryMedia
    ? {
        ...primaryMedia,
        uri:
          primaryMedia.type === "video"
            ? normalizeVideoUrl(primaryMedia.uri)
            : primaryMedia.uri,
      }
    : undefined;

  return {
    extractedUrl,
    bodyWithoutUrl,
    displayDomain,
    bodyVideoUrl,
    resolvedMedia,
    hasMultipleMedia,
    extraMediaCount,
  };
}
