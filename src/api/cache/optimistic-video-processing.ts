type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function clearOptimisticVideoProcessingFromData(
  data: unknown,
  postId: string,
): unknown {
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((item) => {
      const updated = clearOptimisticVideoProcessingFromData(item, postId);
      if (updated !== item) changed = true;
      return updated;
    });
    return changed ? next : data;
  }
  if (!isRecord(data)) return data;

  const apiPostMatches = data.post_id === postId;
  const uiPostMatches = data.id === postId && isRecord(data.author);
  let next: RecordValue = data;
  if (
    (apiPostMatches && data.optimistic_video_preview_until !== undefined) ||
    (uiPostMatches && data.optimisticVideoPreviewUntil !== undefined)
  ) {
    next = { ...data };
    if (apiPostMatches) next.optimistic_video_preview_until = undefined;
    if (uiPostMatches) next.optimisticVideoPreviewUntil = undefined;
  }

  for (const key of ["pages", "posts", "root", "children", "data"] as const) {
    if (!(key in next)) continue;
    const current = next[key];
    const updated = clearOptimisticVideoProcessingFromData(current, postId);
    if (updated !== current) {
      if (next === data) next = { ...data };
      next[key] = updated;
    }
  }
  return next;
}
