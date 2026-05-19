import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { Post as ApiPost } from "@/src/api/types";
import {
  AwardPickerSheet,
  AwardPickerSheetRef,
  Comment,
  CommentOptionsSheet,
  CommentOptionsSheetRef,
  ConfirmationPopup,
  GiftMirageSheet,
  GiftMirageSheetRef,
  GiftSubscriptionSheet,
  GiftSubscriptionSheetRef,
  PostOptionsSheet,
  PostOptionsSheetRef,
  ReportSheet,
  ReportSheetRef,
  type Post,
} from "@/src/components/molecules";
import {
  getBlockConfirmationMessage,
  useBlockHandler,
  useDeleteHandler,
  useFollowHandler,
  useReportHandler,
} from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import { useToast } from "@/src/providers/toast-provider";
import { useContentModerationStore, useSavedPostsStore } from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePostDetailActionStateStore } from "@/src/stores/post-detail-action-state-store";
import { usePostCommentOptimisticStore } from "@/src/stores/post-comment-optimistic-store";

export type PostDetailActionSheetsRef = {
  presentCommentOptions: (comment: Comment) => void;
  presentPostOptions: () => void;
  requestBlockPost: () => void;
  requestBlockPostAuthor: () => void;
  requestReportPost: () => void;
  clearSelectedComment: () => void;
  replaceSelectedCommentId: (previousId: string, nextId: string) => void;
};

type PostDetailActionSheetsProps = {
  actualRootPostId?: string | null;
  currentUserId?: string;
  followedTopics: string[];
  followedUsers: string[];
  highlight?: string;
  id: string;
  post: Post | null;
  rootPost?: ApiPost | null;
};

export const PostDetailActionSheets = forwardRef<
  PostDetailActionSheetsRef,
  PostDetailActionSheetsProps
