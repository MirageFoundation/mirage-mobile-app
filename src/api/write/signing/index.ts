/**
 * Write API Signing Module
 *
 * Exports canonical byte builders, envelope builder, and types
 */

// Types
export type {
  SignedEnvelope,
  SignedPayload,
  WriteResponse,
  ReportResponse,
  EnvelopeParams,
  PoWProgress,
  PoWProgressCallback,
} from "./types";

export { WriteApiError, WriteErrorCode } from "./types";

// Canonical byte builders
export {
  // Utilities
  uvarint,
  encBytes,
  encString,
  encU64,
  prefix,
  canonSignedWithPow,
  // Message builders
  canonBaseSetUsername,
  canonBasePost,
  canonBaseEdit,
  canonBaseVote,
  canonBaseDelete,
  canonBaseSetBiography,
  canonBaseFollowUser,
  canonBaseUnfollowUser,
  canonBaseBlockPost,
  canonBaseUnblockPost,
  canonBaseBlockUser,
  canonBaseUnblockUser,
  canonBaseJoinCommunity,
  canonBaseLeaveCommunity,
  canonBaseBlockCommunity,
  canonBaseUnblockCommunity,
  canonBaseSetCommunityPreference,
  canonBaseCreateCurationTeam,
  canonBaseSetCurationTeamProfile,
  canonBaseInviteCurator,
  canonBaseRevokeCuratorInvite,
  canonBaseAcceptCuratorInvite,
  canonBaseDeclineCuratorInvite,
  canonBaseLeaveCurationTeam,
  canonBaseRemoveCurator,
  canonBaseTransferCurationTeam,
  canonBaseDeleteCurationTeam,
  canonBaseSetCurationPostHidden,
  canonBaseSetCurationUserHidden,
  canonBaseSetCurationThreadLocked,
  canonBaseSetCurationSubscriberOnly,
  canonBaseSetCurationTag,
  canonBaseSetCurationPostTag,
  canonBaseClaimCreatorRewards,
  canonBaseSendTokens,
  canonBaseSubscribe,
  canonBaseUpgradeLevel,
  canonBaseSetAutoRenewal,
  canonBaseReport,
  canonBaseDeleteUser,
  canonBaseAward,
  canonBaseGiftSubscription,
  // Types
  type BaseParams,
  type SetUsernameParams,
  type PostParams,
  type EditParams,
  type VoteParams,
  type DeleteParams,
  type SetBiographyParams,
  type FollowUserParams,
  type BlockPostParams,
  type BlockUserParams,
  type JoinCommunityParams,
  type LeaveCommunityParams,
  type BlockCommunityParams,
  type SetCurationPreferenceParams,
  type CreateCurationTeamParams,
  type SetCurationTeamProfileParams,
  type InviteCuratorParams,
  type CurationTeamIdParams,
  type TransferCurationTeamParams,
  type SetCurationPostHiddenParams,
  type SetCurationThreadLockedParams,
  type SetCurationSubscriberOnlyParams,
  type SetCurationTagParams,
  type SetCurationPostTagParams,
  type ClaimCreatorRewardsParams,
  type SendTokensParams,
  type SubscribeParams,
  type UpgradeLevelParams,
  type SetAutoRenewalParams,
  type ReportParams,
  type DeleteUserParams,
  type AwardParams,
  type GiftSubscriptionParams,
} from "./canonical";

// Envelope builder
export { buildSignedEnvelope } from "./envelope";
