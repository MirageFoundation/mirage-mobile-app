import {
  normalizeCommunitySlug,
  normalizeLensPicks,
  normalizeLensSelection,
  type LensMode,
  type LensRequest,
  type NormalizeLensSelectionContext,
} from "@/src/domain/communities";
import { getEncodedLensPicks } from "@/src/stores/lens-picks-store";

export type InboxQueryParamsInput = {
  limit?: number;
};

export type InboxQueryParams = Readonly<{
  limit: number;
}>;

export const normalizeInboxQueryParams = (
  params?: InboxQueryParamsInput,
): InboxQueryParams => ({
  limit: Math.min(100, Math.max(1, Math.trunc(params?.limit ?? 25))),
});

export type NormalizedLensIdentity = Readonly<{
  lens: LensMode;
  team_id: number | null;
  scope: "current" | "legacy";
  lens_picks: string;
}>;

export type UserPostsQueryParamsInput = {
  type?: "" | "submissions" | "comments";
  limit?: number;
  allowed_tags?: string;
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
};

export type UserPostsQueryParams = Readonly<{
  type: "" | "submissions" | "comments";
  limit: number;
  allowed_tags: string;
  lens: LensMode;
  team_id: number | null;
  scope: "current" | "legacy";
  lens_picks: string;
}>;

const normalizeAllowedTags = (allowedTags: string | undefined): string => {
  if (allowedTags === undefined) return "sensitive";
  return [...new Set(
    allowedTags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  )].sort().join(",");
};

export function normalizeLensIdentity(
  input?: LensRequest | null,
  context?: NormalizeLensSelectionContext,
): NormalizedLensIdentity {
  const selection = normalizeLensSelection({
    lens: input?.lens,
    team_id: input?.team_id,
    scope: input?.scope,
  }, context);
  return {
    lens: selection.lens,
    team_id: selection.team_id,
    scope: selection.scope,
    lens_picks: normalizeLensPicks(input?.lens_picks),
  };
}

export function withSessionLensPicks<T extends object>(
  params: T & LensRequest,
  viewer?: string | null,
): T & LensRequest & { lens_picks: string } {
  return {
    ...params,
    lens_picks: params.lens_picks ?? getEncodedLensPicks(viewer),
  };
}

export function toHttpLensParams(
  identity: NormalizedLensIdentity,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  const defaultLens = identity.scope === "legacy" ? "raw" : "effective";
  if (identity.scope !== "current") params.scope = identity.scope;
  if (identity.lens !== defaultLens) params.lens = identity.lens;
  if (identity.team_id != null) params.team_id = identity.team_id;
  if (identity.lens_picks) params.lens_picks = identity.lens_picks;
  return params;
}

function omitUndefined(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

export function applyLensHttpParams(
  params: Record<string, unknown> | undefined,
  context?: NormalizeLensSelectionContext,
): Record<string, unknown> {
  const raw = { ...(params ?? {}) };
  const identity = normalizeLensIdentity({
    lens: typeof raw.lens === "string" ? raw.lens as LensMode : undefined,
    team_id: typeof raw.team_id === "number" ? raw.team_id : undefined,
    scope: raw.scope === "current" || raw.scope === "legacy" ? raw.scope : undefined,
    lens_picks: typeof raw.lens_picks === "string" ? raw.lens_picks : undefined,
  }, context);
  delete raw.lens;
  delete raw.team_id;
  delete raw.scope;
  delete raw.lens_picks;
  if (typeof raw.community === "string") {
    const community = normalizeCommunitySlug(raw.community);
    if (community) raw.community = community;
    else delete raw.community;
  }
  return omitUndefined({
    ...raw,
    ...toHttpLensParams(identity),
  });
}

export type PostsQueryParamsInput = {
  limit?: number;
  page?: number | null;
  community?: string;
  allowed_tags?: string;
  feed?: "home" | "following";
  by?: "magic" | "newest" | "top";
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
};

export type PostsQueryParams = Readonly<{
  limit?: number;
  page?: number;
  community?: string;
  allowed_tags?: string;
  feed?: "home" | "following";
  by?: "magic" | "newest" | "top";
  lens: LensMode;
  team_id: number | null;
  scope: "current" | "legacy";
  lens_picks: string;
}>;

export const normalizePostsQueryParams = (
  params: PostsQueryParamsInput = {},
): PostsQueryParams => {
  const community = params.community
    ? normalizeCommunitySlug(params.community)
    : "";
  const identity = normalizeLensIdentity({
    lens: params.lens,
    team_id: params.team_id,
    scope: params.scope,
    lens_picks: params.lens_picks,
  }, { community });

  const normalized: PostsQueryParams = {
    lens: identity.lens,
    team_id: identity.team_id,
    scope: identity.scope,
    lens_picks: identity.lens_picks,
  };
  if (params.limit !== undefined) (normalized as { limit?: number }).limit = params.limit;
  if (params.page !== undefined && params.page !== null) {
    (normalized as { page?: number }).page = params.page;
  }
  if (community) (normalized as { community?: string }).community = community;
  if (params.allowed_tags !== undefined) {
    (normalized as { allowed_tags?: string }).allowed_tags = params.allowed_tags;
  }
  if (params.feed !== undefined) (normalized as { feed?: PostsQueryParams["feed"] }).feed = params.feed;
  if (params.by !== undefined) (normalized as { by?: PostsQueryParams["by"] }).by = params.by;
  return normalized;
};

export type SearchQueryParamsInput = {
  offset?: number;
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
};

export type SearchQueryParams = Readonly<{
  offset: number;
  lens: LensMode;
  team_id: number | null;
  scope: "current" | "legacy";
  lens_picks: string;
}>;

export const normalizeSearchQueryParams = (
  params?: SearchQueryParamsInput,
): SearchQueryParams => {
  const identity = normalizeLensIdentity(params);
  const offset = Math.max(0, Math.trunc(params?.offset ?? 0));
  return {
    offset,
    lens: identity.lens,
    team_id: identity.team_id,
    scope: identity.scope,
    lens_picks: identity.lens_picks,
  };
};

export const normalizeUserPostsQueryParams = (
  params?: UserPostsQueryParamsInput,
): UserPostsQueryParams => {
  const identity = normalizeLensIdentity(params);
  return {
    type: params?.type ?? "",
    limit: Math.min(50, Math.max(1, Math.trunc(params?.limit ?? 10))),
    allowed_tags: normalizeAllowedTags(params?.allowed_tags),
    lens: identity.lens,
    team_id: identity.team_id,
    scope: identity.scope,
    lens_picks: identity.lens_picks,
  };
};

export const normalizeCommentsQueryParams = (
  params?: LensRequest,
): NormalizedLensIdentity =>
  normalizeLensIdentity(params, { allowTeamWithoutCommunity: true });
