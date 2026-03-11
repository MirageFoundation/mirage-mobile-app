/**
 * Social Write Endpoints
 *
 * Follow/Unfollow users, topics
 * Enable/Disable/Set agents
 * Block/Unblock users, posts, topics
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import {
  buildSignedEnvelope,
  canonBaseFollowUser,
  canonBaseUnfollowUser,
  canonBaseFollowTopic,
  canonBaseUnfollowTopic,
  canonBaseEnableAgent,
  canonBaseDisableAgent,
  canonBaseSetAgents,
  canonBaseBlockUser,
  canonBaseUnblockUser,
  canonBaseBlockPost,
  canonBaseUnblockPost,
  canonBaseBlockTopic,
  canonBaseUnblockTopic,
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
// Follow Topic
// ============================================

export async function followTopic(
  wallet: MirageWallet,
  topic: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
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
  }, "followTopic");
}

export async function unfollowTopic(
  wallet: MirageWallet,
  topic: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
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
  }, "unfollowTopic");
}

// ============================================
// Enable/Disable Agent
// ============================================

export async function enableAgent(
  wallet: MirageWallet,
  agentAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseEnableAgent,
      payloadFields: {
        target: wallet.address,
        agent: agentAddress,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/enable_agent", payload);
  }, "enableAgent");
}

export async function disableAgent(
  wallet: MirageWallet,
  agentAddress: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseDisableAgent,
      payloadFields: {
        target: wallet.address,
        agent: agentAddress,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/disable_agent", payload);
  }, "disableAgent");
}

export async function setAgents(
  wallet: MirageWallet,
  agents: string[],
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseSetAgents,
      payloadFields: {
        target: wallet.address,
        agents,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/set_agents", payload);
  }, "setAgents");
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

// ============================================
// Block Topic
// ============================================

export async function blockTopic(
  wallet: MirageWallet,
  topic: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseBlockTopic,
      payloadFields: {
        target: "",
        topic: topic.toLowerCase(),
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/block_topic", payload);
  }, "blockTopic");
}

export async function unblockTopic(
  wallet: MirageWallet,
  topic: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseUnblockTopic,
      payloadFields: {
        target: "",
        topic: topic.toLowerCase(),
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/unblock_topic", payload);
  }, "unblockTopic");
}
