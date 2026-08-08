import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import {
  AwardPickerSheet,
  type AwardPickerSheetRef,
  CommentOptionsSheet,
  type CommentOptionsSheetRef,
  ConfirmationPopup,
  GiftMirageSheet,
  type GiftMirageSheetRef,
  GiftSubscriptionSheet,
  type GiftSubscriptionSheetRef,
  PostOptionsSheet,
  type PostOptionsSheetRef,
  ReportSheet,
  type ReportSheetRef,
  type Comment,
  type Post,
} from "@/src/components/molecules";
import { isTopicFollowed } from "@/src/domain/topics";
import {
  getBlockConfirmationMessage,
  useBlockHandler,
  useDeleteHandler,
  useFollowHandler,
  useReportHandler,
} from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import { useToast } from "@/src/providers/toast-provider";
import {
  useAuthStore,
  useContentModerationStore,
  useSavedPostsStore,
} from "@/src/stores";

type MediaPostDetailActionSheetsProps = {
  followedTopics: string[];
  followedUsers: string[];
  onBlockCommentAuthor: (authorId: string) => void;
  onRemoveComment: (commentId: string) => void;
  post: Post;
  reserveComposeNavigation: () => boolean;
};

export type MediaPostDetailActionSheetsRef = {
  presentCommentOptions: (comment: Comment) => void;
  presentPostOptions: () => void;
  requestBlockPost: () => void;
  requestBlockTopic: () => void;
  requestBlockUser: () => void;
  requestReportPost: () => void;
};

export const MediaPostDetailActionSheets = forwardRef<
  MediaPostDetailActionSheetsRef,
  MediaPostDetailActionSheetsProps
