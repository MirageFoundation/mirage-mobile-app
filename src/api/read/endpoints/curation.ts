import { api } from "../../client";
import {
  normalizeCommunitySlug,
  requireTeamId,
  type CommunityTeamsResponse,
  type CuratorCommunitiesResponse,
  type CuratorInvitationsResponse,
  type CurationTeamDetail,
  type HiddenListResponse,
  type HiddenPostItem,
  type HiddenUserItem,
  type TeamInvitationsResponse,
  type TeamModerationResponse,
} from "@/src/domain/communities";
import {
  buildSignedCuratorReadQuery,
  omitAddressClaim,
} from "../signed-curator-read";

function encodeCommunitySlug(slug: string): string {
  return encodeURIComponent(normalizeCommunitySlug(slug));
}

function teamPath(slug: string, teamId: string | number): string {
  return `/communities/${encodeCommunitySlug(slug)}/teams/${requireTeamId(teamId)}`;
}

export async function getCuratorCommunities(
  address: string,
  options?: { signal?: AbortSignal },
): Promise<CuratorCommunitiesResponse> {
  const viewer = String(address ?? "").trim().toLowerCase();
  if (!viewer) throw new Error("curator address required");
  return api.get<CuratorCommunitiesResponse>(
    `/curators/${encodeURIComponent(viewer)}/communities`,
    undefined,
    options,
  );
}

export async function getCuratorInvitations(
  address: string,
  options?: { signal?: AbortSignal },
): Promise<CuratorInvitationsResponse> {
  const viewer = String(address ?? "").trim().toLowerCase();
  return api.get<CuratorInvitationsResponse>(
    `/curators/${encodeURIComponent(viewer)}/invitations`,
    undefined,
    { ...options, paramsFactory: async () => omitAddressClaim({ ...await buildSignedCuratorReadQuery({ viewer }) }) },
  );
}

export async function getCommunityTeams(
  params: {
    slug: string;
    include_deleted?: boolean;
    viewer?: string | null;
  },
  options?: { signal?: AbortSignal },
): Promise<CommunityTeamsResponse> {
  const slug = encodeCommunitySlug(params.slug);
  const query: Record<string, unknown> = {};
  if (params.include_deleted) query.include_deleted = true;
  if (params.viewer) query.viewer = params.viewer.trim().toLowerCase();
  return api.get<CommunityTeamsResponse>(
    `/communities/${slug}/teams`,
    Object.keys(query).length ? query : undefined,
    options,
  );
}

export async function getCommunityTeam(
  params: { slug: string; teamId: string | number },
  options?: { signal?: AbortSignal },
): Promise<CurationTeamDetail> {
  return api.get<CurationTeamDetail>(
    teamPath(params.slug, params.teamId),
    undefined,
    options,
  );
}

export async function getCommunityTeamInvitations(
  params: { slug: string; teamId: string | number; viewer: string },
  options?: { signal?: AbortSignal },
): Promise<TeamInvitationsResponse> {
  return api.get<TeamInvitationsResponse>(
    `${teamPath(params.slug, params.teamId)}/invitations`,
    undefined,
    { ...options, paramsFactory: async () => omitAddressClaim({ ...await buildSignedCuratorReadQuery({ viewer: params.viewer }) }) },
  );
}

export async function getCommunityTeamModeration(
  params: {
    slug: string;
    teamId: string | number;
    viewer: string;
    postIds: readonly string[];
  },
  options?: { signal?: AbortSignal },
): Promise<TeamModerationResponse> {
  return api.get<TeamModerationResponse>(
    `${teamPath(params.slug, params.teamId)}/moderation`,
    undefined,
    { ...options, paramsFactory: async () => omitAddressClaim({
      ...await buildSignedCuratorReadQuery({ viewer: params.viewer }),
      post_ids: params.postIds.join(","),
    }) },
  );
}

export async function getCommunityTeamHiddenUsers(
  params: {
    slug: string;
    teamId: string | number;
    viewer: string;
    offset?: number;
    limit?: number;
  },
  options?: { signal?: AbortSignal },
): Promise<HiddenListResponse<HiddenUserItem>> {
  return api.get<HiddenListResponse<HiddenUserItem>>(
    `${teamPath(params.slug, params.teamId)}/hidden-users`,
    undefined,
    { ...options, paramsFactory: async () => omitAddressClaim({
      ...await buildSignedCuratorReadQuery({ viewer: params.viewer }),
      offset: params.offset ?? 0,
      limit: params.limit ?? 10,
    }) },
  );
}

export async function getCommunityTeamHiddenPosts(
  params: {
    slug: string;
    teamId: string | number;
    viewer: string;
    offset?: number;
    limit?: number;
  },
  options?: { signal?: AbortSignal },
): Promise<HiddenListResponse<HiddenPostItem>> {
  return api.get<HiddenListResponse<HiddenPostItem>>(
    `${teamPath(params.slug, params.teamId)}/hidden-posts`,
    undefined,
    { ...options, paramsFactory: async () => omitAddressClaim({
      ...await buildSignedCuratorReadQuery({ viewer: params.viewer }),
      offset: params.offset ?? 0,
      limit: params.limit ?? 10,
    }) },
  );
}
