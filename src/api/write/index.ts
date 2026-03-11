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
  useFollowTopic,
  useUnfollowTopic,
  useEnableAgent,
  useDisableAgent,
  useToggleFollowUser,
  useToggleFollowTopic,
  // Agents
  useSetAgents,
  useAnnotate,
  // Biography
  useSetBiography,
  // Block
  useBlockUser,
  useUnblockUser,
  useBlockPost,
  useUnblockPost,
  useBlockTopic,
  useUnblockTopic,
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
  UsePostOptions,
  UseFollowOptions,
  UseBlockOptions,
  UseSendTokensOptions,
  UseReportOptions,
  ToggleFollowUserParams,
  ToggleFollowTopicParams,
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
  // Biography
  setBiography,
  // Annotate
  annotate,
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
  AnnotateInput,
} from "./endpoints";

// ============================================
// Signing utilities (for advanced usage)
// ============================================
export {
  // Envelope builder
  buildSignedEnvelope,
  buildEnvelopeWithParams,
  // Canonical byte builders
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
  EnableAgentParams,
  SetAgentsParams,
  SetBiographyParams,
  AnnotateParams,
  FollowUserParams,
  FollowTopicParams,
  BlockPostParams,
  BlockUserParams,
  BlockTopicParams,
  SendTokensParams,
  UpgradeLevelParams,
  SetAutoRenewalParams,
  ReportParams,
  DeleteUserParams,
  AwardParams,
} from "./signing";
