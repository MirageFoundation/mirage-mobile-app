import { useCallback, useState } from "react";
import { Keyboard } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";

import { useEdit, usePost, type CreatePostMutationInput, type EditPostMutationInput } from "@/src/api/write";
import { applyOptimisticPostEdit, buildOptimisticPost, markOptimisticPostError, upsertHomePost } from "@/src/api/write/hooks/use-post";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useTransactionProgress } from "@/src/hooks/use-transaction-progress";
import { router } from "@/src/navigation/guarded-router";
import { useToast } from "@/src/providers/toast-provider";
import { generateActionId, getActionLabel, usePowQueueStore } from "@/src/services/pow-queue";
import { useAuthStore } from "@/src/stores/auth-store";
import { useDraftStore, type PostDraft } from "@/src/stores/draft-store";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import { getAllowedTagsFromContentTypes, usePreferencesStore } from "@/src/stores/preferences-store";
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
  const selectedContentTypes = usePreferencesStore((state) => state.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((state) => state.adultContentEnabled);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePost = useCallback(async () => {
    if (!canPost || isSubmitting) return;
    if (txProgress.isVisible && txProgress.progress.phase !== "error") return;

    Keyboard.dismiss();
    setIsSubmitting(true);
    triggerHaptic("medium");

    try {
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

      if (isEditMode) {
        if (!editPostId) {
          throw new Error("Missing editPostId for edit operation");
        }
        if (!draft.title.trim() && !content) {
          throw new Error("Title or content is required");
        }
        const actionId = generateActionId();
        const editInput: EditPostMutationInput = {
          postId: editPostId,
          topic,
          title: draft.title.trim(),
          content: content || "",
          tag: selectedContentWarning,
          media: mediaUrls.length > 0 ? mediaUrls : [],
          optimisticActionId: actionId,
        };
        console.log("[CreateScreen] Edit input:", {
          postId: editInput.postId,
          topic: editInput.topic,
          titleLength: editInput.title.length,
          contentLength: editInput.content.length,
          tag: editInput.tag,
          mediaCount: editInput.media?.length ?? 0,
        });
        usePowQueueStore.getState().enqueue({
          id: actionId,
          type: "edit",
          label: getActionLabel("edit"),
          execute: async () => {
            Sentry.addBreadcrumb({
              category: "edit-post",
              message: "Executing queued edit post action",
              level: "info",
              data: {
                editPostId,
                actionId,
                mediaCount: mediaUrls.length,
              },
            });
            return editMutation.mutateAsync(editInput);
          },
          onOptimisticUpdate: () => {
            applyOptimisticPostEdit(queryClient, editInput, "pending");
            usePostEditStore.getState().setOverride(editPostId, {
              title: editInput.title,
              content: editInput.content,
              topic,
              tag: selectedContentWarning || undefined,
              media: mediaUrls.length > 0 ? mediaUrls : undefined,
              editedAt: Math.floor(Date.now() / 1000),
            });
            setTimeout(() => {
              usePostEditStore.getState().clearOverride(editPostId);
            }, 120000);
          },
          onError: (err) => {
            const toastMessage = getApiErrorMessage(err);
            applyOptimisticPostEdit(queryClient, editInput, "error", toastMessage);
            toast.error("Post wasn't edited", toastMessage);
          },
        });

        resetComposeState();
        resetVideoUploads();
        resetImageUploads();
        VIDEO_META.clear();
        setHandledVideoParam(null);
        clearDraft();
        setIsSubmitting(false);
        markEditJustCompleted();
        router.back();
        return;
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
            const optimisticPost = buildOptimisticPost(
              undefined,
              postInput,
              currentUser?.walletAddress ?? currentUser?.id ?? null,
              currentUser?.username,
              "pending",
            );
            const upsertOptions = {
              address: currentUser?.walletAddress,
              allowedTags: getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled) || undefined,
              limit: 10,
            };
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
            upsertHomePost(queryClient, optimisticPost, upsertOptions);
            [500, 1500, 3000].forEach((delay) => {
              setTimeout(() => {
                upsertHomePost(queryClient, optimisticPost, upsertOptions);
              }, delay);
            });
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
    selectedContentTypes,
    adultContentEnabled,
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
