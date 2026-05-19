import { useCallback, useState } from "react";
import { Keyboard } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";

import { queryKeys } from "@/src/api/read/query-keys";
import { useEdit, usePost, type CreatePostMutationInput } from "@/src/api/write";
import type { EditPostInput } from "@/src/api/write/endpoints/posts";
import { buildOptimisticPost, markOptimisticPostError, upsertHomePost } from "@/src/api/write/hooks/use-post";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useTransactionProgress } from "@/src/hooks/use-transaction-progress";
import { router } from "@/src/navigation/guarded-router";
import { useToast } from "@/src/providers/toast-provider";
import { generateActionId, getActionLabel, usePowQueueStore, waitForQueueDrain } from "@/src/services/pow-queue";
import { useAuthStore } from "@/src/stores/auth-store";
import { useDraftStore, type PostDraft } from "@/src/stores/draft-store";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import { markEditJustCompleted } from "@/src/utils/edit-post";
import { getApiErrorMessage } from "@/src/utils/parse-api-error";
import { isPowCancelled } from "@/src/wallet";
import { useCreateComposeState } from "./create-compose-state";
import { getPostFailureDetails } from "./create-screen-utils";
import { VIDEO_META, VIDEO_UPLOADS, setHandledVideoParam } from "./create-upload-state";

type UseCreateSubmitFlowOptions = {
  canPost: boolean;
  editPostId: string;
  getUploadedImageUrls: (uris: string[]) => Promise<string[]>;
  isEditMode: boolean;
  resetImageUploads: () => void;
  resetVideoUploads: () => void;
};

