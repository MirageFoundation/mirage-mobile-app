import type { Post as ApiPost } from "../../types";

export function transformOptimisticPostState(apiPost: ApiPost) {
  return {
    optimisticStatus: apiPost.optimistic_status,
    optimisticError: apiPost.optimistic_error,
    optimisticActionId: apiPost.optimistic_action_id,
    optimisticDraft: apiPost.optimistic_draft,
    optimisticVideoPreviewUntil: apiPost.optimistic_video_preview_until,
  };
}
