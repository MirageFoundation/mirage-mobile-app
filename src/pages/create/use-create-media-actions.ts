import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { useCallback } from "react";

import * as ImagePicker from "expo-image-picker";
import * as Sentry from "@sentry/react-native";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useDraftStore } from "@/src/stores/draft-store";

import { VIDEO_META } from "./use-create-intake";

type ToastApi = {
  error: (title: string, message?: string) => void;
};

type RouterApi = {
  push: (args: any) => void;
};

type DraftLike = {
  body: string;
  attachmentType: string | null;
  mediaUris: string[];
};

type UseCreateMediaActionsParams = {
  draft: DraftLike;
  hasAttachment: boolean;
  showLinkInput: boolean;
  linkInputRef: RefObject<any>;
  bodyInputRef: RefObject<any>;
  bodySelectionRef: MutableRefObject<{ start: number; end: number }>;
  setBodySelection: Dispatch<SetStateAction<{ start: number; end: number } | undefined>>;
  setShowLinkInput: Dispatch<SetStateAction<boolean>>;
  setLinkUrl: Dispatch<SetStateAction<string>>;
  setLinkError: Dispatch<SetStateAction<string | null>>;
  setImageDimensions: Dispatch<SetStateAction<{ width: number; height: number } | null>>;
  setShowStickerPicker: Dispatch<SetStateAction<boolean>>;
  setSelectedStickers: Dispatch<SetStateAction<string[]>>;
  setIsPreparingVideo: Dispatch<SetStateAction<boolean>>;
  setAttachment: (type: any, uri?: string) => void;
  updateDraft: (partial: any) => void;
  removeAttachment: () => void;
  removeVideoUpload: (uri: string) => void;
  router: RouterApi;
  toast: ToastApi;
  editExpired: boolean;
  navigatedToEditorRef: MutableRefObject<boolean>;
  urlRegex: RegExp;
  looksLikeUrlWithoutProtocol: (text: string) => boolean;
};

