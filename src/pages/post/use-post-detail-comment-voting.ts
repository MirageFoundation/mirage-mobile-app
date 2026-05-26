import { useCallback, useState } from "react";

import { useVoteHandler, type VoteResult } from "@/src/hooks";

type CommentVoteOverrides = Record<
  string,
  { hasLiked?: boolean; hasDisliked?: boolean; likeDelta?: number }
>;

export function usePostDetailCommentVoting() {
  const [commentVoteOverrides, setCommentVoteOverrides] = useState<CommentVoteOverrides>({});

  const commentVoteHandler = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
      setCommentVoteOverrides((prev) => {
        const currentDelta = prev[targetId]?.likeDelta ?? 0;
        return {
          ...prev,
          [targetId]: {
            hasLiked: result.hasLiked,
            hasDisliked: result.hasDisliked,
            likeDelta: currentDelta + result.likeDelta,
          },
        };
      });
    }, []),
    onRollback: useCallback((targetId: string) => {
      setCommentVoteOverrides((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    }, []),
  });

  const handleLikeComment = useCallback(
    (
      commentId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number = 0,
    ) => {
      commentVoteHandler.handleUpvote(
        commentId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes,
      );
    },
    [commentVoteHandler],
  );

  const handleDislikeComment = useCallback(
    (
      commentId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number = 0,
    ) => {
      commentVoteHandler.handleDownvote(
        commentId,
        currentlyLiked,
        currentlyDisliked,
        currentLikes,
      );
    },
    [commentVoteHandler],
  );

  return {
    commentVoteOverrides,
    handleDislikeComment,
    handleLikeComment,
  };
}
