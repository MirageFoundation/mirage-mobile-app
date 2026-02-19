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
  useFollowModerator,
  useUnfollowModerator,
  useToggleFollowUser,
  useToggleFollowTopic,
} from "./use-follow";
export type { UseFollowOptions, ToggleFollowUserParams, ToggleFollowTopicParams } from "./use-follow";

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

// Rewards
export { useClaimReward } from "./use-claim-reward";

// Delete User
export { useDeleteUser } from "./use-delete-user";
