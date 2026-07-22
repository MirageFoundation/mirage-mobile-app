import type { PostFilters, UserFilters } from "../types";
import { serverQueryRoot } from "../server-runtime";

const serverKey = <T extends readonly unknown[]>(...key: T) =>
  [...serverQueryRoot(), ...key] as const;

export const queryKeys = {
  // Config & Parameters
  parameters: (address?: string) => serverKey("parameters", address),
  config: () => serverKey("config"),
  nodeConfig: () => serverKey("nodeConfig"),

  // User
  userStatus: (address: string) => serverKey("user", "status", address),
  profile: (address: string) => serverKey("user", "profile", address),
  userPostsRoot: () => serverKey("user", "posts"),
  userPosts: (owner: string, type?: string, allowedTags?: string) =>
    serverKey("user", "posts", owner, type, allowedTags),
  userFollowed: (address: string) => serverKey("user", "followed", address),
  userBlocked: (address: string) => serverKey("user", "blocked", address),
  preferences: (address: string) => serverKey("user", "preferences", address),
  similarUsers: (address: string) => serverKey("user", "similar", address),

  // Posts & Feed
  postsRoot: () => serverKey("posts"),
  commentsRoot: () => serverKey("comments"),
  posts: (filters: PostFilters) => serverKey("posts", filters),
  comments: (postId: string, address?: string) =>
    serverKey("comments", postId, address),
  rootPostId: (commentId: string) => serverKey("rootPostId", commentId),
  commentContextRoot: () => serverKey("commentContext"),
  commentContext: (commentId: string, maxDepth?: number) =>
    serverKey("commentContext", commentId, maxDepth),
  batchUsernamesRoot: () => serverKey("batchUsernames"),
  batchUsernames: (stableKey: string) => serverKey("batchUsernames", stableKey),

  // Inbox
  inbox: (address: string, page?: number) =>
    serverKey("inbox", address, page),
  inboxInfinite: (address: string) =>
    serverKey("inbox", "infinite", address),

  // Topics
  topicsRoot: () => serverKey("topics"),
  topics: (limit?: number, allowedTags?: string) => serverKey("topics", limit, allowedTags),
  searchTopics: (query: string, limit?: number, allowedTags?: string) =>
    serverKey("topics", "search", query, limit, allowedTags),

  // Search
  search: (query: string, type?: string, limit?: number, allowedTags?: string) =>
    serverKey("search", query, type, limit, allowedTags),

  // Username/Address Resolution
  addressFromUsername: (username: string) =>
    serverKey("resolve", "address", username),
  usernameFromAddress: (address: string) =>
    serverKey("resolve", "username", address),
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
  referralStats: (address: string) => serverKey("referral", address),
  referralPrecheck: (username: string) => serverKey("referral", "precheck", username),
  referralSummary: (address: string, period?: string, month?: string) =>
    serverKey("referral", "summary", address, period, month),

  // Peers
  peers: () => serverKey("peers"),
  peersSource: () => serverKey("peers", "source"),

 // Invite Code
 inviteCode: (code: string) => serverKey("inviteCode", code),
 inviteCodes: (address: string) => serverKey("inviteCodes", address),

 // Rewards
 rewardSummary: (address: string) => serverKey("rewards", "summary", address),
 achievements: (address: string) => serverKey("rewards", "achievements", address),

 // Agents
 agents: () => serverKey("agents"),
} as const;
