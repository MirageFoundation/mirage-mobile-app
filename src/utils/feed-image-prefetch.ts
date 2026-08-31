import type { Post } from "@/src/api/types";

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

function isPrefetchableImageUri(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname.includes("youtube.com") || hostname === "youtu.be") return false;
    if (hostname.includes("redgifs.com")) return false;
    const extension = parsed.pathname.toLowerCase().split(".").pop() ?? "";
    if (extension === "gif" || extension === "gifv") return false;
    if (VIDEO_EXTENSIONS.has(extension)) return false;
    return true;
  } catch {
    return false;
  }
}

export function getPrefetchableFeedImageUris(posts: Post[]): string[] {
  const uris: string[] = [];
  const seen = new Set<string>();
  const add = (uri?: string) => {
    if (!uri || seen.has(uri) || !isPrefetchableImageUri(uri)) return;
    seen.add(uri);
    uris.push(uri);
  };

  for (const post of posts) {
    add(post.thumbnail);
    for (const uri of post.media ?? []) add(uri);
  }
  return uris;
}

export function prefetchFeedImages(posts: Post[]): void {
  const uris = getPrefetchableFeedImageUris(posts);
  if (uris.length === 0) return;
  void import("expo-image").then(({ Image }) =>
    Image.prefetch(uris, { cachePolicy: "memory-disk" }),
  ).catch(() => {});
}
