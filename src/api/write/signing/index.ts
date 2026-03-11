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
  canonBaseEnableAgent,
  canonBaseDisableAgent,
  canonBaseSetAgents,
  canonBaseSetBiography,
  canonBaseAnnotate,
  canonBaseFollowUser,
  canonBaseUnfollowUser,
  canonBaseFollowTopic,
  canonBaseUnfollowTopic,
  canonBaseBlockPost,
  canonBaseUnblockPost,
  canonBaseBlockUser,
  canonBaseUnblockUser,
  canonBaseBlockTopic,
  canonBaseUnblockTopic,
  canonBaseSendTokens,
  canonBaseUpgradeLevel,
  canonBaseSetAutoRenewal,
  canonBaseReport,
  canonBaseClaimReward,
  canonBaseDeleteUser,
  canonBaseAward,
  // Types
  type BaseParams,
  type SetUsernameParams,
  type PostParams,
  type EditParams,
  type VoteParams,
  type DeleteParams,
  type EnableAgentParams,
  type SetAgentsParams,
  type SetBiographyParams,
  type AnnotateParams,
  type FollowUserParams,
  type FollowTopicParams,
  type BlockPostParams,
  type BlockUserParams,
  type BlockTopicParams,
  type SendTokensParams,
  type UpgradeLevelParams,
  type SetAutoRenewalParams,
  type ReportParams,
  type ClaimRewardParams,
  type DeleteUserParams,
  type AwardParams,
} from "./canonical";

// Envelope builder
export { buildSignedEnvelope, buildEnvelopeWithParams } from "./envelope";
