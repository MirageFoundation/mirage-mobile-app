import { uploadImageAndGetUrl } from "@/src/api/read/hooks/use-upload-media";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useGiphy } from "@/src/hooks";
import { useMentionSearch } from "@/src/hooks/use-mention-search";
import { useRouter } from "@/src/navigation/guarded-router";
import { sanitizedTelemetryError } from "@/src/services/react-query-telemetry";
import { useUserLevel } from "@/src/stores/auth-store";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { canEditContent, getTierPostLimits } from "@/src/utils/tiers";
import * as Sentry from "@sentry/react-native";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, type TextInput } from "react-native";
import {
  getCommentComposeLimits,
  getInitialCommentComposeState,
  getLinkError,
  prependMarkdownLink,
  removeMarkdownLink,
} from "./comment-compose-state";
import {
  HTTP_URL_REGEX,
  extractImageUrls,
  type CommentImageUploadState,
  type InputMode,
} from "./comment-compose-utils";

type CommentComposeParams = {
  postId: string;
  postTitle: string;
  postAuthorUsername: string;
  postThumbnail?: string;
  postContent?: string;
  replyToId?: string;
  replyToUsername?: string;
  replyToContent?: string;
  editCommentId?: string;
  editParentId?: string;
  editContent?: string;
  editCreatedAt?: string;
  editSource?: "post" | "profile";
};

