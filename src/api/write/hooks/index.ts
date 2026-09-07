/**
 * Write API Mutation Hooks
 */

// Username
export { useSetUsername } from "./use-set-username";

// Vote
export {
  useVote,
  useVoteWithConfirmation,
  useOptimisticVote,
} from "./use-vote";
export type { VoteMutationInput, UseVoteOptions } from "./use-vote";

// Posts & Comments
export {
  usePost,
  usePostWithConfirmation,
  useComment,
  useCommentWithConfirmation,
  useEdit,
  useDelete,
} from "./use-post";
export type { CreatePostMutationInput, EditPostMutationInput, UsePostOptions } from "./use-post";

// Follow
export {
  useFollowUser,
  useUnfollowUser,
  useToggleFollowUser,
} from "./use-follow";
export type { UseFollowOptions, ToggleFollowUserParams } from "./use-follow";

export {
  useJoinCommunity,
  useLeaveCommunity,
  useToggleCommunityMembership,
  useBlockCommunity,
  useUnblockCommunity,
  useSetCommunityPreference,
  applyCommunityMembershipSettledEffects,
} from "./use-community-membership";

export {
  applyCurationSettledEffects,
  useAcceptCuratorInvite,
  useCreateCurationTeam,
  useDeclineCuratorInvite,
  useDeleteCurationTeam,
  useInviteCurator,
  useLeaveCurationTeam,
  useRemoveCurator,
  useRevokeCuratorInvite,
  useSetCurationPostHidden,
  useSetCurationPostTag,
  useSetCurationSubscriberOnly,
  useSetCurationTag,
  useSetCurationTeamProfile,
  useSetCurationThreadLocked,
  useSetCurationUserHidden,
  useTransferCurationTeam,
} from "./use-curation";
export type {
  UseCommunityMembershipOptions,
  JoinCommunityMutationInput,
  ToggleCommunityMembershipInput,
  SetCommunityPreferenceInput,
} from "./use-community-membership";

// Biography
export { useSetBiography } from "./use-set-biography";

// Block
export {
  useBlockUser,
  useUnblockUser,
  useBlockPost,
  useUnblockPost,
} from "./use-block";
export type { UseBlockOptions } from "./use-block";

// Tokens & Subscription
export {
  useSendTokens,
  useUpgradeLevel,
  useSetAutoRenewal,
} from "./use-send-tokens";
export type { UseSendTokensOptions } from "./use-send-tokens";

// Moderation
export { useReport } from "./use-report";
export type { UseReportOptions } from "./use-report";

export {
  applyCreatorClaimSettledEffects,
  useClaimCreatorRewards,
} from "./use-claim-creator-rewards";

// Delete User
export { useDeleteUser } from "./use-delete-user";

// Award
export { useGiveAward } from "./use-award";

// Gift Subscription
export { useGiftSubscription } from "./use-gift-subscription";
