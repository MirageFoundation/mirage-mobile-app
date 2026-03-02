import type { Router } from "expo-router";
import type { Post } from "@/src/components/molecules/post-card-types";

export function getCreatedAtSeconds(createdAt: Date | string | number): number {
  if (createdAt instanceof Date) {
    return Math.floor(createdAt.getTime() / 1000);
  }
  const num = Number(createdAt);
  return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
}

export function navigateToEditPost(router: Router, post: Post) {
  const createdAtSeconds = getCreatedAtSeconds(post.createdAt);
  const editParams: Record<string, string> = {
    editPostId: post.id,
    editTopic: post.topic ?? "general",
    editTitle: post.title,
    editBody: post.body ?? "",
    editTag: "",
    editCreatedAt: String(createdAtSeconds),
  };
  if (post.media && post.media.length > 0) {
    editParams.editMedia = JSON.stringify(post.media.map((m) => m.uri));
  }
  router.push({ pathname: "/edit-post", params: editParams });
}
