/**
 * Social Write Endpoints
 *
 * Follow/Unfollow users, topics, moderators
 * Block/Unblock users, posts
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import {
  buildSignedEnvelope,
  canonBaseFollowUser,
  canonBaseUnfollowUser,
  canonBaseFollowTopic,
  canonBaseUnfollowTopic,
  canonBaseFollowModerator,
  canonBaseUnfollowModerator,
  canonBaseBlockUser,
  canonBaseUnblockUser,
  canonBaseBlockPost,
  canonBaseUnblockPost,
} from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";

// ============================================
// Follow User
// ============================================

/**
 * Follow a user
 */
export async function followUser(
  wallet: MirageWallet,
  userAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseFollowUser,
    payloadFields: {
      target: wallet.address,
      user: userAddress,
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/follow_user", payload);
}

/**
 * Unfollow a user
 */
export async function unfollowUser(
  wallet: MirageWallet,
  userAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseUnfollowUser,
    payloadFields: {
      target: wallet.address,
      user: userAddress,
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/unfollow_user", payload);
}

// ============================================
// Follow Topic
// ============================================

/**
 * Follow a topic
 */
export async function followTopic(
  wallet: MirageWallet,
  topic: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseFollowTopic,
    payloadFields: {
      target: wallet.address,
      topic: topic.toLowerCase(),
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/follow_topic", payload);
}

/**
 * Unfollow a topic
 */
export async function unfollowTopic(
  wallet: MirageWallet,
  topic: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseUnfollowTopic,
    payloadFields: {
      target: wallet.address,
      topic: topic.toLowerCase(),
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/unfollow_topic", payload);
}

// ============================================
// Follow Moderator
// ============================================

/**
 * Follow a moderator
 */
export async function followModerator(
  wallet: MirageWallet,
  moderatorAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseFollowModerator,
    payloadFields: {
      target: wallet.address,
      moderator: moderatorAddress,
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/follow_moderator", payload);
}

/**
 * Unfollow a moderator
 */
export async function unfollowModerator(
  wallet: MirageWallet,
  moderatorAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseUnfollowModerator,
    payloadFields: {
      target: wallet.address,
      moderator: moderatorAddress,
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/unfollow_moderator", payload);
}

// ============================================
// Block User
// ============================================

/**
 * Block a user
 */
export async function blockUser(
  wallet: MirageWallet,
  userAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseBlockUser,
    payloadFields: {
      target: userAddress,
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/block_user", payload);
}

/**
 * Unblock a user
 */
export async function unblockUser(
  wallet: MirageWallet,
  userAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseUnblockUser,
    payloadFields: {
      target: userAddress,
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/unblock_user", payload);
}

// ============================================
// Block Post
// ============================================

/**
 * Block a post
 */
export async function blockPost(
  wallet: MirageWallet,
  postId: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseBlockPost,
    payloadFields: {
      target: postId,
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/block_post", payload);
}

/**
 * Unblock a post
 */
export async function unblockPost(
  wallet: MirageWallet,
  postId: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseUnblockPost,
    payloadFields: {
      target: postId,
    },
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/unblock_post", payload);
}