>(function MediaPostDetailActionSheets({
  followedTopics,
  followedUsers,
  onBlockCommentAuthor,
  onRemoveComment,
  post,
  reserveComposeNavigation,
}, ref) {
  const router = useRouter();
  const toast = useToast();
  const currentUser = useAuthStore((state) => state.user);
  const savedPosts = useSavedPostsStore((state) => state.savedPosts);
  const savedComments = useSavedPostsStore((state) => state.savedComments);
  const globalHidePost = useContentModerationStore((state) => state.hidePost);
  const globalBlockUser = useContentModerationStore((state) => state.blockUser);
  const globalBlockTopic = useContentModerationStore((state) => state.blockTopic);
  const globalHideComment = useContentModerationStore((state) => state.hideComment);
  const deleteHandler = useDeleteHandler({});
  const blockHandler = useBlockHandler({});
  const reportHandler = useReportHandler({});
  const { handleFollowUser: followUser, handleFollowTopic: followTopic } = useFollowHandler({});

  const postOptionsRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const commentOptionsRef = useRef<CommentOptionsSheetRef>(null);
  const awardPickerRef = useRef<AwardPickerSheetRef>(null);
  const giftMirageRef = useRef<GiftMirageSheetRef>(null);
  const giftSubRef = useRef<GiftSubscriptionSheetRef>(null);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [awardTargetId, setAwardTargetId] = useState<string>("");
  const [awardTargetType, setAwardTargetType] = useState<"post" | "comment">("post");
  const [awardTargetIsOwn, setAwardTargetIsOwn] = useState(false);
  const [giftRecipientAddress, setGiftRecipientAddress] = useState("");
  const [giftRecipientUsername, setGiftRecipientUsername] = useState("");

  useEffect(() => {
    if (reportHandler.showReportSheet) reportSheetRef.current?.present();
  }, [reportHandler.showReportSheet]);

  useImperativeHandle(ref, () => ({
    presentCommentOptions: (comment) => {
      setSelectedComment(comment);
      commentOptionsRef.current?.present();
    },
    presentPostOptions: () => postOptionsRef.current?.present(),
    requestBlockPost: () => blockHandler.requestBlockPost(post.id),
    requestBlockTopic: () => {
      if (post.topic) blockHandler.requestBlockTopic(post.topic);
    },
    requestBlockUser: () => blockHandler.requestBlockUser(post.author.id, post.author.username),
    requestReportPost: () => reportHandler.requestReport(post.id, "post"),
  }), [blockHandler, post, reportHandler]);

  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending) {
      if (pending.type === "post") {
        globalHidePost(pending.id);
        router.back();
      } else if (pending.type === "topic") {
        globalBlockTopic(pending.id);
        router.back();
      } else if (pending.type === "user") {
        globalBlockUser(pending.id);
        if (post.author.id === pending.id) {
          router.back();
        } else {
          onBlockCommentAuthor(pending.id);
        }
      } else if (pending.type === "comment") {
        globalHideComment(pending.id);
        onRemoveComment(pending.id);
      }
      setSelectedComment(null);
    }
    blockHandler.confirmBlock();
  }, [
    blockHandler,
    globalHidePost,
    globalBlockTopic,
    globalBlockUser,
    globalHideComment,
    onBlockCommentAuthor,
    onRemoveComment,
    post.author.id,
    router,
  ]);

  const handleReportSubmitWithOptimistic = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending) {
        if (pending.type === "post") {
          globalHidePost(pending.id);
          router.back();
        } else if (pending.type === "comment") {
          globalHideComment(pending.id);
          onRemoveComment(pending.id);
        }
        setSelectedComment(null);
      }
      reportSheetRef.current?.dismiss();
      reportHandler.submitReport(reason);
    },
    [reportHandler, globalHidePost, globalHideComment, onRemoveComment, router],
  );

  const handleDeleteComment = useCallback(() => {
    if (!selectedComment) return;
    if (selectedComment.id.startsWith("optimistic-") || selectedComment.id.startsWith("local-")) {
      toast.info("Comment is still syncing", "Please try deleting again in a moment.");
      return;
    }
    deleteHandler.requestDelete(selectedComment.id, "comment", { rootPostId: post.id });
  }, [selectedComment, deleteHandler, post.id, toast]);

  const handleConfirmDelete = useCallback(() => {
    const pending = deleteHandler.pendingTarget;
    if (pending?.type === "comment") {
      globalHideComment(pending.id);
      onRemoveComment(pending.id);
      setSelectedComment(null);
    } else if (pending?.type === "post") {
      globalHidePost(pending.id);
      router.back();
    }
    deleteHandler.confirmDelete();
  }, [deleteHandler, globalHideComment, globalHidePost, onRemoveComment, router]);

  const handleEditComment = useCallback(() => {
    if (!selectedComment || selectedComment.id.startsWith("optimistic-")) return;
    if (!reserveComposeNavigation()) return;
    const createdAt = selectedComment.createdAt instanceof Date
      ? Math.floor(selectedComment.createdAt.getTime() / 1000)
      : Math.floor(Number(selectedComment.createdAt) / (Number(selectedComment.createdAt) > 1e12 ? 1000 : 1));
    router.push({
      pathname: "/comment-compose",
      params: {
        postId: post.id,
        postTitle: post.title,
        postAuthorUsername: post.author.username,
        editCommentId: selectedComment.id,
        editParentId: selectedComment.parentId ?? post.id,
        editContent: selectedComment.content,
        editCreatedAt: String(createdAt),
        editSource: "post",
      },
    });
  }, [selectedComment, post, reserveComposeNavigation, router]);

  return (
    <>
      <PostOptionsSheet
        ref={postOptionsRef}
        post={post}
        isOwnPost={currentUser?.id === post.author.id}
        isTopicFollowed={isTopicFollowed(followedTopics, post.topic)}
        isFollowingUser={followedUsers.includes(post.author.id)}
        isSaved={savedPosts.some((savedPost) => savedPost.id === post.id)}
        onFollowUser={() =>
          followUser(
            post.author.id,
            post.author.username,
            post.isFollowing ?? false,
          )
        }
        onFollowTopic={() => {
          if (post.topic) {
            followTopic(post.topic, isTopicFollowed(followedTopics, post.topic));
          }
        }}
        onSave={() => {
          const saved = useSavedPostsStore.getState().toggleSavePost(post);
          toast.success(
            saved ? "Post saved" : "Post unsaved",
            saved
              ? "You can find it in your saved items."
              : "Removed from saved items.",
          );
        }}
        onBlockPost={() => blockHandler.requestBlockPost(post.id)}
        onBlockUser={() =>
          blockHandler.requestBlockUser(post.author.id, post.author.username)
        }
        onReport={() => reportHandler.requestReport(post.id, "post")}
        onDelete={() => deleteHandler.requestDelete(post.id, "post")}
        onGiveAward={() => {
          setAwardTargetId(post.id);
          setAwardTargetType("post");
          setAwardTargetIsOwn(currentUser?.id === post.author.id);
          setTimeout(() => awardPickerRef.current?.present(), 300);
        }}
        onGiftMirage={() => {
          setGiftRecipientAddress(post.author.id);
          setGiftRecipientUsername(post.author.username);
          setTimeout(() => giftMirageRef.current?.present(), 300);
        }}
        onGiftSubscription={() => {
          setGiftRecipientAddress(post.author.id);
          setGiftRecipientUsername(post.author.username);
          setTimeout(() => giftSubRef.current?.present(), 300);
        }}
        onDismiss={() => {}}
      />

      <ReportSheet
        ref={reportSheetRef}
        targetType={reportHandler.pendingTarget?.type}
        onSubmit={handleReportSubmitWithOptimistic}
        onDismiss={reportHandler.cancelReport}
        isLoading={reportHandler.isReporting}
      />

      <ConfirmationPopup
        visible={blockHandler.showConfirmation}
        title={`Block ${blockHandler.pendingBlock?.label || "user"}?`}
        message={getBlockConfirmationMessage(
          blockHandler.pendingBlock?.type ?? "post",
        )}
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        onConfirm={handleConfirmBlock}
        onCancel={blockHandler.cancelBlock}
      />

      <ConfirmationPopup
        visible={deleteHandler.showConfirmation}
        title={`Delete ${deleteHandler.pendingTarget?.type === "post" ? "post" : "comment"}?`}
        message="This cannot be undone."
        icon="trash-outline"
        confirmText="Delete"
        isDestructive
        isLoading={deleteHandler.isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={deleteHandler.cancelDelete}
      />

      <CommentOptionsSheet
        ref={commentOptionsRef}
        comment={selectedComment}
        rootPostId={post.id}
        isOwnComment={currentUser?.id === selectedComment?.author.id}
        isFollowingAuthor={
          selectedComment?.author.id
            ? followedUsers.includes(selectedComment.author.id)
            : false
        }
        isSaved={
          selectedComment
            ? savedComments.some((comment) => comment.id === selectedComment.id)
            : false
        }
        onSave={() => {
          if (!selectedComment) return;
          const saved = useSavedPostsStore
            .getState()
            .toggleSaveComment(selectedComment, post.id);
          toast.success(
            saved ? "Comment saved" : "Comment unsaved",
            saved
              ? "You can find it in your saved items."
              : "Removed from saved items.",
          );
        }}
        onCopyText={() => toast.success("Copied", "Comment text copied.")}
        onDelete={handleDeleteComment}
        onEdit={handleEditComment}
        onBlockComment={() => {
          if (selectedComment)
            blockHandler.requestBlockComment(selectedComment.id);
        }}
        onBlockUser={() => {
          if (selectedComment)
            blockHandler.requestBlockUser(
              selectedComment.author.id,
              selectedComment.author.username,
            );
        }}
        onReport={() => {
          if (selectedComment)
            reportHandler.requestReport(selectedComment.id, "comment");
        }}
        onToggleFollowAuthor={() => {
          if (!selectedComment) return;
          followUser(
            selectedComment.author.id,
            selectedComment.author.username,
            followedUsers.includes(selectedComment.author.id),
          );
        }}
        onGiveAward={() => {
          if (!selectedComment) return;
          setAwardTargetId(selectedComment.id);
          setAwardTargetType("comment");
          setAwardTargetIsOwn(currentUser?.id === selectedComment.author.id);
          setTimeout(() => awardPickerRef.current?.present(), 300);
        }}
        onGiftMirage={() => {
          if (!selectedComment) return;
          setGiftRecipientAddress(selectedComment.author.id);
          setGiftRecipientUsername(selectedComment.author.username);
          setTimeout(() => giftMirageRef.current?.present(), 300);
        }}
        onGiftSubscription={() => {
          if (!selectedComment) return;
          setGiftRecipientAddress(selectedComment.author.id);
          setGiftRecipientUsername(selectedComment.author.username);
          setTimeout(() => giftSubRef.current?.present(), 300);
        }}
        onDismiss={() => setSelectedComment(null)}
      />

      <AwardPickerSheet
        ref={awardPickerRef}
        targetId={awardTargetId || post.id}
        targetType={awardTargetType}
        isOwnContent={awardTargetIsOwn}
      />
      <GiftMirageSheet
        ref={giftMirageRef}
        recipientAddress={giftRecipientAddress || post.author.id}
        recipientUsername={giftRecipientUsername || post.author.username}
      />
      <GiftSubscriptionSheet
        ref={giftSubRef}
        recipientAddress={giftRecipientAddress || post.author.id}
        recipientUsername={giftRecipientUsername || post.author.username}
      />
    </>
  );
});
