import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import {
  type AwardPickerSheetRef,
  type GiftMirageSheetRef,
  type GiftSubscriptionSheetRef,
  type Post,
  type PostOptionsSheetRef,
  type ReportSheetRef,
} from "@/src/components/molecules";
import { isCommunityJoined } from "@/src/domain/communities";
import {
  useBlockHandler,
  useDeleteHandler,
  useFollowHandler,
  useReportHandler,
  useVoteHandler,
  type BlockTarget,
  type VoteResult,
} from "@/src/hooks";

import {
  createPostCardActionAdapters,
  getSelectedPostFollowState,
  isSelectedPostSaved,
  postActionSelectionReducer,
} from "./post-action-controller";

type VoteState = {
  hasLiked: boolean;
  hasDisliked: boolean;
  likes: number;
};

type UsePostActionControllerOptions = {
  currentUserId?: string;
  followedUsers: string[];
  joinedCommunities: string[];
  savedPostIds: ReadonlySet<string>;
  onFollowUserOptimistic?: (userId: string, isFollowing: boolean) => void;
  onFollowUserRollback?: (userId: string) => void;
  onJoinCommunityOptimistic?: (topic: string, isFollowing: boolean) => void;
  onJoinCommunityRollback?: (topic: string) => void;
  onVoteOptimistic: (targetId: string, result: VoteResult) => void;
  onVoteRollback: (targetId: string, previousState: VoteState) => void;
  onBlockConfirmed: (target: BlockTarget) => void;
  onDeleteConfirmed: (postId: string) => void;
  onDeleteRollback: (postId: string) => void;
  onReportSubmitted: (postId: string) => void;
  onEditPost: (post: Post) => void;
  onToggleSave: (post: Post) => boolean;
  onSaveChanged: (saved: boolean) => void;
  onCopyText: () => void;
  onShowFewer: (post: Post | null) => void;
};