export function useCreateMediaActions({
  draft,
  hasAttachment,
  showLinkInput,
  linkInputRef,
  bodyInputRef,
  bodySelectionRef,
  setBodySelection,
  setShowLinkInput,
  setLinkUrl,
  setLinkError,
  setImageDimensions,
  setShowStickerPicker,
  setSelectedStickers,
  setIsPreparingVideo,
  setAttachment,
  updateDraft,
  removeAttachment,
  removeVideoUpload,
  router,
  toast,
  editExpired,
  navigatedToEditorRef,
  urlRegex,
  looksLikeUrlWithoutProtocol,
}: UseCreateMediaActionsParams) {
  const handleLinkPress = useCallback(() => {
    if (hasAttachment && !showLinkInput) return;
    triggerHaptic("selection");
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.focus(), 100);
  }, [hasAttachment, linkInputRef, setShowLinkInput, showLinkInput]);

  const handleLinkChange = useCallback(
    (text: string) => {
      setLinkUrl(text);
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        if (urlRegex.test(text)) {
          setLinkError(null);
          setAttachment("link", text);
          updateDraft({ linkUrl: text });
        } else if (looksLikeUrlWithoutProtocol(trimmed)) {
          setLinkError("Add https:// to the beginning of your link");
        } else {
          setLinkError("Please enter a valid URL (e.g., https://example.com)");
        }
      } else {
        setLinkError(null);
      }
    },
    [looksLikeUrlWithoutProtocol, setAttachment, setLinkError, setLinkUrl, updateDraft, urlRegex],
  );

  const handleRemoveLink = useCallback(() => {
    setShowLinkInput(false);
    setLinkUrl("");
    setLinkError(null);
    removeAttachment();
  }, [removeAttachment, setLinkError, setLinkUrl, setShowLinkInput]);

  const handleImagePress = useCallback(async () => {
    if (hasAttachment && draft.attachmentType !== "image") return;
    triggerHaptic("selection");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 10 - draft.mediaUris.length,
    });

    if (!result.canceled && result.assets[0]) {
      for (const asset of result.assets) {
        setAttachment("image", asset.uri);
      }
      const lastAsset = result.assets[result.assets.length - 1];
      if (lastAsset.width && lastAsset.height) {
        setImageDimensions({ width: lastAsset.width, height: lastAsset.height });
      }
    }
  }, [draft.attachmentType, draft.mediaUris.length, hasAttachment, setAttachment, setImageDimensions]);

  const handleVideoPress = useCallback(async () => {
    if (hasAttachment && draft.attachmentType !== "video") return;
    if (draft.mediaUris.length >= 10) return;
    triggerHaptic("selection");

    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        toast.error("Permission required", "Please allow access to your photo library");
        return;
      }

      setIsPreparingVideo(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        quality: 1,
        videoExportPreset: ImagePicker.VideoExportPreset.HighestQuality,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Automatic,
      });

      if (result.canceled) {
        setIsPreparingVideo(false);
        return;
      }

      if (result.assets[0]) {
        navigatedToEditorRef.current = true;
        const asset = result.assets[0];
        setTimeout(() => {
          router.push({
            pathname: "/video-editor",
            params: {
              uri: asset.uri,
              width: asset.width?.toString() ?? "1920",
              height: asset.height?.toString() ?? "1080",
            },
          });
        }, 100);
      }
    } catch (error) {
      setIsPreparingVideo(false);
      Sentry.captureException(error, {
        tags: { feature: "create-post", operation: "video-picker" },
      });
      toast.error(
        "Couldn't load video",
        "Try a different video or re-download it from iCloud",
      );
    }
  }, [
    draft.attachmentType,
    draft.mediaUris.length,
    hasAttachment,
    navigatedToEditorRef,
    router,
    setIsPreparingVideo,
    toast,
  ]);

  const handleStickerPress = useCallback(() => {
    triggerHaptic("selection");
    setShowStickerPicker(true);
  }, [setShowStickerPicker]);

  const handleSpoilerPress = useCallback(() => {
    triggerHaptic("selection");
    const { start, end } = bodySelectionRef.current;
    const before = draft.body.slice(0, start);
    const selected = draft.body.slice(start, end);
    const after = draft.body.slice(end);
    const newBody = selected
      ? `${before}||${selected}||${after}`
      : `${before}||||${after}`;
    updateDraft({ body: newBody });
    const cursorPos = selected ? start + selected.length + 4 : start + 2;
    setTimeout(() => {
      bodyInputRef.current?.focus();
      setBodySelection({ start: cursorPos, end: cursorPos });
      setTimeout(() => setBodySelection(undefined), 50);
    }, 50);
  }, [bodyInputRef, bodySelectionRef, draft.body, setBodySelection, updateDraft]);

  const handleRemoveImageItem = useCallback((uri: string) => {
    triggerHaptic("selection");
    useDraftStore.getState().removeMediaUri(uri);
  }, []);

  const handleRemoveVideo = useCallback(
    (uri: string) => {
      triggerHaptic("selection");
      useDraftStore.getState().removeMediaUri(uri);
      removeVideoUpload(uri);
      VIDEO_META.delete(uri);
    },
    [removeVideoUpload],
  );

  const handleRemoveSticker = useCallback((url: string) => {
    setSelectedStickers((prev) => prev.filter((sticker) => sticker !== url));
  }, [setSelectedStickers]);

  const handleEditVideo = useCallback(
    (uri: string) => {
      triggerHaptic("selection");
      const meta = VIDEO_META.get(uri);
      router.push({
        pathname: "/video-editor",
        params: {
          uri: meta?.originalUri ?? uri,
          width: (meta?.width ?? 1920).toString(),
          height: (meta?.height ?? 1080).toString(),
          initialTrimStart: (meta?.trimStart ?? 0).toString(),
          initialTrimEnd: (meta?.trimEnd ?? 0).toString(),
          replacingUri: uri,
        },
      });
    },
    [router],
  );

  return {
    handleLinkPress,
    handleLinkChange,
    handleRemoveLink,
    handleImagePress,
    handleVideoPress,
    handleStickerPress,
    handleSpoilerPress,
    handleRemoveImageItem,
    handleRemoveVideo,
    handleRemoveSticker,
    handleEditVideo,
  };
}
