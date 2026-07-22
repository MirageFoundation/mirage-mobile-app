import type { PostFilters, UserFilters } from "../types";
import { serverQueryRoot } from "../server-runtime";

const serverKey = <T extends readonly unknown[]>(...key: T) =>
  [...serverQueryRoot(), ...key] as const;

export const normalizeAccountIdentity = (address?: string | null): string =>
  address?.trim().toLowerCase() || "anonymous";

const viewerKey = (address?: string | null) =>
  ["viewer", normalizeAccountIdentity(address)] as const;

export const queryKeys = {
  // Config & Parameters
  parameters: (address?: string) => serverKey("parameters", ...viewerKey(address)),
  config: () => serverKey("config"),
  nodeConfig: () => serverKey("nodeConfig"),

  // User
  userStatus: (address: string) => serverKey("user", "status", normalizeAccountIdentity(address)),
  profile: (address: string) => serverKey("user", "profile", normalizeAccountIdentity(address)),
  userPostsRoot: () => serverKey("user", "posts"),
  userPostsForOwner: (owner: string) =>
    serverKey("user", "posts", normalizeAccountIdentity(owner)),
  userPostsForViewer: (
    owner: string,
    viewerAddress: string | null | undefined,
    type: string | undefined,
  ) => serverKey(
    "user",
    "posts",
    normalizeAccountIdentity(owner),
    ...viewerKey(viewerAddress),
    type,
  ),
  userPosts: (
    owner: string,
    type: string | undefined,
    allowedTags: string | undefined,
    viewerAddress: string | null | undefined,
  ) => serverKey(
    "user",
    "posts",
    normalizeAccountIdentity(owner),
    ...viewerKey(viewerAddress),
    type,
    allowedTags,
  ),
  userFollowed: (address: string) => serverKey("user", "followed", normalizeAccountIdentity(address)),
  userBlocked: (address: string) => serverKey("user", "blocked", normalizeAccountIdentity(address)),
  preferences: (address: string) => serverKey("user", "preferences", normalizeAccountIdentity(address)),
  similarUsers: (address: string) => serverKey("user", "similar", normalizeAccountIdentity(address)),

  // Posts & Feed
  postsRoot: () => serverKey("posts"),
  commentsRoot: () => serverKey("comments"),
  posts: (filters: PostFilters = {}) => {
    const { address, ...publicFilters } = filters;
    return serverKey("posts", ...viewerKey(address), publicFilters);
  },
  comments: (postId: string, address?: string) =>
    serverKey("comments", ...viewerKey(address), postId),
  rootPostId: (commentId: string) => serverKey("rootPostId", commentId),
  commentContextRoot: () => serverKey("commentContext"),
  commentContext: (
    commentId: string,
    maxDepth: number | undefined,
    viewerAddress: string | null | undefined,
  ) => serverKey("commentContext", ...viewerKey(viewerAddress), commentId, maxDepth),
  batchUsernamesRoot: () => serverKey("batchUsernames"),
  batchUsernames: (stableKey: string) => serverKey("batchUsernames", stableKey),

  // Inbox
  inbox: (address: string, page?: number) =>
    serverKey("inbox", normalizeAccountIdentity(address), page),
  inboxInfinite: (address: string) =>
    serverKey("inbox", "infinite", normalizeAccountIdentity(address)),

  // Topics
  topicsRoot: () => serverKey("topics"),
  topics: (
    limit: number | undefined,
    allowedTags: string | undefined,
    viewerAddress: string | null | undefined,
  ) => serverKey("topics", ...viewerKey(viewerAddress), limit, allowedTags),
  searchTopics: (query: string, limit?: number, allowedTags?: string) =>
    serverKey("topics", "search", query, limit, allowedTags),

  // Search
  search: (
    query: string,
    type: string | undefined,
    limit: number | undefined,
    allowedTags: string | undefined,
    viewerAddress: string | null | undefined,
  ) => serverKey("search", ...viewerKey(viewerAddress), query, type, limit, allowedTags),

  // Username/Address Resolution
  addressFromUsername: (username: string) =>
    serverKey("resolve", "address", username),
  usernameFromAddress: (address: string) =>
    serverKey("resolve", "username", normalizeAccountIdentity(address)),
  users: (filters?: UserFilters) => serverKey("users", filters),

  // Transaction
  txStatus: (hash: string) => serverKey("tx", hash),

  // Stats
  networkStats: () => serverKey("stats", "network"),
  circulationStats: () => serverKey("stats", "circulation"),
  appStats: () => serverKey("stats", "app"),
  welcomeStats: () => serverKey("stats", "welcome"),
  leaderboard: (days?: number, page?: number) =>
    serverKey("leaderboard", days, page),

  // Referral
  referralStats: (address: string) => serverKey("referral", normalizeAccountIdentity(address)),
  referralPrecheck: (username: string) => serverKey("referral", "precheck", username),
  referralSummary: (address: string, period?: string, month?: string) =>
    serverKey("referral", "summary", normalizeAccountIdentity(address), period, month),

  // Peers
  peers: () => serverKey("peers"),
  peersSource: () => serverKey("peers", "source"),

 // Invite Code
 inviteCode: (code: string) => serverKey("inviteCode", code),
 inviteCodes: (address: string) => serverKey("inviteCodes", normalizeAccountIdentity(address)),

 // Rewards
 rewardSummary: (address: string) => serverKey("rewards", "summary", normalizeAccountIdentity(address)),
 achievements: (address: string) => serverKey("rewards", "achievements", normalizeAccountIdentity(address)),

 // Agents
 agents: () => serverKey("agents"),
} as const;
