import { useCallback } from "react";

import * as Sentry from "@sentry/react-native";
import type { QueryClient } from "@tanstack/react-query";

import { patchEditedPostAcrossCaches } from "@/src/api/cache/posts-cache";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import type { CreatePostMutationInput } from "@/src/api/write";
import type { EditPostInput } from "@/src/api/write/endpoints/posts";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { waitForQueueDrain, usePowQueueStore } from "@/src/services/pow-queue";
import type { PostDraft } from "@/src/stores/draft-store";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import { markEditJustCompleted } from "@/src/utils/edit-post";
import { isPowCancelled } from "@/src/wallet";

import { VIDEO_UPLOADS } from "./use-create-video-uploads";

type ToastApi = {
  error: (title: string, message?: string) => void;
};

type RouterApi = {
  back: () => void;
  replace: (route: string) => void;
};

type TxProgressApi = {
  isVisible: boolean;
  progress: { phase?: string };
  updatePoWProgress: (progress: any) => void;
  startTransaction: () => void;
  setPhase: (phase: string) => void;
  reset: () => void;
  setSuccess: (hash?: string) => void;
  hideModal: () => void;
  setError: (message: string) => void;
};

type MutationLike<TInput> = {
  mutateAsync: (input: TInput) => Promise<any>;
};

type UseCreateSubmitParams = {
  canPost: boolean;
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
  draft: PostDraft;
  clearDraft: () => void;
  isEditMode: boolean;
  editPostId: string;
  selectedContentWarning: string;
  selectedStickers: string[];
  setSelectedContentWarning: (value: any) => void;
  setSelectedStickers: (value: string[]) => void;
  setShowLinkInput: (value: boolean) => void;
  setLinkUrl: (value: string) => void;
  setLinkError: (value: string | null) => void;
  setImageDimensions: (value: { width: number; height: number } | null) => void;
  setIsVideoMuted: (value: boolean) => void;
  clearVideoUploads: () => void;
  clearVideoMeta: () => void;
  clearHandledVideoParam: () => void;
  queryClient: QueryClient;
  txProgress: TxProgressApi;
  postMutation: MutationLike<CreatePostMutationInput>;
  editMutation: MutationLike<EditPostInput>;
  toast: ToastApi;
  router: RouterApi;
  triggerScrollToTop: () => void;
  uploadImageAndGetUrl: (uri: string) => Promise<string>;
};

