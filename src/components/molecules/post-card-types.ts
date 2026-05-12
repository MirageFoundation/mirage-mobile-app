import type { ContentWarningType } from "@/src/components/atoms";
import type { AwardBadge } from "@/src/api/types";
import type { PostDraft } from "@/src/stores/draft-store";

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
  posterUri?: string;
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
  optimisticStatus?: "pending" | "success" | "error";
  optimisticError?: string;
  optimisticActionId?: string;
  optimisticDraft?: PostDraft;
  appendices?: { agent: string; agentUsername?: string; text: string }[];
};
