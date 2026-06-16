import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import type { Post } from "@/src/components/molecules";
import { useFollowHandler } from "@/src/hooks";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePostDetailActionStateStore } from "@/src/stores/post-detail-action-state-store";

type UsePostDetailPostStateParams = {
  id?: string;
  onOptimisticFollowUser?: (userId: string, isFollowing: boolean) => void;
  onRollbackFollowUser?: (userId: string) => void;
  post: Post | null;
};

type UsePostDetailPostStateResult = {
  displayPost: Post | null;
  handleFollowCommentAuthor: (authorId: string, isCurrentlyFollowing: boolean) => void;
  localPostUpdates: Partial<Post>;
  setLocalPostUpdates: Dispatch<SetStateAction<Partial<Post>>>;
};

export function usePostDetailPostState({
  id,
  onOptimisticFollowUser,
  onRollbackFollowUser,
  post,
}: UsePostDetailPostStateParams): UsePostDetailPostStateResult {
  const [localPostUpdates, setLocalPostUpdates] = useState<Partial<Post>>({});
  const actionPostId = post?.id ?? id;
  const postFollowOverride = usePostDetailActionStateStore((state) =>
    actionPostId ? state.postFollowOverrides[actionPostId] : undefined,
  );

  const {
    handleFollowUser: handleFollowUserViaQueue,
  } = useFollowHandler({
    onOptimisticFollowUser,
    onRollbackFollowUser,
  });

  const sharedVoteOverride = useHomePostCardStore((state) =>
    actionPostId ? state.voteOverrides[actionPostId] : undefined,
  );
  const sharedCommentCountOverride = useHomePostCardStore((state) =>
    actionPostId ? state.commentCountOverrides[actionPostId] : undefined,
  );

  const displayPost = useMemo(() => {
    if (!post) return null;

    let result = { ...post, ...localPostUpdates };
    if (postFollowOverride !== undefined) {
      result = { ...result, isFollowing: postFollowOverride };
    }

    if (sharedVoteOverride) {
      result = {
        ...result,
        likes: sharedVoteOverride.likes ?? post.likes ?? 0,
        hasLiked: sharedVoteOverride.hasLiked ?? result.hasLiked,
        hasDisliked: sharedVoteOverride.hasDisliked ?? result.hasDisliked,
      };
    }

    if (sharedCommentCountOverride && localPostUpdates.comments === undefined) {
      if ((result.comments ?? 0) === sharedCommentCountOverride.baseComments) {
        result = {
          ...result,
          comments:
            sharedCommentCountOverride.baseComments +
            (sharedCommentCountOverride.commentDelta ?? 0),
        };
      }
    }

    return result;
  }, [post, localPostUpdates, postFollowOverride, sharedVoteOverride, sharedCommentCountOverride]);

  const handleFollowCommentAuthor = useCallback(
    (authorId: string, isCurrentlyFollowing: boolean) => {
      handleFollowUserViaQueue(authorId, "", isCurrentlyFollowing);
    },
    [handleFollowUserViaQueue],
  );

  return {
    displayPost,
    handleFollowCommentAuthor,
    localPostUpdates,
    setLocalPostUpdates,
  };
}
