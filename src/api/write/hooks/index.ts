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
export type { CreatePostMutationInput, UsePostOptions } from "./use-post";

// Follow
export {
  useFollowUser,
  useUnfollowUser,
  useFollowTopic,
  useUnfollowTopic,
  useEnableAgent,
  useDisableAgent,
  useToggleFollowUser,
  useToggleFollowTopic,
} from "./use-follow";
export type { UseFollowOptions, ToggleFollowUserParams, ToggleFollowTopicParams } from "./use-follow";

// Agents
export { useSetAgents } from "./use-set-agents";
export { useAnnotate } from "./use-annotate";

// Biography
export { useSetBiography } from "./use-set-biography";

// Block
export {
  useBlockUser,
  useUnblockUser,
  useBlockPost,
  useUnblockPost,
  useBlockTopic,
  useUnblockTopic,
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

// Rewards
export { useClaimReward } from "./use-claim-reward";

// Delete User
export { useDeleteUser } from "./use-delete-user";

// Award
export { useGiveAward } from "./use-award";

// Gift Subscription
export { useGiftSubscription } from "./use-gift-subscription";
