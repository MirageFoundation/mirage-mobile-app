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
  useFollowModerator,
  useUnfollowModerator,
  useToggleFollowUser,
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
} from "./hooks";

// Hook types
export type {
  VoteMutationInput,
  UseVoteOptions,
  UsePostOptions,
  UseFollowOptions,
  UseBlockOptions,
  UseSendTokensOptions,
  UseReportOptions,
  ToggleFollowUserParams,
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
  followModerator,
  unfollowModerator,
  blockUser,
  unblockUser,
  blockPost,
  unblockPost,
  // Tokens
  sendTokens,
  upgradeLevel,
  setAutoRenewal,
  // Moderation
  report,
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
  canonBaseFollowModerator,
  canonBaseUnfollowModerator,
  canonBaseFollowUser,
  canonBaseUnfollowUser,
  canonBaseFollowTopic,
  canonBaseUnfollowTopic,
  canonBaseBlockPost,
  canonBaseUnblockPost,
  canonBaseBlockUser,
  canonBaseUnblockUser,
  canonBaseSendTokens,
  canonBaseUpgradeLevel,
  canonBaseSetAutoRenewal,
  canonBaseReport,
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
  FollowModeratorParams,
  FollowUserParams,
  FollowTopicParams,
  BlockPostParams,
  BlockUserParams,
  SendTokensParams,
  UpgradeLevelParams,
  SetAutoRenewalParams,
  ReportParams,
} from "./signing";
