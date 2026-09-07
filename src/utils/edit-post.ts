import type { useRouter } from "expo-router";
import type { Post } from "@/src/components/molecules/post-card-types";
import { usePostEditStore } from "@/src/stores/post-edit-store";

type Router = ReturnType<typeof useRouter>;

let _lastEditTimestamp = 0;
const EDIT_COOLDOWN_MS = 15000;

export function markEditJustCompleted() {
  _lastEditTimestamp = Date.now();
}

export function shouldSkipPostRefetch(): boolean {
  return Date.now() - _lastEditTimestamp < EDIT_COOLDOWN_MS;
}

export function getCreatedAtSeconds(createdAt: Date | string | number): number {
  if (createdAt instanceof Date) {
    return Math.floor(createdAt.getTime() / 1000);
  }
  const num = Number(createdAt);
  return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
}

export function navigateToEditPost(router: Router, post: Post) {
  const override = usePostEditStore.getState().overrides[post.id];
  const createdAtSeconds = getCreatedAtSeconds(post.createdAt);
  const editParams: Record<string, string> = {
    editPostId: post.id,
    editCommunity: override?.community ?? post.community ?? "general",
    editTitle: override?.title ?? post.title,
    editBody: override?.content ?? post.body ?? "",
    editTag: override?.tag ?? "",
    editCreatedAt: String(createdAtSeconds),
  };
  const mediaUrls = override?.media ?? (post.media ? post.media.map((m) => m.uri) : null);
  if (mediaUrls && mediaUrls.length > 0) {
    editParams.editMedia = JSON.stringify(mediaUrls);
  }
  router.push({ pathname: "/edit-post", params: editParams });
}
