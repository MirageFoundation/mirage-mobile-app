import type { PostFilters, UserFilters } from "../types";
import { serverQueryRoot } from "../server-runtime";
import {
  normalizeCommentsQueryParams,
  normalizeInboxQueryParams,
  normalizePostsQueryParams,
  normalizeSearchQueryParams,
  normalizeUserPostsQueryParams,
  type InboxQueryParamsInput,
  type PostsQueryParams,
  type SearchQueryParamsInput,
  type UserPostsQueryParams,
  type UserPostsQueryParamsInput,
} from "./request-params";
import {
  normalizeCommunitySlug,
  normalizeTypedCommunitySlug,
  type LensRequest,
} from "@/src/domain/communities";
import { normalizeSearchRequestQuery } from "./search-query";
import { creatorEarningsQueryIdentity } from "@/src/domain/creator-earnings";
import { normalizeUsernameIdentity } from "./username-resolution";

const serverKey = <T extends readonly unknown[]>(...key: T) =>
  [...serverQueryRoot(), ...key] as const;

export const normalizeAccountIdentity = (address?: string | null): string =>
  address?.trim().toLowerCase() || "anonymous";

const viewerKey = (address?: string | null) =>
  ["viewer", normalizeAccountIdentity(address)] as const;

export const getPostsFiltersFromKey = (
  queryKey: readonly unknown[],
): PostsQueryParams | undefined => {
  const value = queryKey.at(-1);
  if (!value || typeof value !== "object") return undefined;
  const params = value as Partial<PostsQueryParams>;
  if (
    typeof params.lens !== "string" ||
    !("team_id" in params) ||
    typeof params.scope !== "string" ||
    typeof params.lens_picks !== "string"
  ) return undefined;
  return normalizePostsQueryParams(params);
};

