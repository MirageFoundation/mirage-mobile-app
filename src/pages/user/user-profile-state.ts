import type { Post as ApiPost } from "@/src/api/types";
import type { Post } from "@/src/components/molecules";

export type UserProfileTab = 0 | 1 | 2;
export type UserProfilePostType = "submissions" | "comments";
export type UserProfileListItem = Post | ApiPost | "header" | "tabs";

export function getUserProfilePostType(tab: number): UserProfilePostType {
  return tab === 0 ? "submissions" : "comments";
}

export function resolveUserProfileAddress(
  id: string | undefined,
  resolvedAddress: string | null | undefined,
): string | null {
  if (!id) return null;
  return id.startsWith("mirage") ? id : resolvedAddress ?? null;
}

export function resolveOptimisticMembership(
  address: string | null,
  addresses: readonly string[] | null | undefined,
  optimisticValue: boolean | null,
): boolean {
  if (optimisticValue !== null) return optimisticValue;
  return Boolean(address && addresses?.includes(address));
}

export function selectUserProfileListData(
  activeTab: number,
  isBlocked: boolean,
  submissionPosts: Post[],
  comments: ApiPost[],
): UserProfileListItem[] {
  if (isBlocked || activeTab === 2) return ["header", "tabs"];
  return ["header", "tabs", ...(activeTab === 0 ? submissionPosts : comments)];
}

export function getUserProfileListItemKey(item: UserProfileListItem): string {
  if (item === "header" || item === "tabs") return item;
  return "id" in item ? item.id : item.post_id;
}

export function getUserProfileAction(
  isFollowing: boolean,
  isBlocked: boolean,
): "follow" | "unfollow" | "unblock" {
  if (isBlocked) return "unblock";
  return isFollowing ? "unfollow" : "follow";
}

export function calculateAccountAgeDays(
  createdAt: number | null | undefined,
  nowSeconds = Date.now() / 1000,
): number {
  if (!createdAt) return 0;
  return (nowSeconds - createdAt) / (60 * 60 * 24);
}

export function formatMirageBalance(umirage: number): number {
  return Math.floor(umirage / 1_000_000);
}
