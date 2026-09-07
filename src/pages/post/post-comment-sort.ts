import type { Comment } from "@/src/domain/content";

export type PostCommentSort = "best" | "new" | "old";
export function sortPostComments(comments: Comment[], sort: PostCommentSort): Comment[] {
  if (sort === "best") return [...comments].sort((a, b) => b.likes - a.likes);
  const direction = sort === "new" ? -1 : 1;
  return [...comments].sort((a, b) => direction * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
}
