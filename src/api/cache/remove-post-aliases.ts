import type { Post as ApiPost } from "@/src/api/types";

const matchesAlias = (
  value: unknown,
  postId: string,
  optimisticActionId?: string,
): boolean => {
  if (!value || typeof value !== "object") return false;
  const post = value as Partial<ApiPost> & { id?: string; optimisticActionId?: string };
  return (
    post.post_id === postId ||
    post.id === postId ||
    (!!optimisticActionId && (
      post.optimistic_action_id === optimisticActionId ||
      post.optimisticActionId === optimisticActionId
    ))
  );
};

export function removePostAliasesFromData(
  data: unknown,
  postId: string,
  optimisticActionId?: string,
): unknown {
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.flatMap((item) => {
      if (matchesAlias(item, postId, optimisticActionId)) {
        changed = true;
        return [];
      }
      const updated = removePostAliasesFromData(item, postId, optimisticActionId);
      if (updated !== item) changed = true;
      return [updated];
    });
    return changed ? next : data;
  }
  if (!data || typeof data !== "object") return data;
  if (matchesAlias(data, postId, optimisticActionId)) return undefined;

  const record = data as Record<string, unknown>;
  let next = record;
  for (const key of ["pages", "posts", "children", "data"] as const) {
    if (!(key in record)) continue;
    const updated = removePostAliasesFromData(record[key], postId, optimisticActionId);
    if (updated !== record[key]) {
      if (next === record) next = { ...record };
      next[key] = updated;
    }
  }
  if (record.root && matchesAlias(record.root, postId, optimisticActionId)) {
    return undefined;
  }
  return next;
}