export function useCreateSubmitFlow({
  canPost,
  editPostId,
  getUploadedImageUrls,
  isEditMode,
  resetImageUploads,
  resetVideoUploads,
}: UseCreateSubmitFlowOptions) {
  const queryClient = useQueryClient();
  const txProgress = useTransactionProgress();
  const postMutation = usePost({ onPoWProgress: txProgress.updatePoWProgress });
  const editMutation = useEdit({ onPoWProgress: txProgress.updatePoWProgress });
  const triggerScrollToTop = useHomePostCardStore((state) => state.triggerScrollToTop);
  const currentUser = useAuthStore((state) => state.user);
  const toast = useToast();
  const { draft, clearDraft } = useDraftStore();
  const selectedContentWarning = useCreateComposeState((state) => state.selectedContentWarning);
  const selectedStickers = useCreateComposeState((state) => state.selectedStickers);
  const resetComposeState = useCreateComposeState((state) => state.resetComposeState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePost = useCallback(async () => {
    if (!canPost || isSubmitting) return;
    if (txProgress.isVisible && txProgress.progress.phase !== "error") return;

    Keyboard.dismiss();
    setIsSubmitting(true);
    if (isEditMode) {
      txProgress.startTransaction();
    }
    triggerHaptic("medium");

    try {
      const powState = usePowQueueStore.getState();
      if (isEditMode && (powState.isProcessing || powState.queue.length > 0 || powState.currentAction)) {
        txProgress.setPhase("waiting");
        await waitForQueueDrain();
      }

      const mediaUrls: string[] = [];

      if (selectedStickers.length > 0) {
        mediaUrls.push(...selectedStickers);
      }

      if (isEditMode && draft.attachmentType === "image" && draft.mediaUris.length > 0) {
        try {
          const uploads = await getUploadedImageUrls(draft.mediaUris);
          mediaUrls.push(...uploads);
        } catch (error) {
          Sentry.addBreadcrumb({ category: "image-upload", message: "Image upload failed", data: { error: String(error) }, level: "error" });
          const status = (error as { status?: number }).status;
          const responseText = (error as { responseText?: string }).responseText ?? "";
          const isUnsupportedFormat = status === 422 && responseText.includes("decoding");
          toast.error(
            "Image upload failed",
            isUnsupportedFormat
              ? "This image format isn't supported. Try a different photo."
              : error instanceof Error ? error.message : "Please try again",
          );
          setIsSubmitting(false);
          txProgress.reset();
          return;
        }
      }

      if (draft.attachmentType === "video") {
        const missing: string[] = [];
        const videoUrls: string[] = [];
        for (const uri of draft.mediaUris) {
          const entry = VIDEO_UPLOADS.get(uri);
          if (!entry || !entry.url || entry.uploading || entry.error) {
            missing.push(uri);
          } else {
            videoUrls.push(entry.url);
          }
        }
        if (missing.length > 0) {
          Sentry.addBreadcrumb({
            category: "video-upload",
            message: "Submit blocked: video upload not finalized",
            level: "error",
            data: {
              missingCount: missing.length,
              totalCount: draft.mediaUris.length,
            },
          });
          toast.error(
            "Video upload not finished",
            "One or more videos failed to upload. Please retry or remove them before posting.",
          );
          triggerHaptic("error");
          setIsSubmitting(false);
          txProgress.reset();
          return;
        }
        mediaUrls.push(...videoUrls);
      }

      let content = draft.body;

      if (draft.linkUrl) {
        content = content ? `${draft.linkUrl}\n\n${content}` : draft.linkUrl;
      }

      console.log("[CreateScreen] Submitting post:", {
        title: draft.title.trim().slice(0, 50),
        linkUrl: draft.linkUrl,
        contentPreview: content?.slice(0, 200),
        attachmentType: draft.attachmentType,
        mediaCount: mediaUrls.length,
      });

      const isUserProfile =
        draft.community?.description === "Post to your profile";
      const topic = isUserProfile
        ? "general"
        : (draft.community?.id ?? "general");

      txProgress.setPhase("signing");

      let result;
      if (isEditMode) {
        if (!editPostId) {
          throw new Error("Missing editPostId for edit operation");
        }
        if (!draft.title.trim() && !content) {
          throw new Error("Title or content is required");
        }
        const editInput: EditPostInput = {
          postId: editPostId,
          topic,
          title: draft.title.trim(),
          content: content || "",
          tag: selectedContentWarning,
          media: mediaUrls.length > 0 ? mediaUrls : [],
        };
        console.log("[CreateScreen] Edit input:", {
          postId: editInput.postId,
          topic: editInput.topic,
          titleLength: editInput.title.length,
          contentLength: editInput.content.length,
          tag: editInput.tag,
          mediaCount: editInput.media?.length ?? 0,
        });
        result = await editMutation.mutateAsync(editInput);
      } else {
        const optimisticId = `optimistic-post-${Date.now()}`;
        const optimisticDraft: PostDraft = { ...draft };
        const actionId = generateActionId();
        const optimisticPreviewMediaUrls =
          (draft.attachmentType === "image" || draft.attachmentType === "video") && draft.mediaUris.length > 0
            ? draft.mediaUris
            : undefined;
        const postInput: CreatePostMutationInput = {
          topic,
          title: draft.title.trim(),
          content: content,
          tag: selectedContentWarning,
          media: mediaUrls.length > 0 ? mediaUrls : undefined,
          optimisticId,
          optimisticActionId: actionId,
          optimisticMediaUrl: mediaUrls[0] ?? undefined,
          optimisticMediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          optimisticPreviewMediaUrls,
          optimisticDraft,
        };
        usePowQueueStore.getState().enqueue({
          id: actionId,
          type: "post",
          label: getActionLabel("post"),
          execute: async () => {
            Sentry.addBreadcrumb({
              category: "create-post",
              message: "Executing queued create post action",
              level: "info",
              data: {
                optimisticId,
                actionId,
                attachmentType: draft.attachmentType,
                mediaCount: draft.mediaUris.length,
                hasOptimisticPreview: !!optimisticPreviewMediaUrls?.length,
              },
            });
            let uploadedMediaUrls = mediaUrls;
            if (draft.attachmentType === "image" && draft.mediaUris.length > 0) {
              try {
                const uploads = await getUploadedImageUrls(draft.mediaUris);
                uploadedMediaUrls = [...mediaUrls, ...uploads];
              } catch (error) {
                Sentry.addBreadcrumb({ category: "image-upload", message: "Image upload failed", data: { error: String(error) }, level: "error" });
                throw error;
              }
            }
            return postMutation.mutateAsync({
              ...postInput,
              media: uploadedMediaUrls.length > 0 ? uploadedMediaUrls : undefined,
              optimisticMediaUrl: uploadedMediaUrls[0] ?? postInput.optimisticMediaUrl,
              optimisticMediaUrls: uploadedMediaUrls.length > 0 ? uploadedMediaUrls : postInput.optimisticMediaUrls,
            });
          },
          onOptimisticUpdate: () => {
            Sentry.addBreadcrumb({
              category: "create-post",
              message: "Inserted optimistic post into home feed",
              level: "info",
              data: {
                optimisticId,
                actionId,
                attachmentType: draft.attachmentType,
                mediaCount: draft.mediaUris.length,
              },
            });
            upsertHomePost(
              queryClient,
              buildOptimisticPost(
                undefined,
                postInput,
                currentUser?.walletAddress ?? currentUser?.id ?? null,
                currentUser?.username,
                "pending",
              ),
            );
          },
          onError: (err) => {
            const toastMessage = getApiErrorMessage(err);
            const postErrorDetails = getPostFailureDetails(err);
            Sentry.captureException(err, {
              tags: {
                feature: "create-post",
                operation: "queued-create-post",
              },
              extra: {
                optimisticId,
                actionId,
                attachmentType: draft.attachmentType,
                mediaCount: draft.mediaUris.length,
                toastMessage,
                postErrorDetails,
              },
            });
            markOptimisticPostError(queryClient, optimisticId, postErrorDetails);
            toast.error("Post wasn't created", toastMessage);
          },
        });

        resetComposeState();
        resetVideoUploads();
        resetImageUploads();
        VIDEO_META.clear();
        setHandledVideoParam(null);
        clearDraft();
        setIsSubmitting(false);
        triggerScrollToTop();
        useHomePostCardStore.getState().setSkipNextRefresh(true);
        router.replace("/");
        return;
      }

      if (isEditMode) {
        txProgress.setSuccess(result?.tx_hash);

        usePostEditStore.getState().setOverride(editPostId, {
          title: draft.title.trim(),
          content: content || "",
          topic,
          tag: selectedContentWarning || undefined,
          media: mediaUrls.length > 0 ? mediaUrls : undefined,
          editedAt: Math.floor(Date.now() / 1000),
        });

        setTimeout(() => {
          usePostEditStore.getState().clearOverride(editPostId);
        }, 120000);

        const nowSeconds = Math.floor(Date.now() / 1000);
        const updatePostInCache = (post: any) => {
          if (post?.post_id !== editPostId) return post;
          return {
            ...post,
            title: draft.title.trim(),
            content,
            tag: selectedContentWarning || post.tag,
            topic: topic || post.topic,
            media: mediaUrls.length > 0 ? mediaUrls : post.media,
            edited_at: nowSeconds,
          };
        };
        const applyToData = (data: any) => {
          if (!data) return data;
          if (data.pages && Array.isArray(data.pages)) {
            return {
              ...data,
              pages: data.pages.map((page: any) => ({
                ...page,
                posts: page.posts.map(updatePostInCache),
              })),
            };
          }
          if (data.posts && Array.isArray(data.posts)) {
            return { ...data, posts: data.posts.map(updatePostInCache) };
          }
          return data;
        };
        queryClient.getQueriesData({ queryKey: queryKeys.postsRoot() }).forEach(([key]) => {
          queryClient.setQueryData(key, (old: any) => applyToData(old));
        });
        queryClient.getQueriesData({ queryKey: queryKeys.userPostsRoot() }).forEach(([key]) => {
          queryClient.setQueryData(key, (old: any) => applyToData(old));
        });
        queryClient.getQueriesData<any>({ queryKey: queryKeys.commentsRoot() }).forEach(([key, data]) => {
          if (data?.root?.post_id === editPostId) {
            queryClient.setQueryData(key, {
              ...data,
              root: {
                ...data.root,
                title: draft.title.trim(),
                content,
                tag: selectedContentWarning || data.root.tag,
                topic: topic || data.root.topic,
                media: mediaUrls.length > 0 ? mediaUrls : data.root.media,
                edited_at: nowSeconds,
              },
            });
          }
        });

        resetComposeState();
        resetVideoUploads();
        VIDEO_META.clear();
        setHandledVideoParam(null);
        clearDraft();
        setIsSubmitting(false);

        markEditJustCompleted();
        setTimeout(() => {
          txProgress.hideModal();
          router.back();
        }, 500);
      }
    } catch (error) {
      setIsSubmitting(false);

      if (isPowCancelled(error)) {
        txProgress.hideModal();
        toast.error(
          "Post wasn't created",
          "The app was closed while processing. Your draft has been saved — tap post to retry.",
        );
      } else {
        Sentry.captureException(error, {
          tags: { feature: "create-post", operation: "submit", is_edit: String(isEditMode) },
          extra: {
            responseStatus: (error as any)?.response?.status,
            responseData: (error as any)?.response?.data,
            editPostId: isEditMode ? editPostId : undefined,
            topic: isEditMode ? (draft.community?.id ?? "general") : undefined,
            hasMedia: undefined,
          },
        });

        const isNetworkError =
          (error as any)?.code === "ERR_NETWORK" ||
          (error as any)?.message === "Network Error";
        if (isNetworkError) {
          txProgress.setError("No internet connection. Please check your network and try again.");
        } else {
          const serverError = (error as any)?.response?.data?.error;
          const fallback = isEditMode ? "Failed to edit post" : "Failed to create post";
          const errorMessage = serverError || (error instanceof Error ? error.message : fallback);
          txProgress.setError(errorMessage);
        }
      }
    }
  }, [
    canPost,
    isSubmitting,
    draft,
    clearDraft,
    postMutation,
    editMutation,
    isEditMode,
    editPostId,
    toast,
    selectedContentWarning,
    txProgress,
    queryClient,
    currentUser,
    selectedStickers,
    getUploadedImageUrls,
    resetComposeState,
    resetVideoUploads,
    resetImageUploads,
    triggerScrollToTop,
  ]);

  return {
    handlePost,
    isSubmitting,
    setIsSubmitting,
    txProgress,
  };
}
