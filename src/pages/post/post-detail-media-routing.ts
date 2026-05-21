import {
  extractFirstUrl,
  getMediaTypeFromUrl,
  isDirectMediaUrl,
} from "@/src/components/molecules/post-card-utils";

type CachedMediaPost = {
  id?: string;
  post_id?: string;
  media?: (string | { uri?: string; type?: string })[];
  thumbnail?: string;
  body?: string;
  content?: string;
  [key: string]: unknown;
};

function getCachedPostId(post: unknown): string | undefined {
  if (!post || typeof post !== "object") return undefined;
  const record = post as CachedMediaPost;
  return record.post_id ?? record.id;
}

export function findPostInCachedData(
  data: unknown,
  postId: string,
  depth = 0,
): CachedMediaPost | null {
  if (!data || depth > 6) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const matched = findPostInCachedData(item, postId, depth + 1);
      if (matched) return matched;
    }
    return null;
  }
  if (typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  if (getCachedPostId(record) === postId) return record as CachedMediaPost;

  const priorityKeys = ["root", "post", "posts", "pages", "data", "items", "children"];
  for (const key of priorityKeys) {
    const matched = findPostInCachedData(record[key], postId, depth + 1);
    if (matched) return matched;
  }

  return null;
}

export function cachedPostHasImmersiveMedia(post: unknown): boolean {
  if (!post || typeof post !== "object") return false;

  const record = post as CachedMediaPost;
  const media = record.media;
  const thumbnail = record.thumbnail;
  const body = record.body ?? record.content;

  const bodyUri = extractFirstUrl(body) ?? undefined;
  // getMediaTypeFromUrl defaults to "image" for any URL, so guard with
  // isDirectMediaUrl to avoid treating plain article links as media.
  const bodyIsDirectMedia = bodyUri ? isDirectMediaUrl(bodyUri) : false;
  const bodyType = bodyIsDirectMedia && bodyUri ? getMediaTypeFromUrl(bodyUri) : null;
  if (bodyType === "youtube") return false;

  if (bodyType === "video" || bodyType === "gif") return true;

  const firstMedia = media?.[0];
  const firstMediaUri =
    typeof firstMedia === "string" ? firstMedia : firstMedia?.uri;
  const explicitMediaType =
    typeof firstMedia === "object" ? firstMedia?.type : undefined;

  // If the server populated `media[0]`, trust it as immersive media. The
  // server only puts entries here for actual uploaded media (e.g. Cloudflare
  // Images URLs that end in `/public` and have no file extension, which
  // `isDirectMediaUrl` would otherwise reject).
  if (firstMediaUri) {
    if (explicitMediaType === "youtube") return false;
    const inferredType = getMediaTypeFromUrl(firstMediaUri);
    if (inferredType === "youtube") return false;
    return true;
  }

  // No explicit media entry: only treat thumbnails/body URLs as immersive when
  // they point at direct media files. Link previews (article URLs with an
  // OG-image thumbnail) must fall through to the standard post detail screen,
  // so we require the body URL itself to be direct media before considering
  // the thumbnail as immersive.
  if (!bodyIsDirectMedia) return false;
  const fallbackUri = bodyUri ?? (thumbnail && isDirectMediaUrl(thumbnail) ? thumbnail : undefined);
  if (!fallbackUri) return false;
  const type = getMediaTypeFromUrl(fallbackUri);
  return type === "image" || type === "video" || type === "gif";
}
