import { api } from "../../client";
import type { TopicsResponse, SearchTopicsResponse } from "../../types";

export interface GetTopicsParams {
  limit?: number; // max 200
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
}

/**
 * Search topics by query
 */
export async function searchTopics(
  params: SearchTopicsParams
): Promise<SearchTopicsResponse> {
  return api.get<SearchTopicsResponse>("/search_topics", params);
}
