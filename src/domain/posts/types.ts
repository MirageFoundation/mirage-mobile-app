import type { AwardBadge } from "@/src/api/types";
import type { ContentWarningType } from "@/src/domain/content/types";

export type PostAuthor = {
  id: string;
  username: string;
  avatarSeed?: string;
  avatarUrl?: string;
  level?: number;
  isNewUser?: boolean;
};

export type PostMedia = {
  uri: string;
  type: "image" | "video" | "gif" | "youtube";
  width?: number;
  height?: number;
  aspectRatio?: number;
};

export type Post = {
  id: string;
  author: PostAuthor;
  title: string;
  body?: string;
  topic?: string;
  media?: PostMedia[];
  contentWarnings?: ContentWarningType[];
  likes: number;
  dislikes: number;
  comments: number;
  hasLiked?: boolean;
  hasDisliked?: boolean;
  isFollowing?: boolean;
  createdAt: Date | string | number;
  awards?: AwardBadge[];
  agentEdited?: boolean;
  agentEditsMeta?: Record<string, string>;
  appendices?: { agent: string; agentUsername?: string; text: string }[];
};
