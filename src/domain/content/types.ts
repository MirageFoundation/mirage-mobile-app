import type { AwardBadge } from "@/src/api/types";
import type { ContentWarningType } from "./content-warning-options";

export type { ContentWarningType } from "./content-warning-options";

export type Community = {
  id: string;
  name: string;
  avatar?: string;
  memberCount: number;
  description?: string;
  isSubscribed: boolean;
  isNewTopic?: boolean;
};

export type AttachmentType = "link" | "image" | "video" | "poll" | null;

export type PostDraft = {
  community: Community | null;
  topic: string | null;
  title: string;
  body: string;
  contentWarning: string[];
  mediaUris: string[];
  stickerUrls?: string[];
  linkUrl: string | null;
  attachmentType: AttachmentType;
  tags: string[];
};

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
  downloadUri?: string;
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
  optimisticVideoPreviewUntil?: number;
  appendices?: { agent: string; agentUsername?: string; text: string }[];
};

export type CommentAuthor = {
  id: string;
  username: string;
  avatarSeed?: string;
  avatarUrl?: string;
  level?: number;
  isNewUser?: boolean;
};

export type Comment = {
  id: string;
  author: CommentAuthor;
  content: string;
  likes: number;
  dislikes: number;
  hasLiked?: boolean;
  hasDisliked?: boolean;
  createdAt: Date | string | number;
  replies?: Comment[];
  replyCount?: number;
  parentId?: string | null;
  depth?: number;
  isFocusedContext?: boolean;
  isFocusedComment?: boolean;
  awards?: AwardBadge[];
  hasMoreReplies?: boolean;
};
