import {
  extractFirstUrl,
  getMediaTypeFromUrl,
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
  const bodyType = bodyUri ? getMediaTypeFromUrl(bodyUri) : null;
  if (bodyType === "youtube") return false;

  if (bodyType === "video" || bodyType === "gif") return true;

  const firstMedia = media?.[0];
  const firstMediaUri =
    typeof firstMedia === "string" ? firstMedia : firstMedia?.uri;
  const firstUri = firstMediaUri ?? thumbnail ?? bodyUri;
  if (!firstUri) return false;

  const type =
    typeof firstMedia === "object" && firstMedia.type
      ? firstMedia.type
      : getMediaTypeFromUrl(firstUri);
  return type === "image" || type === "video" || type === "gif";
}
