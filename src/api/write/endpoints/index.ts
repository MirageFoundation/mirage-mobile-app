/**
 * Write API Endpoints
 *
 * All POST endpoints for write operations
 */

// Username
export { setUsername } from "./username";
export type { SetUsernameInput } from "./username";

// Posts
export {
  createPost,
  createComment,
  editPost,
  deletePost,
} from "./posts";
export type {
  CreatePostInput,
  CreateCommentInput,
  EditPostInput,
  DeletePostInput,
  ContentTag,
} from "./posts";

// Vote
export { vote, upvote, downvote, removeVote } from "./vote";
export type { VoteInput, VoteDirection } from "./vote";

// Social
export {
  followUser,
  unfollowUser,
  followTopic,
  unfollowTopic,
  enableAgent,
  disableAgent,
  setAgents,
  blockUser,
  unblockUser,
  blockPost,
  unblockPost,
  blockTopic,
  unblockTopic,
} from "./social";

// Biography
export { setBiography } from "./biography";

// Annotate (Agent-only)
export { annotate } from "./annotate";
export type { AnnotateInput } from "./annotate";

// Tokens & Subscription
export { sendTokens, upgradeLevel, setAutoRenewal } from "./tokens";
export type { SendTokensInput, SubscriptionLevel } from "./tokens";

// Moderation
export { report } from "./moderation";
export type { ReportInput } from "./moderation";

// Rewards
export { claimReward } from "./rewards";
export type { ClaimRewardInput, ClaimRewardResponse } from "./rewards";

// Inbox
export { markInboxViewed } from "./inbox";
export type { MarkInboxViewedResponse } from "./inbox";

// Push Token
export { registerPushToken, unregisterPushToken } from "./push-token";
export type { PushTokenResponse } from "./push-token";

// Delete User
export { deleteUser } from "./delete-user";
export type { DeleteUserInput } from "./delete-user";

// Award
export { giveAward } from "./award";
export type { GiveAwardInput } from "./award";

// Referral
export { referralPrecheckOptIn } from "./referral-precheck-opt-in";
export type { ReferralPrecheckOptInInput } from "./referral-precheck-opt-in";
