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
  blockUser,
  unblockUser,
  blockPost,
  unblockPost,
} from "./social";

export {
  joinCommunity,
  leaveCommunity,
  blockCommunity,
  unblockCommunity,
  setCommunityPreference,
  joinCommunitySettled,
  leaveCommunitySettled,
  blockCommunitySettled,
  unblockCommunitySettled,
  setCommunityPreferenceSettled,
  mapPersistedLensChoice,
  resolveJoinWriteFields,
} from "./community-membership";

export {
  acceptCuratorInvite,
  acceptCuratorInviteSettled,
  createCurationTeam,
  createCurationTeamSettled,
  declineCuratorInvite,
  declineCuratorInviteSettled,
  deleteCurationTeam,
  deleteCurationTeamSettled,
  inviteCurator,
  inviteCuratorSettled,
  leaveCurationTeam,
  leaveCurationTeamSettled,
  removeCurator,
  removeCuratorSettled,
  revokeCuratorInvite,
  revokeCuratorInviteSettled,
  setCurationPostHidden,
  setCurationPostHiddenSettled,
  setCurationPostTag,
  setCurationPostTagSettled,
  setCurationSubscriberOnly,
  setCurationSubscriberOnlySettled,
  setCurationTag,
  setCurationTagSettled,
  setCurationTeamProfile,
  setCurationTeamProfileSettled,
  setCurationThreadLocked,
  setCurationThreadLockedSettled,
  setCurationUserHidden,
  setCurationUserHiddenSettled,
  transferCurationTeam,
  transferCurationTeamSettled,
} from "./curation";
export type {
  CommunityWriteFields,
  PersistedLensChoice,
  SettledCommunityWriteResult,
} from "./community-membership";

// Biography
export { setBiography } from "./biography";

// Tokens & Subscription
export { sendTokens, upgradeLevel, setAutoRenewal, giftSubscription } from "./tokens";
export type { SendTokensInput, SubscriptionLevel, GiftSubscriptionInput } from "./tokens";

// Moderation
export { report } from "./moderation";
export type { ReportInput } from "./moderation";

export {
  claimCreatorRewards,
  claimCreatorRewardsSettled,
} from "./creator-earnings";
export type { ClaimCreatorRewardsInput } from "./creator-earnings";

// Inbox
export { markInboxViewed } from "./inbox";
export type { MarkInboxViewedResponse } from "./inbox";

// Push Token
export { registerPushToken, unregisterPushToken } from "./push-token";
export type { PushTokenResponse } from "./push-token";

export {
  postVisitorAttribution,
  buildVisitorAttributionBody,
  isVisitorAttributionAccepted,
} from "./visitor-attribution";
export type {
  VisitorAttributionRequest,
  VisitorAttributionResponse,
} from "./visitor-attribution";

// Delete User
export { deleteUser } from "./delete-user";
export type { DeleteUserInput } from "./delete-user";

// Award
export { giveAward } from "./award";
export type { GiveAwardInput } from "./award";


