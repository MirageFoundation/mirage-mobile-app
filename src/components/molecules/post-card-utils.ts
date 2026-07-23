import type { ContentWarningType } from "@/src/domain/content";
import type { PostMedia } from "./post-card-types";

const MARKDOWN_LINK_REGEX = /!?\[[^\]]*\]\([^)]+\)/g;
// Regex to find standalone URLs (not inside markdown links)
const STANDALONE_URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]()]+/gi;
const MATURE_CONTENT_WARNING_TYPES = new Set<ContentWarningType>([
  "adult",
  "violence",
  "gore",
  "death",
  "nsfw",
]);

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
  posterUri?: string;
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

export function shouldBlurMatureMedia(
  blurMatureMedia: boolean,
  contentWarnings: ContentWarningType[] | undefined,
  contentRevealed: boolean,
): boolean {
  return (
    blurMatureMedia &&
    !contentRevealed &&
    !!contentWarnings?.some((warning) => MATURE_CONTENT_WARNING_TYPES.has(warning))
  );
}

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

export function resolveRedgifsPosterUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes("redgifs.com")) return null;
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(parsedUrl.pathname)) {
      return url;
    }
    return url
      .replace(/-(mobile|sd|hd)\.(mp4|m4v|webm)$/i, "-poster.jpg")
      .replace(/\.(mp4|m4v|webm)$/i, "-poster.jpg");
  } catch {
    if (!url.includes("redgifs.com")) return null;
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(url)) {
      return url;
    }
    return url
      .replace(/-(mobile|sd|hd)\.(mp4|m4v|webm)$/i, "-poster.jpg")
      .replace(/\.(mp4|m4v|webm)$/i, "-poster.jpg");
  }
}

export function getVideoThumbnailUri(uri?: string, posterUri?: string): string {
  if (!uri) return "";
  if (uri.includes("cloudflarestream.com") || uri.includes("videodelivery.net")) {
    const match = uri.match(/(?:cloudflarestream\.com|videodelivery\.net)\/([a-zA-Z0-9]+)/);
    if (match?.[1]) return `https://videodelivery.net/${match[1]}/thumbnails/thumbnail.jpg?time=1s&width=480`;
  }
  const bunnyThumbnail = getBunnyStreamThumbnailUri(uri);
  if (bunnyThumbnail) return bunnyThumbnail;
  const redgifsPoster = resolveRedgifsPosterUrl(posterUri ?? uri);
  if (redgifsPoster) return redgifsPoster;
  if (posterUri && !isHlsManifestUrl(posterUri)) return posterUri;
  return "";
}

// Bunny Stream delivery: https://{pull-zone}.b-cdn.net/{guid}/playlist.m3u8
// Thumbnail lives at /{guid}/thumbnail.jpg (no "thumbnails/" segment).
function getBunnyStreamThumbnailUri(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (!parsed.hostname.toLowerCase().endsWith(".b-cdn.net")) return null;
    const guid = parsed.pathname.split("/").filter(Boolean)[0];
    if (!guid) return null;
    return `${parsed.origin}/${guid}/thumbnail.jpg`;
  } catch {
    return null;
  }
}

export function isHlsManifestUrl(uri?: string | null): boolean {
  if (!uri) return false;
  try {
    return new URL(uri).pathname.toLowerCase().endsWith(".m3u8");
  } catch {
    return uri.toLowerCase().split("?")[0].endsWith(".m3u8");
  }
}

// Hosted stream videos (Cloudflare Stream, Bunny Stream, or any HLS manifest)
// transcode asynchronously: the manifest can 404/501 right after upload, so
// playback errors are retryable rather than permanent.
export function isHostedStreamVideoUrl(uri?: string | null): boolean {
  if (!uri) return false;
  return (
    uri.includes("cloudflarestream.com") ||
    uri.includes("videodelivery.net") ||
    uri.toLowerCase().includes(".b-cdn.net/") ||
    isHlsManifestUrl(uri)
  );
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
    // Cloudflare Images (used for uploaded images and meme stickers). URLs look
    // like https://imagedelivery.net/<account>/<id>/<variant> and have no file
    // extension, but always resolve to an image.
    if (parsedUrl.hostname.includes("imagedelivery.net")) return true;
    const ext = parsedUrl.pathname.toLowerCase().split(".").pop() ?? "";
    return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
  } catch {
    const path = url.toLowerCase().split("?")[0];
    const ext = path.split(".").pop() ?? "";
    if (url.includes("cloudflarestream.com")) return true;
    if (url.includes("videodelivery.net")) return true;
    if (url.includes("redgifs.com")) return true;
    if (url.includes("imagedelivery.net")) return true;
    return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
  }
}

export function resolvePostContent(
  body: string | undefined,
  media: PostMedia[] | undefined
): ResolvedPostContent {
  const extractedUrl = extractFirstUrl(body);
  const bodyWithoutUrl = removeFirstUrl(body);
  const displayDomain = extractedUrl ? extractDomain(extractedUrl) : null;
  const bodyVideoUrl =
    extractedUrl && (getMediaTypeFromUrl(extractedUrl) === "video" || getMediaTypeFromUrl(extractedUrl) === "youtube")
      ? normalizeVideoUrl(extractedUrl)
      : null;
  const primaryMedia = media?.[0];
  const mediaCount = media?.length ?? 0;
  const hasMultipleMedia = mediaCount > 1;
  const extraMediaCount = mediaCount > 0 ? mediaCount - 1 : 0;

  const resolvedMedia = bodyVideoUrl
    ? (getMediaTypeFromUrl(extractedUrl!) === "youtube"
      ? ({
          uri: extractedUrl!,
          type: "youtube" as const,
          width: primaryMedia?.width,
          height: primaryMedia?.height,
          aspectRatio: primaryMedia?.aspectRatio,
          posterUri: primaryMedia?.posterUri,
        })
      : ({
          uri: bodyVideoUrl,
          type: "video" as const,
          width: primaryMedia?.width,
          height: primaryMedia?.height,
          aspectRatio: primaryMedia?.aspectRatio,
          posterUri: primaryMedia?.posterUri,
        }))
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
    ? {
        ...resolvedMedia,
        uri: redgifsVideoUrl,
        type: "video" as const,
        posterUri: resolvedMedia.posterUri ?? resolvedMedia.uri,
      }
    : resolvedMedia;

  const isBodyUrlRenderedAsMedia =
    !!bodyVideoUrl ||
    (!!extractedUrl &&
      (getMediaTypeFromUrl(extractedUrl) === "gif" || isDirectMediaUrl(extractedUrl)));

  return {
    extractedUrl,
    bodyWithoutUrl: !isBodyUrlRenderedAsMedia ? body : bodyWithoutUrl,
    displayDomain,
    bodyVideoUrl,
    resolvedMedia: finalMedia,
    resolvedMediaList: (media ?? []).map((m) => {
      const redgifs = m.type === "gif" ? resolveRedgifsVideoUrl(m.uri) : null;
      return {
        ...m,
        uri: redgifs ?? (m.type === "video" ? normalizeVideoUrl(m.uri) : m.uri),
        type: redgifs ? ("video" as const) : m.type,
        posterUri: redgifs ? (m.posterUri ?? m.uri) : m.posterUri,
      };
    }),
    hasMultipleMedia,
    extraMediaCount,
  };
}

export function postHasPlayableVideo(post?: { media?: { type?: string; uri?: string }[]; body?: string }): boolean {
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

export function isSuccessfulOptimisticPost(
  post: { optimisticStatus?: string },
): boolean {
  return post.optimisticStatus === "success";
}
