/**
 * Posts Write Endpoints
 *
 * POST /core/post - Create post or comment
 * POST /core/edit - Edit post or comment
 * POST /core/delete_post - Delete post or comment
 */

import { api } from "@/src/api/client";
import type { ContentWarningId } from "@/src/domain/content";
import type { MirageWallet } from "@/src/wallet";
import {
  buildSignedEnvelope,
  canonBasePost,
  canonBaseEdit,
  canonBaseDelete,
} from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";

// ============================================
// Types
// ============================================

export type ContentTag = "" | ContentWarningId;

export interface CreatePostInput {
  /** Community slug (required for posts) */
  community: string;
  /** Post title */
  title: string;
  /** Post content */
  content: string;
  /** Content tag for NSFW/etc. content */
  tag?: ContentTag;
  /** Media URLs (max 10) */
  media?: string[];
}

export interface CreateCommentInput {
  /** Parent post/comment txhash */
  parentId: string;
  /** Comment content */
  content: string;
  /** Comment title (optional) */
  title?: string;
  /** Content tag */
  tag?: ContentTag;
  /** Media URLs (max 10) */
  media?: string[];
  /** Root post txhash for cache updates when replying to nested comments */
  rootPostId?: string;
}

export interface EditPostInput {
  /** txhash of post being edited */
  postId: string;
  /** Community (required for posts, empty for comments) */
  community?: string;
  /** New title */
  title: string;
  /** New content */
  content: string;
  /** Content tag */
  tag?: ContentTag;
  /** Parent txhash (for comments) */
  parentId?: string;
  /** Media URLs (max 10, full replacement) */
  media?: string[];
}

export interface DeletePostInput {
  /** txhash of post/comment to delete */
  postId: string;
  /** Root post txhash when deleting a comment */
  rootPostId?: string;
}

// ============================================
// Endpoints
// ============================================

/**
 * Create a new post
 */
export async function createPost(
  wallet: MirageWallet,
  input: CreatePostInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const { community, title, content, tag = "", media } = input;

  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBasePost,
      payloadFields: {
        target: "",
        community,
        title,
        content,
        tag,
        media: media ?? [],
        protocol_version: 1,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/post", payload);
  }, "createPost");
}

/**
 * Create a comment on a post or another comment
 */
export async function createComment(
  wallet: MirageWallet,
  input: CreateCommentInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const { parentId, content, title = "", tag = "", media } = input;

  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBasePost,
      payloadFields: {
        target: parentId,
        community: "",
        title,
        content,
        tag,
        media: media ?? [],
        protocol_version: 1,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/post", payload);
  }, "createComment");
}

/**
 * Edit an existing post
 */
export async function editPost(
  wallet: MirageWallet,
  input: EditPostInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const { postId, community = "", title, content, tag = "", parentId = "", media } = input;

  if (!postId) {
    throw new Error("editPost: postId is required");
  }

  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseEdit,
      payloadFields: {
        target: parentId,
        community,
        title: title || "",
        content: content || "",
        tag,
        override: postId,
        media: media ?? [],
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/edit", payload);
  }, "editPost");
}

/**
 * Delete a post or comment
 */
export async function deletePost(
  wallet: MirageWallet,
  input: DeletePostInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const { postId } = input;

  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseDelete,
      payloadFields: {
        target: postId,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/delete_post", payload);
  }, "deletePost");
}
