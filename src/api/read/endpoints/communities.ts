import { api } from "../../client";
import {
  normalizeCommunitySlug,
  normalizeTypedCommunitySlug,
  type CommunitiesResponse,
  type CommunityDetail,
} from "@/src/domain/communities";

export type {
  CommunitiesResponse,
  CommunityDetail,
  CommunitySummary,
  CommunityTeamSummary,
} from "@/src/domain/communities";

export interface GetCommunitiesParams {
  query?: string;
  joined_by?: string;
  cursor?: string;
  curated?: boolean;
  limit?: number;
}

export interface GetCommunityParams {
  slug: string;
  viewer?: string;
}

function encodeCommunitySlug(slug: string): string {
  return encodeURIComponent(normalizeCommunitySlug(slug));
}

export function selectCommunitySlugs(
  response?: CommunitiesResponse | null,
): string[] {
  return (response?.items ?? []).map((item) => item.community);
}

export async function getCommunities(
  params?: GetCommunitiesParams,
  options?: { signal?: AbortSignal },
): Promise<CommunitiesResponse> {
  const query = params?.query
    ? normalizeTypedCommunitySlug(params.query)
    : undefined;
  return api.get<CommunitiesResponse>(
    "/communities",
    {
      ...params,
      ...(query ? { query } : {}),
    },
    options,
  );
}

export async function getCommunity(
  params: GetCommunityParams,
  options?: { signal?: AbortSignal },
): Promise<CommunityDetail> {
  const slug = encodeCommunitySlug(params.slug);
  return api.get<CommunityDetail>(
    `/communities/${slug}`,
    params.viewer ? { viewer: params.viewer.trim().toLowerCase() } : undefined,
    options,
  );
}
