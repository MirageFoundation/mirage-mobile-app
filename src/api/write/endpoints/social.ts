/**
 * Social Write Endpoints
 *
 * Follow/Unfollow users
 * Block/Unblock users, posts
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import {
  buildSignedEnvelope,
  canonBaseFollowUser,
  canonBaseUnfollowUser,
  canonBaseBlockUser,
  canonBaseUnblockUser,
  canonBaseBlockPost,
  canonBaseUnblockPost,
} from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";

// ============================================
// Follow User
// ============================================

export async function followUser(
  wallet: MirageWallet,
  userAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
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
  }, "followUser");
}

export async function unfollowUser(
  wallet: MirageWallet,
  userAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
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
  }, "unfollowUser");
}

// ============================================
// Block User
// ============================================

export async function blockUser(
  wallet: MirageWallet,
  userAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseBlockUser,
      payloadFields: {
        target: userAddress,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/block_user", payload);
  }, "blockUser");
}

export async function unblockUser(
  wallet: MirageWallet,
  userAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseUnblockUser,
      payloadFields: {
        target: userAddress,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/unblock_user", payload);
  }, "unblockUser");
}

// ============================================
// Block Post
// ============================================

export async function blockPost(
  wallet: MirageWallet,
  postId: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseBlockPost,
      payloadFields: {
        target: postId,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/block_post", payload);
  }, "blockPost");
}

export async function unblockPost(
  wallet: MirageWallet,
  postId: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseUnblockPost,
      payloadFields: {
        target: postId,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/unblock_post", payload);
  }, "unblockPost");
}
