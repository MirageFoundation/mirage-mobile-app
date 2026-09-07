import { api } from "../../client";
import type {
  NetworkStatsResponse,
  CirculationStatsResponse,
  AppStatsResponse,
  LeaderboardResponse,
  PeersResponse,
  WelcomeStatsResponse,
} from "../../types";

// ============================================
// Network Stats
// ============================================

/**
 * Get network statistics including difficulty history
 */
export async function getNetworkStats(): Promise<NetworkStatsResponse> {
  return api.get<NetworkStatsResponse>("/get_network_stats");
}

/**
 * Get circulation statistics including top accounts
 */
export async function getCirculationStats(): Promise<CirculationStatsResponse> {
  return api.get<CirculationStatsResponse>("/get_circulation_stats");
}

/**
 * Get app-wide statistics
 */
export async function getAppStats(): Promise<AppStatsResponse> {
  return api.get<AppStatsResponse>("/get_stats");
}

export async function getWelcomeStats(): Promise<WelcomeStatsResponse> {
  return api.get<WelcomeStatsResponse>("/get_welcome_stats");
}

// ============================================
// Leaderboard
// ============================================

export interface GetLeaderboardParams {
  days?: number; // 1-30
  limit?: number; // max 500
  page?: number;
  // Weight params
  comment_weight?: number;
  post_weight?: number;
  points_received_weight?: number;
  votes_cast_weight?: number;
  deleted_post_weight?: number;
  deleted_comment_weight?: number;
}

/**
 * Get leaderboard with customizable scoring weights
 */
export async function getLeaderboard(
  params?: GetLeaderboardParams
): Promise<LeaderboardResponse> {
  return api.get<LeaderboardResponse>("/leaderboard", params);
}

// ============================================
// Peers
// ============================================

/**
 * Get list of network peers
 */
export async function getPeers(): Promise<PeersResponse> {
  return api.get<PeersResponse>("/get_peers");
}
