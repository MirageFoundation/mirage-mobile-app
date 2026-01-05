import type { Post as ApiPost } from "../../types";
import type { Post as UIPost } from "@/src/components/molecules";
import type { ContentWarningType } from "@/src/components/atoms";
import { calculateDisplayPoints } from "../endpoints/posts";

/**
 * Map API tag to UI content warning type
 */
function mapTagToContentWarning(tag: string): ContentWarningType | null {
  const tagMap: Record<string, ContentWarningType> = {
    sensitive: "sensitive",
    adult: "adult",
    nsfw: "nsfw",
    violence: "violence",
    gore: "gore",
    death: "death",
  };
  return tagMap[tag.toLowerCase()] ?? null;
}

/**
 * Transform API Post to UI Post format
 */
export function transformApiPost(apiPost: ApiPost): UIPost {
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
            type: "image" as const,
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
    isFollowing: false, // TODO: Get from user's followed list
    createdAt: apiPost.timestamp * 1000, // Convert seconds to milliseconds
  };
}

/**
 * Transform array of API Posts to UI Posts
 */
export function transformApiPosts(apiPosts: ApiPost[]): UIPost[] {
  return apiPosts.map(transformApiPost);
}