export const getUserPostsQueryParamsFromKey = (
  queryKey: readonly unknown[],
): UserPostsQueryParams | undefined => {
  const value = queryKey.at(-1);
  if (!value || typeof value !== "object") return undefined;
  const params = value as Partial<UserPostsQueryParams>;
  if (
    typeof params.type !== "string" ||
    typeof params.limit !== "number" ||
    typeof params.allowed_tags !== "string" ||
    typeof params.lens !== "string" ||
    !("team_id" in params) ||
    typeof params.scope !== "string" ||
    typeof params.lens_picks !== "string"
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
  accountStatusRoot: () => serverKey("account", "status"),
  accountStatus: (address: string) =>
    serverKey("account", "status", normalizeAccountIdentity(address)),
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
    return serverKey(
      "posts",
      ...viewerKey(address),
      normalizePostsQueryParams(publicFilters),
    );
  },
  // One key per thread. `get_comments` accepts a post OR comment id and returns
  // the whole thread (ancestors + focused node + reply subtree), so there are no
  // separate root-post-id or comment-context key families any more.
  comments: (
    postId: string,
    address?: string | null,
    lensRequest?: LensRequest,
  ) =>
    serverKey(
      "comments",
      ...viewerKey(address),
      postId,
      normalizeCommentsQueryParams(lensRequest),
    ),
  redgifsMedia: (id: string) => serverKey("media", "redgifs", id.toLowerCase()),
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

  // Communities
  communitiesRoot: () => serverKey("communities"),
  communities: (params: {
    query?: string;
    joined_by?: string | null;
    cursor?: string;
    curated?: boolean;
    limit?: number;
  } = {}) =>
    serverKey("communities", "list", {
      query: normalizeTypedCommunitySlug(params.query ?? ""),
      joined_by: params.joined_by
        ? normalizeAccountIdentity(params.joined_by)
        : null,
      cursor: params.cursor ?? null,
      curated: params.curated ?? null,
      limit: params.limit ?? null,
    }),
  communitiesInfinite: (params: {
    query?: string;
    joined_by?: string | null;
    curated?: boolean;
    limit?: number;
  } = {}) =>
    serverKey("communities", "infinite", {
      query: normalizeTypedCommunitySlug(params.query ?? ""),
      joined_by: params.joined_by
        ? normalizeAccountIdentity(params.joined_by)
        : null,
      curated: params.curated ?? null,
      limit: params.limit ?? null,
    }),
  communityDetailRoot: (slug: string) =>
    serverKey("communities", "detail", normalizeCommunitySlug(slug)),
  community: (slug: string, viewer?: string | null) =>
    serverKey(
      "communities",
      "detail",
      normalizeCommunitySlug(slug),
      ...viewerKey(viewer),
    ),

  curationRoot: () => serverKey("curation"),
  curatorCommunities: (address: string) =>
    serverKey("curation", "curator", normalizeAccountIdentity(address), "communities"),
  curatorInvitationsRoot: () => serverKey("curation", "invitations"),
  curatorInvitations: (address: string) =>
    serverKey("curation", "curator", normalizeAccountIdentity(address), "invitations"),
  communityTeamsRoot: (slug: string) =>
    serverKey("curation", "teams", normalizeCommunitySlug(slug)),
  communityTeams: (
    slug: string,
    params: { include_deleted?: boolean; viewer?: string | null } = {},
  ) =>
    serverKey("curation", "teams", normalizeCommunitySlug(slug), {
      include_deleted: params.include_deleted ?? false,
      viewer: params.viewer ? normalizeAccountIdentity(params.viewer) : null,
    }),
  communityTeamDetailRoot: (slug: string, teamId: string | number) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
    ),
  communityTeamDetail: (slug: string, teamId: string | number) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
      "detail",
    ),
  communityTeamInvitationsRoot: (slug: string, teamId: string | number) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
      "invitations",
    ),
  communityTeamInvitations: (
    slug: string,
    teamId: string | number,
    viewer?: string | null,
  ) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
      "invitations",
      ...viewerKey(viewer),
    ),
  communityTeamModerationRoot: (slug: string, teamId: string | number) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
      "moderation",
    ),
  communityTeamModeration: (
    slug: string,
    teamId: string | number,
    viewer: string | null | undefined,
    postIds: readonly string[],
  ) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
      "moderation",
      ...viewerKey(viewer),
      [...postIds].map((id) => id.toLowerCase()).sort().join(","),
    ),
  communityTeamHiddenUsersRoot: (slug: string, teamId: string | number) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
      "hidden-users",
    ),
  communityTeamHiddenUsers: (
    slug: string,
    teamId: string | number,
    viewer: string | null | undefined,
    params: { offset?: number; limit?: number } = {},
  ) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
      "hidden-users",
      ...viewerKey(viewer),
      { offset: params.offset ?? 0, limit: params.limit ?? 10 },
    ),
  communityTeamHiddenPostsRoot: (slug: string, teamId: string | number) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
      "hidden-posts",
    ),
  communityTeamHiddenPosts: (
    slug: string,
    teamId: string | number,
    viewer: string | null | undefined,
    params: { offset?: number; limit?: number } = {},
  ) =>
    serverKey(
      "curation",
      "team",
      normalizeCommunitySlug(slug),
      String(teamId),
      "hidden-posts",
      ...viewerKey(viewer),
      { offset: params.offset ?? 0, limit: params.limit ?? 10 },
    ),

  creatorEarningsRoot: () => serverKey("creator", "earnings"),
  creatorEarnings: (
    creator: string,
    params: {
      claimable_only?: boolean | string;
      sort?: string | null;
      limit?: number | null;
      cursor?: string | null;
    } = {},
  ) =>
    serverKey(
      "creator",
      "earnings",
      "list",
      normalizeAccountIdentity(creator),
      creatorEarningsQueryIdentity(params),
    ),
  creatorEarningsInfinite: (
    creator: string,
    params: {
      claimable_only?: boolean | string;
      sort?: string | null;
      limit?: number | null;
    } = {},
  ) =>
    serverKey(
      "creator",
      "earnings",
      "infinite",
      normalizeAccountIdentity(creator),
      creatorEarningsQueryIdentity({ ...params, cursor: null }),
    ),
  creatorEarningsTargetsRoot: () => serverKey("creator", "earnings", "targets"),
  creatorEarningsTargets: (
    creator: string,
    epochId: number,
    params: { limit?: number | null; cursor?: string | null } = {},
  ) =>
    serverKey(
      "creator",
      "earnings",
      "targets",
      normalizeAccountIdentity(creator),
      epochId,
      {
        limit: Number.isSafeInteger(params.limit) ? params.limit : 25,
        cursor: params.cursor ? String(params.cursor).trim().toLowerCase() : null,
      },
    ),
  creatorEarningsTargetsInfinite: (
    creator: string,
    epochId: number,
    params: { limit?: number | null } = {},
  ) =>
    serverKey(
      "creator",
      "earnings",
      "targets",
      "infinite",
      normalizeAccountIdentity(creator),
      epochId,
      { limit: Number.isSafeInteger(params.limit) ? params.limit : 25 },
    ),

  // Search
  searchRoot: () => serverKey("search"),
  search: (
    query: string,
    type: string | undefined,
    limit: number | undefined,
    allowedTags: string | undefined,
    viewerAddress: string | null | undefined,
    extras?: SearchQueryParamsInput,
  ) =>
    serverKey(
      "search",
      ...viewerKey(viewerAddress),
      normalizeSearchRequestQuery(query, type),
      type,
      limit,
      allowedTags,
      normalizeSearchQueryParams(extras),
    ),

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

  // Peers
  peers: () => serverKey("peers"),
  peersSource: () => serverKey("peers", "source"),
} as const;
