import { useEffect, useRef } from "react";

import type { ContentTag } from "@/src/api/write/endpoints/posts";
import { useDraftStore, type Community, type PostDraft } from "@/src/stores/draft-store";

type EditParams = {
  editTopic?: string;
  editTitle?: string;
  editBody?: string;
  editTag?: string;
  editMedia?: string;
};

type UseCreateEditInitializationParams = {
  isEditMode: boolean;
  params: EditParams;
  clearDraft: () => void;
  updateDraft: (draft: Partial<PostDraft>) => void;
  setSelectedContentWarning: (tag: ContentTag) => void;
  setSelectedStickers: (stickers: string[]) => void;
};

export function useCreateEditInitialization({
  isEditMode,
  params,
  clearDraft,
  updateDraft,
  setSelectedContentWarning,
  setSelectedStickers,
}: UseCreateEditInitializationParams) {
  const editInitializedRef = useRef(false);
  const savedDraftForEditRef = useRef<PostDraft | null>(null);

  useEffect(() => {
    if (!isEditMode || editInitializedRef.current) return;
    editInitializedRef.current = true;

    const currentDraft = useDraftStore.getState().draft;
    const hasExistingCreateDraft =
      currentDraft.title.trim().length > 0 ||
      currentDraft.body.trim().length > 0 ||
      currentDraft.mediaUris.length > 0 ||
      currentDraft.linkUrl !== null ||
      currentDraft.community !== null ||
      currentDraft.attachmentType !== null;
    savedDraftForEditRef.current = hasExistingCreateDraft ? currentDraft : null;

    clearDraft();

    const topic = params.editTopic ?? "general";
    const community: Community = {
      id: topic,
      name: topic,
      memberCount: 0,
      isSubscribed: true,
    };
    updateDraft({
      community,
      title: params.editTitle ?? "",
      body: params.editBody ?? "",
    });

    if (params.editTag) {
      setSelectedContentWarning(params.editTag as ContentTag);
    }

    if (params.editMedia) {
      try {
        const mediaUrls = JSON.parse(params.editMedia) as string[];
        if (mediaUrls.length > 0) {
          setSelectedStickers(mediaUrls);
        }
      } catch {}
    }
  }, [
    clearDraft,
    isEditMode,
    params.editBody,
    params.editMedia,
    params.editTag,
    params.editTitle,
    params.editTopic,
    setSelectedContentWarning,
    setSelectedStickers,
    updateDraft,
  ]);

  useEffect(() => {
    if (!isEditMode) return;
    return () => {
      clearDraft();
      const saved = savedDraftForEditRef.current;
      if (saved) {
        useDraftStore.setState({ draft: saved, hasDraft: true });
      }
      savedDraftForEditRef.current = null;
    };
  }, [isEditMode, clearDraft]);
}
