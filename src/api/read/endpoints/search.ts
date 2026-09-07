import { api } from "../../client";
import type { SearchResponse } from "../../types";
import type { LensMode } from "@/src/domain/communities";
import { applyLensHttpParams } from "../request-params";
import { normalizeSearchRequestQuery } from "../search-query";
import { withSignedContentReadParams } from "../signed-content-read";

export interface SearchParams {
  q: string;
  type?: "communities" | "users" | "posts";
  limit?: number; // max 50
  offset?: number;
  address?: string; // Viewer for blocked filtering
  allowed_tags?: string;
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
}

/**
 * Search across communities, users, and posts
 * Prefix @ for users, # for communities
 */
export async function search(params: SearchParams, options?: { signal?: AbortSignal }): Promise<SearchResponse> {
  const paramsFactory = () => withSignedContentReadParams(
    applyLensHttpParams({
      ...params,
      q: normalizeSearchRequestQuery(params.q, params.type),
    } as Record<string, unknown>),
    "get_posts",
  );
  return api.get<SearchResponse>("/search", undefined, { ...options, paramsFactory });
}
