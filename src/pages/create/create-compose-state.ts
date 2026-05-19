import { create } from "zustand";

import type { ContentTag } from "@/src/api/write/endpoints/posts";
import { URL_REGEX, looksLikeUrlWithoutProtocol } from "./create-screen-utils";

type CreateComposeState = {
  showCommunityModal: boolean;
  showLinkInput: boolean;
  linkName: string;
  linkUrl: string;
  linkError: string | null;
  showContentWarningModal: boolean;
  selectedContentWarning: ContentTag;
  showStickerPicker: boolean;
  selectedStickers: string[];
  openCommunityModal: () => void;
  closeCommunityModal: () => void;
  openLinkInput: () => void;
  setLinkName: (value: string) => void;
  setLinkUrl: (value: string) => void;
  resetLinkInput: () => void;
  openContentWarningModal: () => void;
  closeContentWarningModal: () => void;
  setSelectedContentWarning: (warning: ContentTag) => void;
  clearContentWarning: () => void;
  openStickerPicker: () => void;
  closeStickerPicker: () => void;
  setSelectedStickers: (urls: string[]) => void;
  removeSticker: (url: string) => void;
  resetComposeState: () => void;
};

const initialState = {
  showCommunityModal: false,
  showLinkInput: false,
  linkName: "",
  linkUrl: "",
  linkError: null,
  showContentWarningModal: false,
  selectedContentWarning: "" as ContentTag,
  showStickerPicker: false,
  selectedStickers: [],
};

export const useCreateComposeState = create<CreateComposeState>((set) => ({
  ...initialState,
  openCommunityModal: () => set({ showCommunityModal: true }),
  closeCommunityModal: () => set({ showCommunityModal: false }),
  openLinkInput: () => set({ showLinkInput: true }),
  setLinkName: (value) => set({ linkName: value }),
  setLinkUrl: (value) => {
    const trimmed = value.trim();
    let linkError: string | null = null;

    if (trimmed.length > 0) {
      if (URL_REGEX.test(trimmed)) {
        linkError = null;
      } else if (looksLikeUrlWithoutProtocol(trimmed)) {
        linkError = "Add https:// to the beginning of your link";
      } else {
        linkError = "Please enter a valid URL (e.g., https://example.com)";
      }
    }

    set({ linkUrl: value, linkError });
  },
  resetLinkInput: () =>
    set({
      showLinkInput: false,
      linkName: "",
      linkUrl: "",
      linkError: null,
    }),
  openContentWarningModal: () => set({ showContentWarningModal: true }),
  closeContentWarningModal: () => set({ showContentWarningModal: false }),
  setSelectedContentWarning: (warning) =>
    set({ selectedContentWarning: warning, showContentWarningModal: false }),
  clearContentWarning: () => set({ selectedContentWarning: "" }),
  openStickerPicker: () => set({ showStickerPicker: true }),
  closeStickerPicker: () => set({ showStickerPicker: false }),
  setSelectedStickers: (urls) => set({ selectedStickers: urls }),
  removeSticker: (url) =>
    set((state) => ({
      selectedStickers: state.selectedStickers.filter((stickerUrl) => stickerUrl !== url),
    })),
  resetComposeState: () => set(initialState),
}));