export function useCommentComposeController() {
  const router = useRouter();
  const params = useLocalSearchParams<CommentComposeParams>();
  const {
    postId,
    replyToId,
    editCommentId,
    editParentId,
    editContent,
    editCreatedAt,
    editSource,
  } = params;
  const inputRef = useRef<TextInput>(null);
  const gifSearchRef = useRef<TextInput>(null);
  const linkUrlRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const imageUploadSessionRef = useRef(0);
  const shouldRefocusAfterImagePreviewRef = useRef(false);
  const didSubmitRef = useRef(false);

  const setPendingComment = useCommentComposeStore((state) => state.setPendingComment);
  const setPendingEdit = useCommentComposeStore((state) => state.setPendingEdit);
  const saveDraft = useCommentComposeStore((state) => state.saveDraft);
  const getDraft = useCommentComposeStore((state) => state.getDraft);
  const clearDraft = useCommentComposeStore((state) => state.clearDraft);
  const setWasDismissed = useCommentComposeStore((state) => state.setWasDismissed);
  const userLevel = useUserLevel();
  const isEditMode = !!editCommentId;
  const tierLimits = useMemo(() => getTierPostLimits(userLevel), [userLevel]);
  const editability = useMemo(() => {
    if (!isEditMode || !editCreatedAt) return null;
    return canEditContent(userLevel, parseInt(editCreatedAt, 10));
  }, [editCreatedAt, isEditMode, userLevel]);
  const initialStateRef = useRef<ReturnType<typeof getInitialCommentComposeState> | null>(null);
  if (!initialStateRef.current) {
    const draft = !isEditMode && postId ? getDraft(postId, replyToId) : null;
    initialStateRef.current = getInitialCommentComposeState({ draft, editContent, isEditMode });
  }
  const initialState = initialStateRef.current;

  const [text, setText] = useState(initialState.text);
  const textRef = useRef(initialState.text);
  const [selection, setSelection] = useState<{ start: number; end: number }>();
  const [inputMode, setInputMode] = useState<InputMode>("keyboard");
  const inputModeRef = useRef<InputMode>("keyboard");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState(initialState.imageUri);
  const [selectedGifUrl, setSelectedGifUrl] = useState(initialState.gifUrl);
  const selectedImageUriRef = useRef(selectedImageUri);
  const selectedGifUrlRef = useRef(selectedGifUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(initialState.isRemoteImage);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [imageUploadState, setImageUploadState] = useState<CommentImageUploadState>({
    uploading: false,
    done: initialState.isRemoteImage,
    error: null,
    url: initialState.isRemoteImage ? initialState.imageUri : null,
  });
  const mention = useMentionSearch();
  const giphy = useGiphy({ debounceMs: 300, limit: 20, enabled: inputMode === "gif" });
  const { detectMention, insertMention } = mention;
  const { setQuery: setGifSearch } = giphy;

  const attachmentUrl = selectedImageUri || selectedGifUrl;
  const editExpired = !!(isEditMode && editability && !editability.allowed);
  const { canSubmit, effectiveMaxLength } = getCommentComposeLimits({
    attachmentUrl,
    editExpired,
    imageError: selectedImageUri ? imageUploadState.error : null,
    imageUploading: !!selectedImageUri && imageUploadState.uploading,
    isPreparingImage: !!selectedImageUri && isPreparingImage,
    isSubmitting,
    maxContentLength: tierLimits.maxContentLength,
    text,
  });
  const canAddLink = !!linkName.trim() && !!linkUrl.trim() && !linkError;
  const showImagePreviewBlockingOverlay =
    isPreparingImage ||
    (!!selectedImageUri && !imageUploadState.done && isMediaLoading && !isPreviewVisible);
  const replyPreview = useMemo(
    () => (params.replyToContent ? extractImageUrls(params.replyToContent) : null),
    [params.replyToContent],
  );

  useEffect(() => {
    if (showImagePreviewBlockingOverlay || !shouldRefocusAfterImagePreviewRef.current) return;
    shouldRefocusAfterImagePreviewRef.current = false;
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [showImagePreviewBlockingOverlay]);

  useEffect(() => {
    Network.getNetworkStateAsync().then((state) => {
      setIsNetworkOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    const subscription = Network.addNetworkStateListener((state) => {
      setIsNetworkOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => () => {
    imageUploadSessionRef.current += 1;
  }, []);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    selectedImageUriRef.current = selectedImageUri;
  }, [selectedImageUri]);
  useEffect(() => {
    selectedGifUrlRef.current = selectedGifUrl;
  }, [selectedGifUrl]);

  useEffect(() => () => {
    if (!didSubmitRef.current) {
      Sentry.addBreadcrumb({
        category: "comment-compose",
        message: "Comment compose dismissed without submit",
        level: "info",
        data: { postId: postId ?? null, replyToId: replyToId ?? null, isEditMode },
      });
      setWasDismissed(true);
    }
    if (!isEditMode && postId && !didSubmitRef.current) {
      saveDraft(postId, replyToId ?? null, {
        text: textRef.current,
        imageUri: selectedImageUriRef.current,
        gifUrl: selectedGifUrlRef.current,
      });
    }
  }, [isEditMode, postId, replyToId, saveDraft, setWasDismissed]);

  const handleClose = useCallback(() => {
    setWasDismissed(true);
    router.back();
  }, [router, setWasDismissed]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || didSubmitRef.current) {
      if (didSubmitRef.current) {
        Sentry.captureMessage("Duplicate comment compose submit blocked", {
          level: "warning",
          tags: { feature: "comment-compose", operation: "duplicate_submit_blocked" },
          extra: {
            postId,
            replyToId: replyToId ?? null,
            isEditMode,
            hasImage: !!selectedImageUri,
            hasGif: !!selectedGifUrl,
            textLength: text.trim().length,
          },
        });
      }
      return;
    }
    didSubmitRef.current = true;
    setIsSubmitting(true);
    triggerHaptic("medium");
    const resolvedImageUri = selectedImageUri ? imageUploadState.url ?? selectedImageUri : null;
    if (isEditMode && editCommentId && editParentId) {
      Sentry.addBreadcrumb({
        category: "comment-compose",
        message: "Comment edit handed off",
        level: "info",
        data: { postId, commentId: editCommentId, parentId: editParentId, hasImage: !!resolvedImageUri, hasGif: !!selectedGifUrl },
      });
      setPendingEdit({
        postId: postId!,
        source: editSource || "post",
        commentId: editCommentId,
        parentId: editParentId,
        text: text.trim(),
        imageUri: resolvedImageUri,
        gifUrl: selectedGifUrl,
      });
    } else {
      Sentry.addBreadcrumb({
        category: "comment-compose",
        message: "Comment submit handed off",
        level: "info",
        data: { postId, replyToId: replyToId ?? null, isReply: !!replyToId, hasImage: !!resolvedImageUri, hasGif: !!selectedGifUrl },
      });
      setPendingComment({
        postId: postId!,
        replyToId: replyToId ?? null,
        text: text.trim(),
        imageUri: resolvedImageUri,
        gifUrl: selectedGifUrl,
      });
    }
    if (!isEditMode && postId) clearDraft(postId, replyToId ?? null);
    router.back();
  }, [canSubmit, clearDraft, editCommentId, editParentId, editSource, imageUploadState.url, isEditMode, postId, replyToId, router, selectedGifUrl, selectedImageUri, setPendingComment, setPendingEdit, text]);

  const handleModeChange = useCallback((mode: InputMode) => {
    triggerHaptic("selection");
    inputModeRef.current = mode;
    setInputMode(mode);
    if (mode === "keyboard") inputRef.current?.focus();
    if (mode === "gif") setTimeout(() => gifSearchRef.current?.focus(), 100);
  }, []);

  const handleCloseGifMode = useCallback(() => {
    triggerHaptic("selection");
    inputModeRef.current = "keyboard";
    setInputMode("keyboard");
    setGifSearch("");
    inputRef.current?.focus();
  }, [setGifSearch]);

  const handleLinkUrlChange = useCallback((value: string) => {
    setLinkUrl(value);
    setLinkError(getLinkError(value));
  }, []);
  const handleAddLink = useCallback(() => {
    if (!canAddLink) return;
    triggerHaptic("medium");
    setText((current) => prependMarkdownLink(current, linkName, linkUrl));
    setLinkName("");
    setLinkUrl("");
    setLinkError(null);
    setInputMode("keyboard");
    inputModeRef.current = "keyboard";
  }, [canAddLink, linkName, linkUrl]);
  const handleCancelLink = useCallback(() => {
    setLinkName("");
    setLinkUrl("");
    setLinkError(null);
    setInputMode("keyboard");
    inputModeRef.current = "keyboard";
    inputRef.current?.focus();
  }, []);
  const handleRemoveMarkdownLink = useCallback((markdown: string) => {
    setText((current) => removeMarkdownLink(current, markdown));
  }, []);

  const handleSelectGif = useCallback((gifUrl: string) => {
    triggerHaptic("medium");
    imageUploadSessionRef.current += 1;
    setSelectedImageUri(null);
    setSelectedGifUrl(gifUrl);
    setIsPreviewVisible(false);
    setImageUploadState({ uploading: false, done: false, error: null, url: null });
    setIsMediaLoading(true);
    inputModeRef.current = "keyboard";
    setInputMode("keyboard");
    setGifSearch("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [setGifSearch]);

  const startImageUpload = useCallback((uri: string) => {
    const sessionId = imageUploadSessionRef.current;
    setImageUploadState({ uploading: true, done: false, error: null, url: null });
    Sentry.addBreadcrumb({ category: "comment-image-upload", message: "Starting comment image upload", level: "info" });
    uploadImageAndGetUrl(uri).then((url) => {
      if (imageUploadSessionRef.current !== sessionId) return;
      setImageUploadState({ uploading: false, done: true, error: null, url });
      setIsMediaLoading(false);
      setIsPreviewVisible(true);
      setSelectedImageUri(url);
      Sentry.addBreadcrumb({ category: "comment-image-upload", message: "Comment image upload succeeded", level: "info", data: { hasUrl: !!url } });
    }).catch((error) => {
      if (imageUploadSessionRef.current !== sessionId) return;
      const status = (error as any)?.response?.status ?? (error as any)?.status;
      const responseText = (error as any)?.responseText ?? (error as any)?.response?.data?.error ?? "";
      const isUnsupportedFormat = status === 422 && String(responseText).includes("decoding");
      const message = isUnsupportedFormat
        ? "This image format isn't supported. Try a different photo."
        : error instanceof Error ? error.message : "Upload failed";
      setImageUploadState({ uploading: false, done: false, error: message, url: null });
      Sentry.captureException(sanitizedTelemetryError("media-upload", {
        error_class: typeof status === "number" ? "http" : "unexpected",
        status: typeof status === "number" ? status : undefined,
      }), {
        tags: { feature: "comment-compose", operation: "image-upload", unsupportedFormat: String(isUnsupportedFormat) },
        extra: { status, unsupportedFormat: isUnsupportedFormat },
      });
    });
  }, []);

  useEffect(() => {
    if (!selectedImageUri || selectedGifUrl || HTTP_URL_REGEX.test(selectedImageUri)) return;
    if (imageUploadState.uploading || imageUploadState.done || imageUploadState.error) return;
    imageUploadSessionRef.current += 1;
    startImageUpload(selectedImageUri);
  }, [imageUploadState.done, imageUploadState.error, imageUploadState.uploading, selectedGifUrl, selectedImageUri, startImageUpload]);

  const handlePickImage = useCallback(async () => {
    triggerHaptic("selection");
    try {
      shouldRefocusAfterImagePreviewRef.current = true;
      Keyboard.dismiss();
      setIsPreparingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        imageUploadSessionRef.current += 1;
        setSelectedGifUrl(null);
        setIsPreviewVisible(false);
        setSelectedImageUri(uri);
        setIsMediaLoading(true);
        inputModeRef.current = "keyboard";
        setInputMode("keyboard");
        startImageUpload(uri);
      } else {
        shouldRefocusAfterImagePreviewRef.current = false;
      }
    } catch (error) {
      shouldRefocusAfterImagePreviewRef.current = false;
      Sentry.captureException(error, { tags: { feature: "comment-compose", operation: "image-picker" } });
      setImageUploadState({ uploading: false, done: false, error: "Couldn't load image", url: null });
    } finally {
      setIsPreparingImage(false);
    }
  }, [startImageUpload]);

  const handleRemoveAttachment = useCallback(() => {
    triggerHaptic("selection");
    imageUploadSessionRef.current += 1;
    shouldRefocusAfterImagePreviewRef.current = false;
    setSelectedImageUri(null);
    setSelectedGifUrl(null);
    setIsMediaLoading(false);
    setIsPreviewVisible(false);
    setIsPreparingImage(false);
    setImageUploadState({ uploading: false, done: false, error: null, url: null });
  }, []);
  const handleRetryImageUpload = useCallback(() => {
    if (!selectedImageUri) return;
    imageUploadSessionRef.current += 1;
    startImageUpload(selectedImageUri);
  }, [selectedImageUri, startImageUpload]);
  const handleSpoilerPress = useCallback(() => {
    triggerHaptic("selection");
    const { start, end } = selectionRef.current;
    const selected = text.slice(start, end);
    setText(`${text.slice(0, start)}${selected ? `||${selected}||` : "||||"}${text.slice(end)}`);
    const cursorPosition = selected ? start + selected.length + 4 : start + 2;
    setTimeout(() => {
      inputRef.current?.focus();
      setSelection({ start: cursorPosition, end: cursorPosition });
      setTimeout(() => setSelection(undefined), 50);
    }, 50);
  }, [text]);
  const handleTextChange = useCallback((value: string) => {
    setText(value);
    setTimeout(() => detectMention(value, selectionRef.current.start), 0);
  }, [detectMention]);
  const handleMentionSelect = useCallback((username: string) => {
    const { newText, newCursorPos } = insertMention(username, text, selectionRef.current.start);
    setText(newText);
    textRef.current = newText;
    setSelection({ start: newCursorPos, end: newCursorPos });
    setTimeout(() => setSelection(undefined), 50);
  }, [insertMention, text]);
  const handleStickerSelect = useCallback((urls: string[]) => {
    if (urls.length > 0) {
      imageUploadSessionRef.current += 1;
      setSelectedGifUrl(null);
      setSelectedImageUri(urls[0]);
      setIsMediaLoading(true);
      setImageUploadState({ uploading: false, done: false, error: null, url: null });
    } else {
      setSelectedImageUri(null);
    }
  }, []);

  return {
    params, inputRef, gifSearchRef, linkUrlRef, selectionRef,
    text, setText, selection, inputMode, linkName, setLinkName, linkUrl, linkError,
    selectedImageUri, selectedGifUrl, isMediaLoading, setIsMediaLoading,
    setIsPreviewVisible, isPreparingImage, isNetworkOnline, isKeyboardVisible,
    showStickerPicker, setShowStickerPicker, imageUploadState, mention, giphy,
    isEditMode, editability, editExpired, canSubmit, canAddLink, effectiveMaxLength,
    showImagePreviewBlockingOverlay, replyPreview, handleClose, handleSubmit,
    handleModeChange, handleCloseGifMode, handleLinkUrlChange, handleAddLink,
    handleCancelLink, handleRemoveMarkdownLink, handleSelectGif, handlePickImage,
    handleRemoveAttachment, handleRetryImageUpload, handleSpoilerPress,
    handleTextChange, handleMentionSelect, handleStickerSelect,
  };
}

export type CommentComposeController = ReturnType<typeof useCommentComposeController>;
