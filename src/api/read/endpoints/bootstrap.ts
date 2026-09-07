import { api } from "../../client";
import type {
  CommunityPreference,
  DailyQuota,
  LensMode,
  RenewalWarning,
} from "@/src/domain/communities";
import type {
  ConfigResponse,
  CommentsResponse,
  InboxResponse,
  NodeConfigResponse,
  PostsResponse,
  UserBlockedResponse,
  UserFollowedResponse,
  UserStatusResponse,
} from "../../types";
import { applyLensHttpParams } from "../request-params";
import { withSignedContentReadParams } from "../signed-content-read";

export interface BootstrapParams {
  address?: string;
  view?:
    | "feed:home"
    | "feed:following"
    | `community:${string}`
    | `thread:${string}`
    | "inbox";
  by?: "magic" | "newest";
  allowed_tags?: string;
  limit?: number;
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
}

export type BootstrapView =
  | (PostsResponse & {
      kind: "feed";
      feed?: "home" | "following";
      community?: string;
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
  community_preferences?: Record<string, CommunityPreference>;
  daily_quota?: DailyQuota | null;
  renewal_warning?: RenewalWarning | null;
  view: BootstrapView | null;
}

function bootstrapReadAction(
  view: BootstrapParams["view"],
): "get_posts" | "get_comments" {
  return typeof view === "string" && view.startsWith("thread:")
    ? "get_comments"
    : "get_posts";
}

function bootstrapLensContext(view: BootstrapParams["view"]) {
  const raw = typeof view === "string" ? view : "";
  return {
    community: raw.startsWith("community:") ? raw.slice("community:".length) : undefined,
    allowTeamWithoutCommunity: raw.startsWith("thread:"),
  };
}

export async function getBootstrap(
  params?: BootstrapParams,
  options?: { signal?: AbortSignal },
): Promise<BootstrapResponse> {
  const paramsFactory = () => withSignedContentReadParams(
    applyLensHttpParams(
      params as Record<string, unknown> | undefined,
      bootstrapLensContext(params?.view),
    ),
    bootstrapReadAction(params?.view),
  );
  return api.get<BootstrapResponse>(
    "/bootstrap",
    undefined,
    { ...options, paramsFactory },
  );
}
