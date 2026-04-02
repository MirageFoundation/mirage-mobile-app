import { api } from "../../client";
import type {
  ReferralPrecheckResponse,
  ReferralSummaryResponse,
} from "../../types";

export interface GetReferralPrecheckParams {
  username: string;
}

export async function getReferralPrecheck(
  params: GetReferralPrecheckParams
): Promise<ReferralPrecheckResponse> {
  return api.get<ReferralPrecheckResponse>("/referrals/precheck", params);
}

export interface GetReferralSummaryParams {
  address: string;
  period?: "7d" | "30d" | "month";
  month?: string;
  limit?: number;
  offset?: number;
}

export async function getReferralSummary(
  params: GetReferralSummaryParams
): Promise<ReferralSummaryResponse> {
  return api.get<ReferralSummaryResponse>("/referrals/summary", params);
}
