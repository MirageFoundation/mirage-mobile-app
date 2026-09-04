import type { Post as ApiPost } from "@/src/api/types";
import type { Post } from "@/src/components/molecules";

export type OwnProfilePostType = "submissions" | "comments";
export type OwnProfileListItem = Post | ApiPost | "header" | "tabs";
export type OwnProfileAction =
  | "edit-username"
  | "followers"
  | "settings"
  | "blocked";
export type OwnProfileActionRoute =
  | "/change-username"
  | "/settings"
  | "/blocked-list"
  | `/user-following/${string}`;

export function getOwnProfilePostType(tab: number): OwnProfilePostType {
  return tab === 0 ? "submissions" : "comments";
}

export function selectOwnProfileListData(
  activeTab: number,
  submissionPosts: Post[],
  comments: ApiPost[],
): OwnProfileListItem[] {
  if (activeTab === 2) return ["header", "tabs"];
  return ["header", "tabs", ...(activeTab === 0 ? submissionPosts : comments)];
}

export function getOwnProfileListItemKey(item: OwnProfileListItem): string {
  if (item === "header" || item === "tabs") return item;
  return "id" in item ? item.id : item.post_id;
}

export function getOwnProfileActionRoute(
  action: OwnProfileAction,
  identity?: string | null,
): OwnProfileActionRoute | null {
  if (action === "edit-username") return "/change-username";
  if (action === "settings") return "/settings";
  if (action === "blocked") return "/blocked-list";
  return identity ? `/user-following/${identity}` : null;
}

export {
  calculateAccountAgeDays,
  formatAccountAgeLong,
  formatAccountAgeShort,
} from "@/src/utils/account-age";

export function formatMirageBalance(umirage: number): number {
  return Math.floor(umirage / 1_000_000);
}