>(
  (
    {
      actualRootPostId,
      currentUserId,
      followedTopics,
      followedUsers,
      highlight,
      id,
      post,
      rootPost,
    },
    ref,
  ) => {
    const router = useRouter();
    const toast = useToast();
    const optionsSheetRef = useRef<CommentOptionsSheetRef>(null);
    const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
    const awardPickerSheetRef = useRef<AwardPickerSheetRef>(null);
    const giftMirageSheetRef = useRef<GiftMirageSheetRef>(null);
    const giftSubscriptionSheetRef = useRef<GiftSubscriptionSheetRef>(null);
    const reportSheetRef = useRef<ReportSheetRef>(null);
    const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
    const [awardTargetId, setAwardTargetId] = useState("");
    const [awardTargetType, setAwardTargetType] = useState<"post" | "comment">("post");
    const [awardTargetIsOwn, setAwardTargetIsOwn] = useState(false);
    const [giftRecipientAddress, setGiftRecipientAddress] = useState("");
    const [giftRecipientUsername, setGiftRecipientUsername] = useState("");

    const savedComments = useSavedPostsStore((state) => state.savedComments);
    const savedPosts = useSavedPostsStore((state) => state.savedPosts);
    const decrementCommentCount = useHomePostCardStore((state) => state.decrementCommentCount);
    const incrementCommentCount = useHomePostCardStore((state) => state.incrementCommentCount);
    const postFollowOverride = usePostDetailActionStateStore((state) =>
      post?.id ? state.postFollowOverrides[post.id] : undefined,
    );
    const topicFollowOverride = usePostDetailActionStateStore((state) =>
      post?.id ? state.topicFollowOverrides[post.id] : undefined,
    );
    const setPostFollowOverride = usePostDetailActionStateStore(
      (state) => state.setPostFollowOverride,
    );
    const clearPostFollowOverride = usePostDetailActionStateStore(
      (state) => state.clearPostFollowOverride,
    );
    const setTopicFollowOverride = usePostDetailActionStateStore(
      (state) => state.setTopicFollowOverride,
    );
    const clearTopicFollowOverride = usePostDetailActionStateStore(
      (state) => state.clearTopicFollowOverride,
    );
    const globalHidePost = useContentModerationStore((state) => state.hidePost);
    const globalUnhidePost = useContentModerationStore((state) => state.unhidePost);
    const globalBlockUser = useContentModerationStore((state) => state.blockUser);
    const globalHideComment = useContentModerationStore((state) => state.hideComment);
    const globalUnhideComment = useContentModerationStore((state) => state.unhideComment);

    const deleteHandler = useDeleteHandler({
      onRollback: (targetId, targetType) => {
        if (targetType === "post") {
          globalUnhidePost(targetId);
          return;
        }
        globalUnhideComment(targetId);
        incrementCommentCount(id, rootPost?.comments ?? 0);
      },
    });
    const blockHandler = useBlockHandler({});
    const reportHandler = useReportHandler({});
    const {
      handleFollowUser: handleFollowUserViaQueue,
      handleFollowTopic: handleFollowTopicViaQueue,
    } = useFollowHandler({
      onOptimisticFollowUser: (_userId, isFollowing) => {
        if (post?.id) setPostFollowOverride(post.id, isFollowing);
      },
      onRollbackFollowUser: () => {
        if (post?.id) clearPostFollowOverride(post.id);
      },
      onOptimisticFollowTopic: (_topic, isFollowing) => {
        if (post?.id) setTopicFollowOverride(post.id, isFollowing);
      },
      onRollbackFollowTopic: () => {
        if (post?.id) clearTopicFollowOverride(post.id);
      },
    });

    const requestBlockPost = useCallback(() => {
      if (!post) return;
      blockHandler.requestBlockPost(post.id);
    }, [blockHandler, post]);

    const requestBlockPostAuthor = useCallback(() => {
      if (!post) return;
      blockHandler.requestBlockUser(post.author.id, post.author.username);
    }, [blockHandler, post]);

    const requestReportPost = useCallback(() => {
      if (!post) return;
      reportHandler.requestReport(post.id, "post");
    }, [post, reportHandler]);

    useImperativeHandle(
      ref,
      () => ({
        presentCommentOptions: (comment) => {
          setSelectedComment(comment);
          optionsSheetRef.current?.present();
        },
        presentPostOptions: () => {
          postOptionsSheetRef.current?.present();
        },
        requestBlockPost,
        requestBlockPostAuthor,
        requestReportPost,
        clearSelectedComment: () => {
          setSelectedComment(null);
        },
        replaceSelectedCommentId: (previousId, nextId) => {
          setSelectedComment((current) => {
            if (!current || current.id !== previousId) return current;
            return { ...current, id: nextId };
          });
        },
      }),
      [requestBlockPost, requestBlockPostAuthor, requestReportPost],
    );

    useEffect(() => {
      if (reportHandler.showReportSheet) {
        reportSheetRef.current?.present();
      }
    }, [reportHandler.showReportSheet]);

    const clearSelectedComment = useCallback(() => {
      setSelectedComment(null);
    }, []);

    const handleSaveComment = useCallback(() => {
      if (!selectedComment) return;
      const saved = useSavedPostsStore
        .getState()
        .toggleSaveComment(selectedComment, actualRootPostId ?? id);
      toast.success(
        saved ? "Comment saved" : "Comment unsaved",
        saved ? "You can find it in your saved items." : "Removed from saved items.",
      );
    }, [actualRootPostId, id, selectedComment, toast]);

    const handleSavePost = useCallback(() => {
      if (!post) return;
      const saved = useSavedPostsStore.getState().toggleSavePost(post);
      toast.success(
        saved ? "Post saved" : "Post unsaved",
        saved ? "You can find it in your saved items." : "Removed from saved items.",
      );
    }, [post, toast]);

    const handleDeleteComment = useCallback((comment: Comment) => {
      if (
        comment.id.startsWith("optimistic-") ||
        comment.id.startsWith("local-")
      ) {
        toast.info(
          "Comment is still syncing",
          "Please try deleting again in a moment.",
        );
        return;
      }

      deleteHandler.requestDelete(comment.id, "comment");
    }, [deleteHandler, toast]);

    const handleDeletePost = useCallback(() => {
      if (!post) return;
      deleteHandler.requestDelete(post.id, "post");
    }, [deleteHandler, post]);

    const handleConfirmDelete = useCallback(() => {
      const pending = deleteHandler.pendingTarget;
      if (pending) {
        if (pending.type === "post") {
          globalHidePost(pending.id);
          router.back();
        } else {
          globalHideComment(pending.id);
          usePostCommentOptimisticStore.getState().removeComment(id, pending.id);
          decrementCommentCount(id, rootPost?.comments ?? 0);

          if (highlight && pending.id === highlight) {
            router.back();
          }
        }
        clearSelectedComment();
      }
      deleteHandler.confirmDelete();
    }, [
      clearSelectedComment,
      deleteHandler,
      decrementCommentCount,
      globalHideComment,
      globalHidePost,
      highlight,
      id,
      rootPost?.comments,
      router,
    ]);

    const handleBlockPost = useCallback(() => {
      if (!post) return;
      blockHandler.requestBlockPost(post.id);
    }, [blockHandler, post]);

    const handleBlockPostAuthor = useCallback(() => {
      if (!post) return;
      blockHandler.requestBlockUser(post.author.id, post.author.username);
    }, [blockHandler, post]);

    const handleBlockComment = useCallback((comment: Comment) => {
      blockHandler.requestBlockComment(comment.id);
    }, [blockHandler]);

    const handleBlockCommentAuthor = useCallback((comment: Comment) => {
      blockHandler.requestBlockUser(comment.author.id, comment.author.username);
    }, [blockHandler]);

    const handleConfirmBlock = useCallback(() => {
      const pending = blockHandler.pendingBlock;
      if (pending) {
        if (pending.type === "post") {
          globalHidePost(pending.id);
          router.back();
        } else if (pending.type === "user") {
          globalBlockUser(pending.id);
          if (rootPost?.user_id === pending.id) {
            router.back();
          }
        } else if (pending.type === "comment") {
          globalHideComment(pending.id);
        }
        clearSelectedComment();
      }
      blockHandler.confirmBlock();
    }, [
      blockHandler,
      clearSelectedComment,
      globalBlockUser,
      globalHideComment,
      globalHidePost,
      rootPost?.user_id,
      router,
    ]);

    const handleReportComment = useCallback((comment: Comment) => {
      reportHandler.requestReport(comment.id, "comment");
    }, [reportHandler]);

    const handleReportPost = useCallback(() => {
      if (!post) return;
      reportHandler.requestReport(post.id, "post");
    }, [post, reportHandler]);

    const handleReportSubmit = useCallback(
      (reason: string) => {
        const pending = reportHandler.pendingTarget;
        if (pending) {
          if (pending.type === "post") {
            globalHidePost(pending.id);
            router.back();
          } else if (pending.type === "comment") {
            globalHideComment(pending.id);
          }
          clearSelectedComment();
        }
        reportHandler.submitReport(reason);
      },
      [
        clearSelectedComment,
        globalHideComment,
        globalHidePost,
        reportHandler,
        router,
      ],
    );

    const handleEditComment = useCallback((comment: Comment) => {
      if (!id || comment.id.startsWith("optimistic-")) return;
      const commentCreatedAt = comment.createdAt instanceof Date
        ? Math.floor(comment.createdAt.getTime() / 1000)
        : Math.floor(Number(comment.createdAt) / (Number(comment.createdAt) > 1e12 ? 1000 : 1));
      const params: Record<string, string> = {
        postId: id,
        postTitle: post?.title ?? "",
        postAuthorUsername: post?.author.username ?? "",
        editCommentId: comment.id,
        editParentId: comment.parentId ?? id,
        editContent: comment.content,
        editCreatedAt: String(commentCreatedAt),
        editSource: "post",
      };
      if (post?.media?.[0]?.uri) {
        params.postThumbnail = post.media[0].uri;
      }
      router.push({ pathname: "/comment-compose", params });
    }, [id, post, router]);

    const handleEditPost = useCallback(() => {
      if (!post) return;
      const createdAtSeconds = rootPost?.timestamp ?? (
        post.createdAt instanceof Date
          ? Math.floor(post.createdAt.getTime() / 1000)
          : Math.floor(Number(post.createdAt) / (Number(post.createdAt) > 1e12 ? 1000 : 1))
      );
      const editParams: Record<string, string> = {
        editPostId: post.id,
        editTopic: post.topic ?? "general",
        editTitle: post.title,
        editBody: post.body ?? rootPost?.content ?? "",
        editTag: rootPost?.tag ?? "",
        editCreatedAt: String(createdAtSeconds),
      };
      if (rootPost?.media && rootPost.media.length > 0) {
        editParams.editMedia = JSON.stringify(rootPost.media);
      } else if (post.media && post.media.length > 0) {
        editParams.editMedia = JSON.stringify(post.media.map((media) => media.uri));
      }
      router.push({ pathname: "/edit-post", params: editParams });
    }, [post, rootPost, router]);

    const handleAnnotatePost = useCallback(() => {
      if (!post) return;
      const annotateParams: Record<string, string> = {
        postId: post.id,
        postTitle: post.title,
        postTopic: post.topic ?? "",
        postContent: post.body ?? rootPost?.content ?? "",
        postTag: rootPost?.tag ?? "",
        postLikes: String(post.likes ?? 0),
        postComments: String(post.comments ?? 0),
      };
      if (post.media?.[0]?.uri) {
        annotateParams.postThumbnail = post.media[0].uri;
      }
      router.push({ pathname: "/annotate", params: annotateParams });
    }, [post, rootPost, router]);

    const presentAward = useCallback(
      (targetId: string, targetType: "post" | "comment", isOwn: boolean) => {
        setAwardTargetId(targetId);
        setAwardTargetType(targetType);
        setAwardTargetIsOwn(isOwn);
        setTimeout(() => awardPickerSheetRef.current?.present(), 300);
      },
      [],
    );

    const presentGiftMirage = useCallback((address: string, username: string) => {
      setGiftRecipientAddress(address);
      setGiftRecipientUsername(username);
      setTimeout(() => giftMirageSheetRef.current?.present(), 300);
    }, []);

    const presentGiftSubscription = useCallback((address: string, username: string) => {
      setGiftRecipientAddress(address);
      setGiftRecipientUsername(username);
      setTimeout(() => giftSubscriptionSheetRef.current?.present(), 300);
    }, []);

    return (
      <>
        <CommentOptionsSheet
          ref={optionsSheetRef}
          comment={selectedComment}
          rootPostId={actualRootPostId ?? id}
          isOwnComment={currentUserId === selectedComment?.author.id}
          isFollowingAuthor={
            selectedComment?.author.id
              ? followedUsers.includes(selectedComment.author.id)
              : false
          }
          isSaved={selectedComment ? savedComments.some((comment) => comment.id === selectedComment.id) : false}
          onSave={handleSaveComment}
          onDelete={() => selectedComment && handleDeleteComment(selectedComment)}
          onEdit={() => selectedComment && handleEditComment(selectedComment)}
          onBlockComment={() => selectedComment && handleBlockComment(selectedComment)}
          onBlockUser={() => selectedComment && handleBlockCommentAuthor(selectedComment)}
          onReport={() => selectedComment && handleReportComment(selectedComment)}
          onToggleFollowAuthor={() => {
            if (!selectedComment) return;
            handleFollowUserViaQueue(
              selectedComment.author.id,
              selectedComment.author.username,
              followedUsers.includes(selectedComment.author.id),
            );
          }}
          onGiveAward={() => {
            if (!selectedComment) return;
            presentAward(selectedComment.id, "comment", currentUserId === selectedComment.author.id);
          }}
          onGiftMirage={() => {
            if (!selectedComment) return;
            presentGiftMirage(selectedComment.author.id, selectedComment.author.username);
          }}
          onGiftSubscription={() => {
            if (!selectedComment) return;
            presentGiftSubscription(selectedComment.author.id, selectedComment.author.username);
          }}
          onDismiss={clearSelectedComment}
        />

        <PostOptionsSheet
          ref={postOptionsSheetRef}
          post={post}
          isOwnPost={currentUserId === post?.author.id}
          isTopicFollowed={post?.topic ? topicFollowOverride ?? followedTopics.includes(post.topic) : false}
          isFollowingUser={
            post?.author.id
              ? postFollowOverride ?? followedUsers.includes(post.author.id)
              : false
          }
          isSaved={post ? savedPosts.some((savedPost) => savedPost.id === post.id) : false}
          onFollowUser={() => {
            if (!post) return;
            handleFollowUserViaQueue(
              post.author.id,
              post.author.username,
              postFollowOverride ?? post.isFollowing ?? false,
            );
          }}
          onFollowTopic={() => {
            if (!post?.topic) return;
            handleFollowTopicViaQueue(
              post.topic,
              topicFollowOverride ?? followedTopics.includes(post.topic),
            );
          }}
          onSave={handleSavePost}
          onDelete={handleDeletePost}
          onEdit={handleEditPost}
          onBlockPost={handleBlockPost}
          onBlockUser={handleBlockPostAuthor}
          onReport={handleReportPost}
          onGiveAward={() => {
            if (!post) return;
            presentAward(post.id, "post", currentUserId === post.author.id);
          }}
          onGiftMirage={() => {
            if (!post) return;
            presentGiftMirage(post.author.id, post.author.username);
          }}
          onGiftSubscription={() => {
            if (!post) return;
            presentGiftSubscription(post.author.id, post.author.username);
          }}
          onAnnotate={handleAnnotatePost}
          onDismiss={() => {}}
        />

        <AwardPickerSheet
          ref={awardPickerSheetRef}
          targetId={awardTargetId}
          targetType={awardTargetType}
          isOwnContent={awardTargetIsOwn}
        />

        <GiftMirageSheet
          ref={giftMirageSheetRef}
          recipientAddress={giftRecipientAddress}
          recipientUsername={giftRecipientUsername}
        />

        <GiftSubscriptionSheet
          ref={giftSubscriptionSheetRef}
          recipientAddress={giftRecipientAddress}
          recipientUsername={giftRecipientUsername}
        />

        <ConfirmationPopup
          visible={deleteHandler.showConfirmation}
          title={deleteHandler.pendingTarget?.type === "post" ? "Delete Post?" : "Delete Comment?"}
          message="This action cannot be undone."
          description="The content will be permanently removed."
          icon="trash-outline"
          isDestructive
          isLoading={deleteHandler.isDeleting}
          confirmText="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={deleteHandler.cancelDelete}
        />

        <ConfirmationPopup
          visible={blockHandler.showConfirmation}
          title={`Block ${blockHandler.pendingBlock?.label || "user"}?`}
          message={getBlockConfirmationMessage(blockHandler.pendingBlock?.type ?? "post")}
          icon="ban-outline"
          confirmText="Block"
          isDestructive
          onConfirm={handleConfirmBlock}
          onCancel={blockHandler.cancelBlock}
        />

        <ReportSheet
          ref={reportSheetRef}
          targetType={reportHandler.pendingTarget?.type}
          onSubmit={(reason) => {
            reportSheetRef.current?.dismiss();
            handleReportSubmit(reason);
          }}
          onDismiss={reportHandler.cancelReport}
          isLoading={reportHandler.isReporting}
        />
      </>
    );
  },
);

PostDetailActionSheets.displayName = "PostDetailActionSheets";
