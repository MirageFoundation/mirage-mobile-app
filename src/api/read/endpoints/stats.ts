import { api } from "../../client";
import type {
  NetworkStatsResponse,
  CirculationStatsResponse,
  AppStatsResponse,
  LeaderboardResponse,
  ReferralStatsResponse,
  PeersResponse,
} from "../../types";

// ============================================
// Network Stats
// ============================================

/**
 * Get network statistics including difficulty history
 */
export async function getNetworkStats(): Promise<NetworkStatsResponse> {
  return api.get<NetworkStatsResponse>("/core/get_network_stats");
}

/**
 * Get circulation statistics including top accounts
 */
export async function getCirculationStats(): Promise<CirculationStatsResponse> {
  return api.get<CirculationStatsResponse>("/core/get_circulation_stats");
}

/**
 * Get app-wide statistics
 */
export async function getAppStats(): Promise<AppStatsResponse> {
  return api.get<AppStatsResponse>("/core/get_stats");
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
  return api.get<LeaderboardResponse>("/core/leaderboard", params);
}

// ============================================
// Referral
// ============================================

export interface GetReferralStatsParams {
  address: string;
}

/**
 * Get referral statistics and tree
 */
export async function getReferralStats(
  params: GetReferralStatsParams
): Promise<ReferralStatsResponse> {
  return api.get<ReferralStatsResponse>("/referral/stats", params);
}

// ============================================
// Peers
// ============================================

/**
 * Get list of network peers
 */
export async function getPeers(): Promise<PeersResponse> {
  return api.get<PeersResponse>("/core/get_peers");
}
