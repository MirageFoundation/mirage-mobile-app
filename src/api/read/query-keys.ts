import type { PostFilters, UserFilters } from "../types";
import { serverQueryRoot } from "../server-runtime";
import {
  normalizeInboxQueryParams,
  normalizeUserPostsQueryParams,
  type InboxQueryParamsInput,
  type UserPostsQueryParams,
  type UserPostsQueryParamsInput,
} from "./request-params";
import { normalizeUsernameIdentity } from "./username-resolution";

const serverKey = <T extends readonly unknown[]>(...key: T) =>
  [...serverQueryRoot(), ...key] as const;

export const normalizeAccountIdentity = (address?: string | null): string =>
  address?.trim().toLowerCase() || "anonymous";

const viewerKey = (address?: string | null) =>
  ["viewer", normalizeAccountIdentity(address)] as const;

export const getUserPostsQueryParamsFromKey = (
  queryKey: readonly unknown[],
): UserPostsQueryParams | undefined => {
  const value = queryKey.at(-1);
  if (!value || typeof value !== "object") return undefined;
  const params = value as Partial<UserPostsQueryParams>;
  if (
    typeof params.type !== "string" ||
    typeof params.limit !== "number" ||
    typeof params.allowed_tags !== "string"
  ) return undefined;
  return normalizeUserPostsQueryParams(params as UserPostsQueryParams);
};

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
  ) => serverKey(
    "user",
    "posts",
    normalizeAccountIdentity(owner),
    ...viewerKey(viewerAddress),
  ),
  userPosts: (
    owner: string,
    viewerAddress: string | null | undefined,
    params?: UserPostsQueryParamsInput,
  ) => serverKey(
    "user",
    "posts",
    normalizeAccountIdentity(owner),
    ...viewerKey(viewerAddress),
    normalizeUserPostsQueryParams(params),
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
  // One key per thread. `get_comments` accepts a post OR comment id and returns
  // the whole thread (ancestors + focused node + reply subtree), so there are no
  // separate root-post-id or comment-context key families any more.
  comments: (postId: string, address?: string) =>
    serverKey("comments", ...viewerKey(address), postId),
  batchUsernamesRoot: () => serverKey("batchUsernames"),
  batchUsernames: (stableKey: string) => serverKey("batchUsernames", stableKey),

  // Inbox
  inboxRoot: () => serverKey("inbox"),
  inboxForAddress: (address: string) =>
    serverKey("inbox", normalizeAccountIdentity(address)),
  inbox: (
    address: string,
    page?: number,
    params?: InboxQueryParamsInput,
  ) => serverKey(
    "inbox",
    normalizeAccountIdentity(address),
    "page",
    page ?? 1,
    normalizeInboxQueryParams(params),
  ),
  inboxInfinite: (address: string, params?: InboxQueryParamsInput) =>
    serverKey(
      "inbox",
      normalizeAccountIdentity(address),
      "infinite",
      normalizeInboxQueryParams(params),
    ),

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
    serverKey("resolve", "address", normalizeUsernameIdentity(username)),
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