export function usePostActionController({
  currentUserId,
  followedUsers,
  joinedCommunities,
  savedPostIds,
  onFollowUserOptimistic,
  onFollowUserRollback,
  onJoinCommunityOptimistic,
  onJoinCommunityRollback,
  onVoteOptimistic,
  onVoteRollback,
  onBlockConfirmed,
  onDeleteConfirmed,
  onDeleteRollback,
  onReportSubmitted,
  onEditPost,
  onToggleSave,
  onSaveChanged,
  onCopyText,
  onShowFewer,
}: UsePostActionControllerOptions) {
  const [{ selectedPost }, dispatchSelection] = useReducer(
    postActionSelectionReducer,
    { selectedPost: null },
  );
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const awardPickerSheetRef = useRef<AwardPickerSheetRef>(null);
  const giftMirageSheetRef = useRef<GiftMirageSheetRef>(null);
  const giftSubscriptionSheetRef = useRef<GiftSubscriptionSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);

  const follow = useFollowHandler({
    onOptimisticFollowUser: onFollowUserOptimistic,
    onRollbackFollowUser: onFollowUserRollback,
    onOptimisticJoinCommunity: onJoinCommunityOptimistic,
    onRollbackJoinCommunity: onJoinCommunityRollback,
  });
  const vote = useVoteHandler({
    onOptimisticUpdate: onVoteOptimistic,
    onRollback: onVoteRollback,
  });
  const block = useBlockHandler({});
  const report = useReportHandler({});
  const deletion = useDeleteHandler({
    onRollback: (targetId, targetType) => {
      if (targetType === "post") onDeleteRollback(targetId);
    },
  });

  useEffect(() => {
    if (report.showReportSheet) reportSheetRef.current?.present();
  }, [report.showReportSheet]);

  const openOptions = useCallback((post: Post) => {
    dispatchSelection({ type: "select", post });
    postOptionsSheetRef.current?.present();
  }, []);
  const clearSelection = useCallback(() => {
    dispatchSelection({ type: "clear" });
  }, []);
  const followState = getSelectedPostFollowState(
    selectedPost,
    followedUsers,
    joinedCommunities,
  );

  const selectedActions = useMemo(
    () => ({
      showFewer: () => onShowFewer(selectedPost),
      followUser: () => {
        if (!selectedPost) return;
        follow.handleFollowUser(
          selectedPost.author.id,
          selectedPost.author.username,
          followedUsers.includes(selectedPost.author.id),
        );
      },
      toggleCommunityMembership: () => {
        if (!selectedPost?.community) return;
        follow.handleToggleCommunityMembership(
          selectedPost.community,
          isCommunityJoined(joinedCommunities, selectedPost.community),
        );
      },
      save: () => {
        if (!selectedPost) return;
        onSaveChanged(onToggleSave(selectedPost));
      },
      copyText: onCopyText,
      report: () => {
        if (selectedPost) report.requestReport(selectedPost.id, "post");
      },
      blockUser: () => {
        if (selectedPost) {
          block.requestBlockUser(
            selectedPost.author.id,
            selectedPost.author.username,
          );
        }
      },
      hidePost: () => {
        if (selectedPost) block.requestBlockPost(selectedPost.id);
      },
      edit: () => {
        if (selectedPost) onEditPost(selectedPost);
      },
      deletePost: () => {
        if (selectedPost) deletion.requestDelete(selectedPost.id, "post");
      },
      giveAward: () => {
        if (selectedPost) setTimeout(() => awardPickerSheetRef.current?.present(), 300);
      },
      giftMirage: () => {
        if (selectedPost) setTimeout(() => giftMirageSheetRef.current?.present(), 300);
      },
      giftSubscription: () => {
        if (selectedPost) {
          setTimeout(() => giftSubscriptionSheetRef.current?.present(), 300);
        }
      },
    }),
    [
      block,
      deletion,
      follow,
      joinedCommunities,
      followedUsers,
      onCopyText,
      onEditPost,
      onSaveChanged,
      onShowFewer,
      onToggleSave,
      report,
      selectedPost,
    ],
  );

  const confirmBlock = useCallback(() => {
    if (block.pendingBlock) onBlockConfirmed(block.pendingBlock);
    block.confirmBlock();
  }, [block, onBlockConfirmed]);
  const confirmDelete = useCallback(() => {
    if (deletion.pendingTarget?.type === "post") {
      onDeleteConfirmed(deletion.pendingTarget.id);
    }
    deletion.confirmDelete();
  }, [deletion, onDeleteConfirmed]);
  const submitReport = useCallback(
    (reason: string) => {
      if (report.pendingTarget?.type === "post") {
        onReportSubmitted(report.pendingTarget.id);
      }
      reportSheetRef.current?.dismiss();
      report.submitReport(reason);
    },
    [onReportSubmitted, report],
  );
  const cardActions = useMemo(
    () =>
      createPostCardActionAdapters({
        openOptions,
        followUser: follow.handleFollowUser,
        toggleCommunityMembership: follow.handleToggleCommunityMembership,
        upvote: vote.handleUpvote,
        downvote: vote.handleDownvote,
        requestBlockUser: block.requestBlockUser,
        requestBlockPost: block.requestBlockPost,
        requestBlockCommunity: block.requestBlockCommunity,
        requestReportPost: (postId) => report.requestReport(postId, "post"),
      }),
    [block, follow, openOptions, report, vote],
  );

  return {
    selection: {
      selectedPost,
      isOwnPost: currentUserId === selectedPost?.author.id,
      isSaved: isSelectedPostSaved(selectedPost, savedPostIds),
      ...followState,
      clear: clearSelection,
    },
    cardActions,
    selectedActions,
    overlays: {
      postOptionsSheetRef,
      awardPickerSheetRef,
      giftMirageSheetRef,
      giftSubscriptionSheetRef,
      reportSheetRef,
      block: {
        visible: block.showConfirmation,
        pending: block.pendingBlock,
        confirm: confirmBlock,
        cancel: block.cancelBlock,
      },
      deletion: {
        visible: deletion.showConfirmation,
        confirm: confirmDelete,
        cancel: deletion.cancelDelete,
      },
      report: {
        submit: submitReport,
        cancel: report.cancelReport,
        isLoading: report.isReporting,
      },
    },
  };
}

export type PostActionController = ReturnType<typeof usePostActionController>;
