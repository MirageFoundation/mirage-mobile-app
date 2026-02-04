import { api } from "../../client";
import type { SearchResponse } from "../../types";

export interface SearchParams {
  q: string;
  type?: "topics" | "users" | "posts";
  limit?: number; // max 50
  offset?: number;
  address?: string; // Viewer for blocked filtering
}

/**
 * Search across topics, users, and posts
 * Prefix @ for users, # for topics
 */
export async function search(params: SearchParams): Promise<SearchResponse> {
  return api.get<SearchResponse>("/search", params);
}
