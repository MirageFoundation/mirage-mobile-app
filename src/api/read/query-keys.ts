import type { PostFilters, UserFilters } from "../types";

export const queryKeys = {
  // Config & Parameters
  parameters: (address?: string) => ["parameters", address] as const,
  config: () => ["config"] as const,

  // User
  userStatus: (address: string) => ["user", "status", address] as const,
  profile: (address: string) => ["user", "profile", address] as const,
  userPosts: (owner: string, type?: string) =>
    ["user", "posts", owner, type] as const,
  userFollowed: (address: string) => ["user", "followed", address] as const,
  userBlocked: (address: string) => ["user", "blocked", address] as const,
  preferences: (address: string) => ["user", "preferences", address] as const,
  similarUsers: (address: string) => ["user", "similar", address] as const,

  // Posts & Feed
  posts: (filters: PostFilters) => ["posts", filters] as const,
  comments: (postId: string, address?: string) =>
    ["comments", postId, address] as const,
  rootPostId: (commentId: string) => ["rootPostId", commentId] as const,
  commentContext: (commentId: string, maxDepth?: number) =>
    ["commentContext", commentId, maxDepth] as const,

  // Inbox
  inbox: (address: string, page?: number) =>
    ["inbox", address, page] as const,

  // Topics
  topics: (limit?: number) => ["topics", limit] as const,
  searchTopics: (query: string, limit?: number) =>
    ["topics", "search", query, limit] as const,

  // Search
  search: (query: string, type?: string, limit?: number) =>
    ["search", query, type, limit] as const,

  // Username/Address Resolution
  addressFromUsername: (username: string) =>
    ["resolve", "address", username] as const,
  usernameFromAddress: (address: string) =>
    ["resolve", "username", address] as const,
  users: (filters?: UserFilters) => ["users", filters] as const,

  // Transaction
  txStatus: (hash: string) => ["tx", hash] as const,

  // Stats
  networkStats: () => ["stats", "network"] as const,
  circulationStats: () => ["stats", "circulation"] as const,
  appStats: () => ["stats", "app"] as const,
  welcomeStats: () => ["stats", "welcome"] as const,
  leaderboard: (days?: number, page?: number) =>
    ["leaderboard", days, page] as const,

  // Referral
  referralStats: (address: string) => ["referral", address] as const,

  // Peers
  peers: () => ["peers"] as const,

  // Invite Code
  inviteCode: (code: string) => ["inviteCode", code] as const,
} as const;
