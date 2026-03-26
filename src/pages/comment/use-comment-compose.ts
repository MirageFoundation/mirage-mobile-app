import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, TextInput } from "react-native";

import { triggerHaptic } from "@/src/components/utils/haptics";
import { useGiphy } from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { useUserLevel } from "@/src/stores/auth-store";
import { canEditContent, getTierPostLimits } from "@/src/utils/tiers";

import {
  extractImageUrls,
  GIPHY_URL_REGEX,
  type InputMode,
} from "./comment-compose-utils";

export function useCommentCompose() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const gifSearchRef = useRef<TextInput>(null);
  const linkUrlRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const [selection, setSelection] = useState<
    { start: number; end: number } | undefined
  >(undefined);

  const setPendingComment = useCommentComposeStore((s) => s.setPendingComment);
  const setPendingEdit = useCommentComposeStore((s) => s.setPendingEdit);
  const setWasDismissed = useCommentComposeStore((s) => s.setWasDismissed);

  const params = useLocalSearchParams<{
    postId: string;
    postTitle: string;
    postThumbnail?: string;
    replyToId?: string;
    replyToUsername?: string;
    replyToContent?: string;
    editCommentId?: string;
    editParentId?: string;
    editContent?: string;
    editCreatedAt?: string;
    editSource?: "post" | "profile";
  }>();

  const isEditMode = !!params.editCommentId;
  const userLevel = useUserLevel();
  const tierLimits = useMemo(() => getTierPostLimits(userLevel), [userLevel]);

  const editability = useMemo(() => {
    if (!isEditMode || !params.editCreatedAt) return null;
    return canEditContent(userLevel, parseInt(params.editCreatedAt, 10));
  }, [isEditMode, params.editCreatedAt, userLevel]);

  const extractedEditContent =
    isEditMode && params.editContent
      ? extractImageUrls(params.editContent)
      : { text: "", imageUrls: [] };

  const initialAttachment = extractedEditContent.imageUrls[0]
    ? {
        type: GIPHY_URL_REGEX.test(extractedEditContent.imageUrls[0])
          ? ("gif" as const)
          : ("image" as const),
        url: extractedEditContent.imageUrls[0],
      }
    : null;

  const [text, setText] = useState(extractedEditContent.text);
  const [inputMode, setInputMode] = useState<InputMode>("keyboard");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(
    initialAttachment?.type === "image" ? initialAttachment.url : null,
  );
  const [selectedGifUrl, setSelectedGifUrl] = useState<string | null>(
    initialAttachment?.type === "gif" ? initialAttachment.url : null,
  );
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const {
    gifs,
    isLoading: isLoadingGifs,
    query: gifSearch,
    setQuery: setGifSearch,
    isConfigured: isGiphyConfigured,
  } = useGiphy({
    debounceMs: 300,
    limit: 20,
    enabled: inputMode === "gif",
  });

  const replyPreview = useMemo(() => {
    if (!params.replyToContent) return null;
    return extractImageUrls(params.replyToContent);
  }, [params.replyToContent]);

  const hasAttachment = selectedImageUri !== null || selectedGifUrl !== null;
  const attachmentUrl = selectedImageUri || selectedGifUrl;
  const attachmentOverhead = attachmentUrl ? attachmentUrl.length + 2 : 0;
  const effectiveMaxLength = Math.max(
    1,
    tierLimits.maxContentLength - attachmentOverhead,
  );
  const editExpired = !!(isEditMode && editability && !editability.allowed);
  const canSubmit = (text.trim().length > 0 || hasAttachment) && !editExpired;
  const canAddLink = linkName.trim().length > 0 && linkUrl.trim().length > 0;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const focusMainInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleClose = useCallback(() => {
    setWasDismissed(true);
    router.back();
  }, [router, setWasDismissed]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !params.postId) return;

    triggerHaptic("medium");

    if (isEditMode && params.editCommentId && params.editParentId) {
      setPendingEdit({
        postId: params.postId,
        source: params.editSource || "post",
        commentId: params.editCommentId,
        parentId: params.editParentId,
        text: text.trim(),
        imageUri: selectedImageUri,
        gifUrl: selectedGifUrl,
      });
    } else {
      setPendingComment({
        postId: params.postId,
        replyToId: params.replyToId ?? null,
        text: text.trim(),
        imageUri: selectedImageUri,
        gifUrl: selectedGifUrl,
      });
    }

    router.back();
  }, [
    canSubmit,
    isEditMode,
    params.editCommentId,
    params.editParentId,
    params.editSource,
    params.postId,
    params.replyToId,
    router,
    selectedGifUrl,
    selectedImageUri,
    setPendingComment,
    setPendingEdit,
    text,
  ]);

  const handleModeChange = useCallback(
    (mode: InputMode) => {
      triggerHaptic("selection");
      setInputMode(mode);
      if (mode === "keyboard") {
        inputRef.current?.focus();
      } else if (mode === "gif") {
        setTimeout(() => gifSearchRef.current?.focus(), 100);
      }
    },
    [],
  );

  const handleCloseGifMode = useCallback(() => {
    triggerHaptic("selection");
    setInputMode("keyboard");
    setGifSearch("");
    inputRef.current?.focus();
  }, [setGifSearch]);

  const handleAddLink = useCallback(() => {
    if (!canAddLink) return;

    triggerHaptic("medium");
    const markdownLink = `[${linkName.trim()}](${linkUrl.trim()})`;

    setText((prev) => (prev.trim() ? `${markdownLink}\n${prev}` : markdownLink));
    setLinkName("");
    setLinkUrl("");
    setInputMode("keyboard");
    focusMainInput();
  }, [canAddLink, focusMainInput, linkName, linkUrl]);

  const handleSelectGif = useCallback(
    (gifUrl: string) => {
      triggerHaptic("medium");
      setSelectedImageUri(null);
      setSelectedGifUrl(gifUrl);
      setIsMediaLoading(true);
      setInputMode("keyboard");
      setGifSearch("");
      focusMainInput();
    },
    [focusMainInput, setGifSearch],
  );

  const handlePickImage = useCallback(async () => {
    triggerHaptic("selection");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedGifUrl(null);
      setSelectedImageUri(result.assets[0].uri);
      setIsMediaLoading(true);
      setInputMode("keyboard");
      focusMainInput();
    }
  }, [focusMainInput]);

  const handleRemoveAttachment = useCallback(() => {
    triggerHaptic("selection");
    setSelectedImageUri(null);
    setSelectedGifUrl(null);
    setIsMediaLoading(false);
  }, []);

  const handleSpoilerPress = useCallback(() => {
    triggerHaptic("selection");
    const { start, end } = selectionRef.current;
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);
    const newText = selected
      ? `${before}||${selected}||${after}`
      : `${before}||||${after}`;

    setText(newText);

    const cursorPos = selected ? start + selected.length + 4 : start + 2;
    setTimeout(() => {
      inputRef.current?.focus();
      setSelection({ start: cursorPos, end: cursorPos });
      setTimeout(() => setSelection(undefined), 50);
    }, 50);
  }, [text]);

  const handleStickerSelect = useCallback((urls: string[]) => {
    if (urls.length > 0) {
      setSelectedGifUrl(null);
      setSelectedImageUri(urls[0]);
      setIsMediaLoading(true);
    } else {
      setSelectedImageUri(null);
    }
  }, []);

  return {
    canAddLink,
    canSubmit,
    editExpired,
    editability,
    effectiveMaxLength,
    gifSearch,
    gifSearchRef,
    gifs,
    handleAddLink,
    handleClose,
    handleCloseGifMode,
    handleModeChange,
    handlePickImage,
    handleRemoveAttachment,
    handleSelectGif,
    handleSpoilerPress,
    handleStickerSelect,
    handleSubmit,
    hasAttachment,
    inputMode,
    inputRef,
    isEditMode,
    isGiphyConfigured,
    isKeyboardVisible,
    isLoadingGifs,
    isMediaLoading,
    linkName,
    linkUrl,
    linkUrlRef,
    params,
    replyPreview,
    selectedGifUrl,
    selectedImageUri,
    selection,
    selectionRef,
    setGifSearch,
    setInputMode,
    setIsMediaLoading,
    setLinkName,
    setLinkUrl,
    setSelection,
    setShowStickerPicker,
    setText,
    showStickerPicker,
    text,
  };
}
