import type { Post } from "@/src/components/molecules";

export type PostDetailAvailabilityInput = {
  isPostNotFound: boolean;
  isFocusedCommentNotFound: boolean;
  isCommentRoute: boolean;
  shouldUseOptimisticRootFallback: boolean;
};

export function getPostDetailAvailability({
  isPostNotFound,
  isFocusedCommentNotFound,
  isCommentRoute,
  shouldUseOptimisticRootFallback,
}: PostDetailAvailabilityInput) {
  const isUnavailable = isPostNotFound && !shouldUseOptimisticRootFallback;
  return {
    isUnavailable,
    useUnavailableBack: isUnavailable || isFocusedCommentNotFound,
    message: isCommentRoute ? "Comment not found" : "Content not found",
    description: isCommentRoute
      ? "This comment may have been deleted by its author or is no longer available."
      : "This post or comment may have been deleted by its author or is no longer available.",
  };
}

export type FocusedContextStateInput = {
  availableAncestorCount: number;
  loadedAncestorCount: number;
  hasBranchReplies: boolean;
  hasLoadedFocusedContext: boolean;
  isContextCheckFetched: boolean;
  contextDepth: number;
};

export function getFocusedContextState({
  availableAncestorCount,
  loadedAncestorCount,
  hasBranchReplies,
  hasLoadedFocusedContext,
  isContextCheckFetched,
  contextDepth,
}: FocusedContextStateInput) {
  const hasAvailableAncestors = availableAncestorCount > 0;
  return {
    hasRecentContext: hasAvailableAncestors || hasBranchReplies,
    recentContextDone:
      !hasBranchReplies &&
      (contextDepth > 0 || hasLoadedFocusedContext) &&
      isContextCheckFetched &&
      hasAvailableAncestors &&
      loadedAncestorCount >= availableAncestorCount,
  };
}

export function applyPostDetailCommentCountDelta(
  currentUpdates: Partial<Post>,
  delta: number,
  fallbackBase: number,
): Partial<Post> {
  return {
    ...currentUpdates,
    comments: Math.max(0, (currentUpdates.comments ?? fallbackBase) + delta),
  };
}

export function formatPostDetailCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}
