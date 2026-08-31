import { api } from "../../client";
import type {
  ConfigResponse,
  CommentsResponse,
  GetInviteCodesResponse,
  InboxResponse,
  NodeConfigResponse,
  PostsResponse,
  UserBlockedResponse,
  UserFollowedResponse,
  UserStatusResponse,
} from "../../types";
import type { RewardSummaryResponse } from "./rewards";
import { buildSimpleSignedPayload } from "@/src/api/signing/simple-sign";
import type { MirageWallet } from "@/src/wallet";

export interface BootstrapParams {
  address?: string;
  view?:
    | "feed:home"
    | "feed:following"
    | `topic:${string}`
    | `thread:${string}`
    | "inbox";
  by?: "magic" | "newest";
  allowed_tags?: string;
  limit?: number;
}

export type BootstrapView =
  | (PostsResponse & {
      kind: "feed";
      feed?: "home" | "following";
      topic?: string;
    })
  | (CommentsResponse & { kind: "thread"; found: true })
  | { kind: "thread"; found: false }
  | (InboxResponse & { kind: "inbox" });

export interface BootstrapResponse {
  node_config: NodeConfigResponse | null;
  chain_config: ConfigResponse | null;
  user_status: UserStatusResponse | null;
  user_followed: UserFollowedResponse | null;
  user_blocked: UserBlockedResponse | null;
  invite_codes?: GetInviteCodesResponse | null;
  rewards_summary: RewardSummaryResponse | null;
  view: BootstrapView | null;
}

export async function getBootstrap(
  params?: BootstrapParams,
  wallet?: MirageWallet,
): Promise<BootstrapResponse> {
  const requestParams = params ? { ...params } : {};
  if (
    wallet &&
    params?.address &&
    wallet.address.toLowerCase() === params.address.toLowerCase()
  ) {
    Object.assign(
      requestParams,
      buildSimpleSignedPayload(
        wallet,
        `get_invite_codes:${wallet.address.toLowerCase()}:{timestamp}:{nonce}`,
      ),
    );
  }
  return api.get<BootstrapResponse>(
    "/bootstrap",
    Object.keys(requestParams).length > 0 ? requestParams : undefined,
  );
}
