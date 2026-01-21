import type { ContentWarningType } from "@/src/components/atoms";
import type { Post as UIPost } from "@/src/components/molecules";
import type { Post as ApiPost } from "../../types";
import { calculateDisplayPoints } from "../endpoints/posts";

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
const GIF_EXTENSIONS = new Set(["gif"]);

function getMediaTypeFromUrl(url: string): "image" | "video" | "gif" {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname.includes("videodelivery.net")) {
      return "video";
    }
    const path = parsedUrl.pathname.toLowerCase();
    const extension = path.split(".").pop() ?? "";
    if (GIF_EXTENSIONS.has(extension)) return "gif";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
  } catch {
    const path = url.toLowerCase().split("?")[0];
    const extension = path.split(".").pop() ?? "";
    if (url.includes("videodelivery.net")) return "video";
    if (GIF_EXTENSIONS.has(extension)) return "gif";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
  }

  return "image";
}

/**
 * Map API tag to UI content warning type
 */
function mapTagToContentWarning(tag: string): ContentWarningType | null {
  const tagMap: Record<string, ContentWarningType> = {
    sensitive: "sensitive",
    adult: "adult",
    nsfw: "nsfw",
    porn: "adult",
    violence: "violence",
    gore: "gore",
    death: "death",
  };
  return tagMap[tag.toLowerCase()] ?? null;
}

/**
 * Options for transforming API posts
 */
export interface TransformPostOptions {
  /** List of user addresses that the current user is following */
  followedUsers?: string[];
}

/**
 * Transform API Post to UI Post format
 * @param apiPost - The API post data
 * @param options - Optional transform options including followed users list
 */
export function transformApiPost(
  apiPost: ApiPost,
  options: TransformPostOptions = {}
): UIPost {
  const { followedUsers = [] } = options;

  // Get content warnings from tag
  const contentWarnings: ContentWarningType[] = [];
  if (apiPost.tag) {
    const warning = mapTagToContentWarning(apiPost.tag);
    if (warning) {
      contentWarnings.push(warning);
    }
  }

  // Calculate display points (adjusts for user's own vote)
  const displayPoints = calculateDisplayPoints(apiPost);

  // Determine if user has liked/disliked based on user_vote
  const hasLiked = apiPost.user_vote === 1;
  const hasDisliked = apiPost.user_vote === -1;

  // Check if the post author is in the followed users list
  const isFollowing = followedUsers.includes(apiPost.user_id);

  return {
    id: apiPost.post_id,
    author: {
      id: apiPost.user_id,
      username: apiPost.username,
      avatarSeed: apiPost.username, // Use username as seed for DiceBear
    },
    title: apiPost.title,
    body: apiPost.content || undefined,
    topic: apiPost.topic || undefined,
    media: apiPost.thumbnail
      ? [
          {
            uri: apiPost.thumbnail,
            type: getMediaTypeFromUrl(apiPost.thumbnail),
            aspectRatio: 16 / 9, // Default, could be extracted from URL or metadata
          },
        ]
      : undefined,
    contentWarnings: contentWarnings.length > 0 ? contentWarnings : undefined,
    likes: Math.max(0, displayPoints), // Display positive points as likes
    dislikes: Math.max(0, -displayPoints), // Display negative points as dislikes (inverted)
    comments: apiPost.comments,
    hasLiked,
    hasDisliked,
    isFollowing,
    createdAt: apiPost.timestamp * 1000, // Convert seconds to milliseconds
  };
}

/**
 * Transform array of API Posts to UI Posts
 * @param apiPosts - Array of API post data
 * @param options - Optional transform options including followed users list
 */
export function transformApiPosts(
  apiPosts: ApiPost[],
  options: TransformPostOptions = {}
): UIPost[] {
  return apiPosts.map((post) => transformApiPost(post, options));
}
