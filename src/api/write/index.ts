/**
 * Write API Module
 *
 * Provides hooks and endpoints for all write operations.
 *
 * Usage:
 * ```tsx
 * import { useVote, usePost, useSetUsername } from '@/src/api/write';
 *
 * // In component
 * const { mutate: vote, isPending } = useVote();
 * vote({ target: postId, direction: 1 });
 * ```
 */

export { mutationKeys } from "./mutation-keys";

// ============================================
// Hooks (recommended for React components)
// ============================================
export {
  // Username
  useSetUsername,
  // Vote
  useVote,
  useVoteWithConfirmation,
  useOptimisticVote,
  // Posts
  usePost,
  usePostWithConfirmation,
  useComment,
  useCommentWithConfirmation,
  useEdit,
  useDelete,
  // Follow
  useFollowUser,
  useUnfollowUser,
  useToggleFollowUser,
  // Community
  useJoinCommunity,
  useLeaveCommunity,
  useToggleCommunityMembership,
  useBlockCommunity,
  useUnblockCommunity,
  useSetCommunityPreference,
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
  useClaimCreatorRewards,
  // Biography
  useSetBiography,
  // Block
  useBlockUser,
  useUnblockUser,
  useBlockPost,
  useUnblockPost,
  // Tokens & Subscription
  useSendTokens,
  useUpgradeLevel,
  useSetAutoRenewal,
  // Moderation
  useReport,
  // Delete User
  useDeleteUser,
  // Award
  useGiveAward,
} from "./hooks";

// Hook types
export type {
  VoteMutationInput,
  UseVoteOptions,
  CreatePostMutationInput,
  EditPostMutationInput,
  UsePostOptions,
  UseFollowOptions,
  UseBlockOptions,
  UseSendTokensOptions,
  UseReportOptions,
  ToggleFollowUserParams,
  UseCommunityMembershipOptions,
  JoinCommunityMutationInput,
  ToggleCommunityMembershipInput,
  SetCommunityPreferenceInput,
} from "./hooks";

// ============================================
// Endpoints (for direct API calls)
// ============================================
export {
  // Username
  setUsername,
  // Posts
  createPost,
  createComment,
  editPost,
  deletePost,
  // Vote
  vote,
  upvote,
  downvote,
  removeVote,
  // Social
  followUser,
  unfollowUser,
  blockUser,
  unblockUser,
  blockPost,
  unblockPost,
  joinCommunity,
  leaveCommunity,
  blockCommunity,
  unblockCommunity,
  setCommunityPreference,
  // Biography
  setBiography,
  // Tokens
  sendTokens,
  upgradeLevel,
  setAutoRenewal,
  // Moderation
  report,
  // Delete User
  deleteUser,
  // Award
  giveAward,
} from "./endpoints";

// Endpoint types
export type {
  SetUsernameInput,
  CreatePostInput,
  CreateCommentInput,
  EditPostInput,
  DeletePostInput,
  ContentTag,
  VoteInput,
  VoteDirection,
  SendTokensInput,
  SubscriptionLevel,
  ReportInput,
  DeleteUserInput,
  GiveAwardInput,
} from "./endpoints";

// ============================================
// Signing utilities (for advanced usage)
// ============================================
export {
  // Envelope builder
  buildSignedEnvelope,
  // Canonical byte builders
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
  canonBaseClaimCreatorRewards,
  canonBaseSendTokens,
  canonBaseUpgradeLevel,
  canonBaseSetAutoRenewal,
  canonBaseReport,
  canonBaseDeleteUser,
  canonBaseAward,
  // Low-level utilities
  canonSignedWithPow,
  uvarint,
  encBytes,
  encString,
  encU64,
  prefix,
  // Error handling
  WriteApiError,
  WriteErrorCode,
} from "./signing";

// Signing types
export type {
  SignedEnvelope,
  SignedPayload,
  WriteResponse,
  ReportResponse,
  EnvelopeParams,
  PoWProgress,
  PoWProgressCallback,
  BaseParams,
  SetUsernameParams,
  PostParams,
  EditParams,
  VoteParams,
  DeleteParams,
  SetBiographyParams,
  FollowUserParams,
  BlockPostParams,
  BlockUserParams,
  JoinCommunityParams,
  LeaveCommunityParams,
  BlockCommunityParams,
  SetCurationPreferenceParams,
  SendTokensParams,
  UpgradeLevelParams,
  SetAutoRenewalParams,
  ReportParams,
  DeleteUserParams,
  AwardParams,
} from "./signing";
