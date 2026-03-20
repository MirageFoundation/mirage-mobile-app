import { api } from "../../client";
import type { TopicsResponse, SearchTopicsResponse } from "../../types";

export interface GetTopicsParams {
  limit?: number; // max 200
  address?: string;
  allowed_tags?: string;
}

/**
 * Get all topics
 */
export async function getTopics(
  params?: GetTopicsParams
): Promise<TopicsResponse> {
  return api.get<TopicsResponse>("/get_topics", params);
}

export interface SearchTopicsParams {
  q: string; // min 2 chars
  limit?: number; // max 50
  offset?: number;
  allowed_tags?: string;
}

/**
 * Search topics by query
 */
export async function searchTopics(
  params: SearchTopicsParams
): Promise<SearchTopicsResponse> {
  return api.get<SearchTopicsResponse>("/search_topics", params);
}
