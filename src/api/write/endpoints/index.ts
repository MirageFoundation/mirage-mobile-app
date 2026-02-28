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
  followModerator,
  unfollowModerator,
  blockUser,
  unblockUser,
  blockPost,
  unblockPost,
  blockTopic,
  unblockTopic,
} from "./social";

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

// Delete User
export { deleteUser } from "./delete-user";
export type { DeleteUserInput } from "./delete-user";
