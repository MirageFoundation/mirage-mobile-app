import type { ContentWarningType } from "@/src/components/atoms";
import type { Post as UIPost } from "@/src/components/molecules";
import type { Post as ApiPost } from "../../types";
import { usePostEditStore } from "@/src/stores/post-edit-store";
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

const YOUTUBE_HOSTNAMES = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

function isYouTubeUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return YOUTUBE_HOSTNAMES.has(parsedUrl.hostname);
  } catch {
    return false;
  }
}

function getMediaTypeFromUrl(url: string): "image" | "video" | "gif" | "youtube" {
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
    if (GIF_EXTENSIONS.has(extension)) return "gif";
    if (VIDEO_EXTENSIONS.has(extension)) return "video";
  } catch {
    const path = url.toLowerCase().split("?")[0];
    const extension = path.split(".").pop() ?? "";
    if (url.includes("cloudflarestream.com")) return "video";
    if (url.includes("videodelivery.net")) return "video";
    if (url.includes("redgifs.com")) return "gif";
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
    adult: "porn",
    nsfw: "nsfw",
    porn: "porn",
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
  /** Current user info for resolving own username on new posts */
  currentUser?: { id: string; username: string | null };
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
  const { followedUsers = [], currentUser } = options;

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

  const editOverride = usePostEditStore.getState().overrides[apiPost.post_id];
  const title = editOverride?.title ?? apiPost.title;
  const content = editOverride?.content ?? apiPost.content;
  const topic = editOverride?.topic ?? apiPost.topic;
  const mediaList = editOverride?.media ?? apiPost.media;

  return {
    id: apiPost.post_id,
    author: {
      id: apiPost.user_id,
      username: currentUser && currentUser.id === apiPost.user_id && currentUser.username && apiPost.username === apiPost.user_id
        ? currentUser.username
        : apiPost.username,
      avatarSeed: apiPost.username,
    },
    title,
    body: content || undefined,
    topic: topic || undefined,
    media: mediaList && mediaList.length > 0
      ? mediaList.map((url) => ({
          uri: url,
          type: getMediaTypeFromUrl(url),
        }))
      : apiPost.thumbnail
        ? [
            {
              uri: apiPost.thumbnail,
              type: getMediaTypeFromUrl(apiPost.thumbnail),
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
    awards: apiPost.awards ?? [],
    agentEdited: apiPost.agent_edited ?? false,
    agentEditsMeta: apiPost.agent_edits_meta,
    appendices: apiPost.appendices,
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