export function useCreateSubmit({
  canPost,
  isSubmitting,
  setIsSubmitting,
  draft,
  clearDraft,
  isEditMode,
  editPostId,
  selectedContentWarning,
  selectedStickers,
  setSelectedContentWarning,
  setSelectedStickers,
  setShowLinkInput,
  setLinkUrl,
  setLinkError,
  setImageDimensions,
  setIsVideoMuted,
  clearVideoUploads,
  clearVideoMeta,
  clearHandledVideoParam,
  queryClient,
  txProgress,
  postMutation,
  editMutation,
  toast,
  router,
  triggerScrollToTop,
  uploadImageAndGetUrl,
}: UseCreateSubmitParams) {
  return useCallback(async () => {
    if (!canPost || isSubmitting) return;
    if (txProgress.isVisible && txProgress.progress.phase !== "error") return;

    setIsSubmitting(true);
    txProgress.startTransaction();
    triggerHaptic("medium");

    try {
      const powState = usePowQueueStore.getState();
      if (powState.isProcessing || powState.queue.length > 0 || powState.currentAction) {
        txProgress.setPhase("waiting");
        await waitForQueueDrain();
      }

      const mediaUrls: string[] = [];

      if (selectedStickers.length > 0) {
        mediaUrls.push(...selectedStickers);
      }

      if (draft.attachmentType === "image" && draft.mediaUris.length > 0) {
        try {
          const uploads = await Promise.all(
            draft.mediaUris.map((uri) => uploadImageAndGetUrl(uri)),
          );
          mediaUrls.push(...uploads);
        } catch (error) {
          Sentry.addBreadcrumb({
            category: "image-upload",
            message: "Image upload failed",
            data: { error: String(error) },
            level: "error",
          });
          const status = (error as { status?: number }).status;
          const responseText = (error as { responseText?: string }).responseText ?? "";
          const isUnsupportedFormat = status === 422 && responseText.includes("decoding");
          toast.error(
            "Image upload failed",
            isUnsupportedFormat
              ? "This image format isn't supported. Try a different photo."
              : error instanceof Error
                ? error.message
                : "Please try again",
          );
          setIsSubmitting(false);
          txProgress.reset();
          return;
        }
      }

      if (draft.attachmentType === "video") {
        for (const [, entry] of VIDEO_UPLOADS) {
          if (entry.url) {
            mediaUrls.push(entry.url);
          }
        }
      }

      let content = draft.body;
      if (draft.linkUrl) {
        content = content ? `${draft.linkUrl}\n\n${content}` : draft.linkUrl;
      }

      const isUserProfile = draft.community?.description === "Post to your profile";
      const topic = isUserProfile ? "general" : (draft.community?.id ?? "general");

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
        result = await editMutation.mutateAsync(editInput);
      } else {
        const postInput: CreatePostMutationInput = {
          topic,
          title: draft.title.trim(),
          content,
          tag: selectedContentWarning,
          media: mediaUrls.length > 0 ? mediaUrls : undefined,
          optimisticMediaUrl: mediaUrls[0] ?? undefined,
          optimisticMediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        };
        result = await postMutation.mutateAsync(postInput);
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
        patchEditedPostAcrossCaches(queryClient, editPostId, {
          title: draft.title.trim(),
          content,
          tag: selectedContentWarning || undefined,
          topic: topic || undefined,
          media: mediaUrls.length > 0 ? mediaUrls : undefined,
          edited_at: nowSeconds,
        });

        setSelectedContentWarning("");
        setSelectedStickers([]);
        setShowLinkInput(false);
        setLinkUrl("");
        setLinkError(null);
        setImageDimensions(null);
        clearVideoUploads();
        clearVideoMeta();
        clearHandledVideoParam();
        setIsVideoMuted(false);
        clearDraft();
        setIsSubmitting(false);

        markEditJustCompleted();
        setTimeout(() => {
          txProgress.hideModal();
          router.back();
        }, 500);
      } else {
        txProgress.setPhase("confirming");
        if (result?.tx_hash) {
          for (let i = 0; i < 30; i++) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
              const status = await getTxStatus({ hash: result.tx_hash });
              if (status.found && status.indexed) {
                break;
              }
            } catch {}
          }
        }

        txProgress.setSuccess(result?.tx_hash);

        setSelectedContentWarning("");
        setSelectedStickers([]);
        setShowLinkInput(false);
        setLinkUrl("");
        setLinkError(null);
        setImageDimensions(null);
        clearVideoUploads();
        clearVideoMeta();
        clearHandledVideoParam();
        setIsVideoMuted(false);
        clearDraft();
        setIsSubmitting(false);
        triggerScrollToTop();

        setTimeout(() => {
          txProgress.hideModal();
          useHomePostCardStore.getState().setSkipNextRefresh(true);
          router.replace("/(tabs)/");
        }, 1000);
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
          tags: {
            feature: "create-post",
            operation: "submit",
            is_edit: String(isEditMode),
          },
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
          txProgress.setError(
            "No internet connection. Please check your network and try again.",
          );
        } else {
          const serverError = (error as any)?.response?.data?.error;
          const fallback = isEditMode ? "Failed to edit post" : "Failed to create post";
          const errorMessage =
            serverError || (error instanceof Error ? error.message : fallback);
          txProgress.setError(errorMessage);
        }
      }
    }
  }, [
    canPost,
    clearDraft,
    clearHandledVideoParam,
    clearVideoMeta,
    clearVideoUploads,
    draft,
    editMutation,
    editPostId,
    isEditMode,
    isSubmitting,
    postMutation,
    queryClient,
    router,
    selectedContentWarning,
    selectedStickers,
    setImageDimensions,
    setIsSubmitting,
    setIsVideoMuted,
    setLinkError,
    setLinkUrl,
    setSelectedContentWarning,
    setSelectedStickers,
    setShowLinkInput,
    toast,
    triggerScrollToTop,
    txProgress,
    uploadImageAndGetUrl,
  ]);
}
