import { api } from "../../client";
import type {
  GetInviteCodesResponse,
  NodeConfigResponse,
  UserBlockedResponse,
  UserFollowedResponse,
  UserStatusResponse,
} from "../../types";
import type { RewardSummaryResponse } from "./rewards";

export interface BootstrapParams {
  address?: string;
}

export interface BootstrapResponse {
  node_config: NodeConfigResponse | null;
  user_status: UserStatusResponse | null;
  user_followed: UserFollowedResponse | null;
  user_blocked: UserBlockedResponse | null;
  invite_codes: GetInviteCodesResponse | null;
  rewards_summary: RewardSummaryResponse | null;
}

export async function getBootstrap(
  params?: BootstrapParams
): Promise<BootstrapResponse> {
  return api.get<BootstrapResponse>("/bootstrap", params?.address ? params : undefined);
}
