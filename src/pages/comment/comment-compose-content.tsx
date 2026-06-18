import { Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useGiphy } from "@/src/hooks";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import {
  Feather,
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import * as Sentry from "@sentry/react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { uploadImageAndGetUrl } from "@/src/api/read/hooks/use-upload-media";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image as RNImage,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { StickerPicker } from "@/src/components/molecules/sticker-picker";
import { MentionSuggestions } from "@/src/components/molecules/mention-suggestions";
import { useMentionSearch } from "@/src/hooks/use-mention-search";
import { MEME_STICKERS } from "@/src/data/stickers";
import { useUserLevel } from "@/src/stores/auth-store";
import { canEditContent, getTierPostLimits } from "@/src/utils/tiers";
import { CommentComposeHeader } from "./comment-compose-header";
import { CommentComposeLinkSection } from "./comment-compose-link-section";
import { CommentComposeReplyBanner } from "./comment-compose-reply-banner";
import { styles } from "./comment-compose-styles";
import {
  GIPHY_URL_REGEX,
  HTTP_URL_REGEX,
  URL_REGEX,
  extractImageUrls,
  looksLikeUrlWithoutProtocol,
  type CommentImageUploadState,
  type InputMode,
} from "./comment-compose-utils";

export default function CommentComposeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
 const inputRef = useRef<TextInput>(null);
 const gifSearchRef = useRef<TextInput>(null);
  const linkUrlRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
const setPendingComment = useCommentComposeStore((s) => s.setPendingComment);
  const setPendingEdit = useCommentComposeStore((s) => s.setPendingEdit);
  const saveDraft = useCommentComposeStore((s) => s.saveDraft);
  const getDraft = useCommentComposeStore((s) => s.getDraft);
  const clearDraft = useCommentComposeStore((s) => s.clearDraft);

 const {
   postId,
   postTitle,
   postAuthorUsername,
   postThumbnail,
   postContent,
   replyToId,
   replyToUsername,
   replyToContent,
    editCommentId,
    editParentId,
    editContent,
    editCreatedAt,
    editSource,
 } = useLocalSearchParams<{
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
 }>();

  const isEditMode = !!editCommentId;
  const userLevel = useUserLevel();

  const tierLimits = useMemo(() => getTierPostLimits(userLevel), [userLevel]);

  const editability = useMemo(() => {
    if (!isEditMode || !editCreatedAt) return null;
    return canEditContent(userLevel, parseInt(editCreatedAt, 10));
  }, [isEditMode, editCreatedAt, userLevel]);

  const draft = useMemo(() => {
    if (!isEditMode && postId) return getDraft(postId, replyToId);
    return null;
  }, []);

  const initialText = useMemo(() => {
    if (isEditMode && editContent) {
      const { text: extractedText } = extractImageUrls(editContent);
      return extractedText;
    }
    if (draft) return draft.text;
    return "";
  }, []);

  const initialAttachment = useMemo(() => {
    if (isEditMode && editContent) {
      const { imageUrls } = extractImageUrls(editContent);
      if (imageUrls.length > 0) {
        const url = imageUrls[0];
        if (GIPHY_URL_REGEX.test(url)) {
          return { type: "gif" as const, url };
        }
        return { type: "image" as const, url };
      }
    }
    if (draft?.gifUrl) return { type: "gif" as const, url: draft.gifUrl };
    if (draft?.imageUri) return { type: "image" as const, url: draft.imageUri };
    return null;
  }, []);

  const [text, setText] = useState(initialText);
  const textRef = useRef(initialText);
  const [inputMode, setInputMode] = useState<InputMode>("keyboard");
  const inputModeRef = useRef<InputMode>("keyboard");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const {
    gifs,
    isLoading: isLoadingGifs,
    query: gifSearch,
    setQuery: setGifSearch,
    isConfigured: isGiphyConfigured,
  } = useGiphy({ debounceMs: 300, limit: 20, enabled: inputMode === "gif" });

  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(
    initialAttachment?.type === "image" ? initialAttachment.url : null,
  );
 const [selectedGifUrl, setSelectedGifUrl] = useState<string | null>(
   initialAttachment?.type === "gif" ? initialAttachment.url : null,
 );
  const selectedImageUriRef = useRef<string | null>(selectedImageUri);
  const selectedGifUrlRef = useRef<string | null>(selectedGifUrl);
  const didSubmitRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(
    !!initialAttachment && HTTP_URL_REGEX.test(initialAttachment.url),
  );
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [imageUploadState, setImageUploadState] = useState<CommentImageUploadState>(() => ({
    uploading: false,
    done: initialAttachment?.type === "image" && HTTP_URL_REGEX.test(initialAttachment.url),
    error: null,
    url: initialAttachment?.type === "image" && HTTP_URL_REGEX.test(initialAttachment.url)
      ? initialAttachment.url
      : null,
  }));
  const imageUploadSessionRef = useRef(0);
  const shouldRefocusAfterImagePreviewRef = useRef(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const mention = useMentionSearch();

  const hasAttachment = selectedImageUri !== null || selectedGifUrl !== null;
  const attachmentUrl = selectedImageUri || selectedGifUrl;
  const attachmentOverhead = attachmentUrl ? attachmentUrl.length + 2 : 0;
  const effectiveMaxLength = Math.max(1, tierLimits.maxContentLength - attachmentOverhead);
  const editBlocked = isEditMode && editability && !editability.allowed;
  const editExpired = !!editBlocked;
  const imageUploadBlocked = !!selectedImageUri && (isPreparingImage || imageUploadState.uploading || !!imageUploadState.error);
  const showImagePreviewBlockingOverlay =
    isPreparingImage ||
    (!!selectedImageUri && !imageUploadState.done && isMediaLoading && !isPreviewVisible);
  const canSubmit =
    (text.trim().length > 0 || hasAttachment) &&
    !editExpired &&
    !imageUploadBlocked &&
    !isSubmitting;
 const canAddLink = linkName.trim().length > 0 && linkUrl.trim().length > 0 && !linkError;

  useEffect(() => {
    if (showImagePreviewBlockingOverlay) return;
    if (!shouldRefocusAfterImagePreviewRef.current) return;
    shouldRefocusAfterImagePreviewRef.current = false;
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [showImagePreviewBlockingOverlay]);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    Network.getNetworkStateAsync().then((state) => {
      setIsNetworkOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    const sub = Network.addNetworkStateListener((event) => {
      setIsNetworkOnline(event.isConnected === true && event.isInternetReachable !== false);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () =>
      setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(hideEvent, () =>
      setIsKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

 const setWasDismissed = useCommentComposeStore((s) => s.setWasDismissed);

  useEffect(() => {
    return () => {
      imageUploadSessionRef.current += 1;
    };
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

  useEffect(() => {
    return () => {
      if (!didSubmitRef.current) {
        setWasDismissed(true);
      }
      if (!isEditMode && postId && !didSubmitRef.current) {
        saveDraft(postId, replyToId ?? null, {
          text: textRef.current,
          imageUri: selectedImageUriRef.current,
          gifUrl: selectedGifUrlRef.current,
        });
      }
    };
  }, [isEditMode, postId, replyToId, saveDraft, setWasDismissed]);

  const replyPreview = useMemo(() => {
    if (!replyToContent) return null;
    return extractImageUrls(replyToContent);
  }, [replyToContent]);

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
        data: {
          postId,
          commentId: editCommentId,
          parentId: editParentId,
          hasImage: !!resolvedImageUri,
          hasGif: !!selectedGifUrl,
        },
      });
      setPendingEdit({
        postId: postId!,
        source: (editSource as "post" | "profile") || "post",
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
        data: {
          postId,
          replyToId: replyToId ?? null,
          isReply: !!replyToId,
          hasImage: !!resolvedImageUri,
          hasGif: !!selectedGifUrl,
        },
      });
      setPendingComment({
        postId: postId!,
        replyToId: replyToId ?? null,
        text: text.trim(),
        imageUri: resolvedImageUri,
        gifUrl: selectedGifUrl,
      });
    }
    if (!isEditMode && postId) {
      clearDraft(postId, replyToId ?? null);
    }
    router.back();
  }, [
    canSubmit,
    text,
    selectedImageUri,
    imageUploadState.url,
    selectedGifUrl,
    setPendingComment,
    setPendingEdit,
    isEditMode,
    editCommentId,
    editParentId,
    editSource,
    postId,
    replyToId,
    clearDraft,
    router,
  ]);

  const handleModeChange = useCallback((mode: InputMode) => {
    triggerHaptic("selection");
    inputModeRef.current = mode;
    setInputMode(mode);
    if (mode === "keyboard") {
      inputRef.current?.focus();
    } else if (mode === "gif") {
      setTimeout(() => gifSearchRef.current?.focus(), 100);
    }
  }, []);

  const handleCloseGifMode = useCallback(() => {
    triggerHaptic("selection");
    inputModeRef.current = "keyboard";
    setInputMode("keyboard");
    setGifSearch("");
    inputRef.current?.focus();
  }, [setGifSearch]);

 const handleLinkUrlChange = useCallback((text: string) => {
   setLinkUrl(text);
   const trimmed = text.trim();
   if (trimmed.length > 0) {
     const isValid = URL_REGEX.test(trimmed);
     if (isValid) {
       setLinkError(null);
     } else if (looksLikeUrlWithoutProtocol(trimmed)) {
       setLinkError("Add https:// to the beginning of your link");
     } else {
       setLinkError("Please enter a valid URL (e.g., https://example.com)");
     }
   } else {
     setLinkError(null);
   }
 }, []);

 const handleAddLink = useCallback(() => {
   if (!canAddLink) return;
   triggerHaptic("medium");
   const markdownLink = `[${linkName.trim()}](${linkUrl.trim()})`;
   setText((prev) => {
      if (prev.trim()) return `${markdownLink}\n${prev}`;
     return markdownLink;
   });
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
   setText((prev) => prev.replace(markdown, "").replace(/\n{2,}/g, "\n").trim());
 }, []);

  const handleSelectGif = useCallback(
    (gifUrl: string) => {
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
    },
    [setGifSearch],
  );

  const startImageUpload = useCallback((uri: string) => {
    const sessionId = imageUploadSessionRef.current;
    setImageUploadState({ uploading: true, done: false, error: null, url: null });
    Sentry.addBreadcrumb({
      category: "comment-image-upload",
      message: "Starting comment image upload",
      level: "info",
      data: { fileName: uri.split("/").pop() ?? uri },
    });

    uploadImageAndGetUrl(uri)
      .then((url) => {
        if (imageUploadSessionRef.current !== sessionId) return;
        setImageUploadState({ uploading: false, done: true, error: null, url });
        setIsMediaLoading(false);
        setIsPreviewVisible(true);
        setSelectedImageUri(url);
        Sentry.addBreadcrumb({
          category: "comment-image-upload",
          message: "Comment image upload succeeded",
          level: "info",
          data: { fileName: uri.split("/").pop() ?? uri, hasUrl: !!url },
        });
      })
      .catch((error) => {
        if (imageUploadSessionRef.current !== sessionId) return;
        const status = (error as any)?.response?.status ?? (error as any)?.status;
        const responseText = (error as any)?.responseText ?? (error as any)?.response?.data?.error ?? "";
        const isUnsupportedFormat = status === 422 && String(responseText).includes("decoding");
        const msg = isUnsupportedFormat
          ? "This image format isn't supported. Try a different photo."
          : error instanceof Error ? error.message : "Upload failed";
        setImageUploadState({ uploading: false, done: false, error: msg, url: null });
        Sentry.captureException(error, {
          tags: {
            feature: "comment-compose",
            operation: "image-upload",
            unsupportedFormat: String(isUnsupportedFormat),
          },
          extra: {
            fileName: uri.split("/").pop() ?? uri,
            status,
            responseText,
          },
        });
      });
  }, []);

  useEffect(() => {
    if (!selectedImageUri || selectedGifUrl) return;
    if (HTTP_URL_REGEX.test(selectedImageUri)) return;
    if (imageUploadState.uploading || imageUploadState.done || imageUploadState.error) return;
    imageUploadSessionRef.current += 1;
    startImageUpload(selectedImageUri);
  }, [selectedImageUri, selectedGifUrl, imageUploadState.uploading, imageUploadState.done, imageUploadState.error, startImageUpload]);

  const handlePickImage = useCallback(async () => {
    triggerHaptic("selection");
    try {
      shouldRefocusAfterImagePreviewRef.current = true;
      Keyboard.dismiss();
      setIsPreparingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });
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
      Sentry.captureException(error, {
        tags: { feature: "comment-compose", operation: "image-picker" },
      });
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

  return (
    <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
          },
        ]}
      >
        {showImagePreviewBlockingOverlay && (
          <View style={styles.fullscreenLoadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        <CommentComposeHeader
          canSubmit={canSubmit}
          isEditMode={isEditMode}
          onClose={handleClose}
          onSubmit={handleSubmit}
        />

        <CommentComposeReplyBanner username={replyToUsername} />

       {/* Post preview */}
       <View
         style={[
           styles.postPreview,
           { borderBottomColor: theme.colors.border.subtle },
         ]}
       >
         <ScrollView
           style={styles.postPreviewInfo}
           contentContainerStyle={styles.postPreviewInfoContent}
           showsVerticalScrollIndicator={false}
         >
            {replyPreview ? (
              <MarkdownContent content={replyPreview.text || postTitle || ""} size="md" />
            ) : (
              <>
                <Text size="md" weight="bold" numberOfLines={2}>
                  {postTitle}
                </Text>
                {postContent ? (
                  <View style={styles.postPreviewBody}>
                    <MarkdownContent content={postContent} size="md" />
                  </View>
                ) : null}
              </>
            )}
         </ScrollView>
          {replyPreview && replyPreview.imageUrls.length > 0 ? (
            <Image
              source={{ uri: replyPreview.imageUrls[0] }}
              style={styles.postPreviewThumbnail}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : !replyToContent && postThumbnail ? (
           <Image
             source={{ uri: postThumbnail }}
             style={styles.postPreviewThumbnail}
             contentFit="cover"
             cachePolicy="memory-disk"
           />
          ) : null}
       </View>

        {isEditMode && editability && !editability.allowed && (
          <View style={{ marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.colors.error[500] + "20", borderRadius: 10 }}>
            <Text size="sm" style={{ color: theme.colors.error[500] }}>
              Editing time has expired. Your tier allows editing up to {editability.limitMinutes} minutes after publishing.
            </Text>
          </View>
        )}

        {isEditMode && editability && editability.allowed && editability.remainingMinutes !== Infinity && (
          <View style={{ marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.colors.warning[500] + "15", borderRadius: 10 }}>
            <Text size="sm" style={{ color: theme.colors.warning[500] }}>
              {editability.remainingMinutes} min remaining to edit this comment
            </Text>
          </View>
        )}

        {/* Scrollable content area */}
        <ScrollView
          style={styles.contentArea}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Link input mode — above text input */}
          {inputMode === "link" && (
            <CommentComposeLinkSection
              canAddLink={canAddLink}
              linkError={linkError}
              linkName={linkName}
              linkUrl={linkUrl}
              linkUrlRef={linkUrlRef}
              text={text}
              onAddLink={handleAddLink}
              onCancel={handleCancelLink}
              onChangeLinkName={setLinkName}
              onChangeLinkUrl={handleLinkUrlChange}
              onRemoveLink={handleRemoveMarkdownLink}
            />
          )}

          {/* Image/GIF Preview */}
         {(selectedImageUri || selectedGifUrl) && (
           <Animated.View
             entering={FadeIn.duration(200)}
             exiting={FadeOut.duration(150)}
             style={styles.previewContainer}
           >
             <View style={styles.previewWrapper}>
               {(selectedImageUri || selectedGifUrl) && (
                 <RNImage
                   source={{
                     uri: selectedImageUri || selectedGifUrl || undefined,
                   }}
                   style={styles.previewImage}
                   resizeMode="cover"
                    onLoadStart={() => {
                      setIsPreviewVisible(false);
                      setIsMediaLoading(true);
                    }}
                    onLoad={() => {
                      setTimeout(() => {
                        setIsPreviewVisible(true);
                        setIsMediaLoading(false);
                      }, 50);
                    }}
                    onError={() => {
                      setIsPreviewVisible(true);
                      setIsMediaLoading(false);
                    }}
                 />
               )}
               {selectedImageUri && isPreparingImage && (
                 <View style={styles.uploadedBadge}>
                   <ActivityIndicator size="small" color="#fff" />
                   <Text size="xs" weight="medium" style={styles.uploadedBadgeText}>
                     Preparing…
                   </Text>
                 </View>
               )}

               {selectedImageUri && imageUploadState.uploading && !isPreparingImage && (
                 <View style={[styles.uploadedBadge, !isNetworkOnline && styles.uploadWarningBadge]}>
                   <ActivityIndicator size="small" color="#fff" />
                   <Text size="xs" weight="medium" style={styles.uploadedBadgeText}>
                     {!isNetworkOnline ? "Low connectivity…" : "Uploading…"}
                   </Text>
                 </View>
               )}

               {selectedImageUri && !imageUploadState.uploading && imageUploadState.done && (
                 <View style={styles.uploadedBadge}>
                   <Feather name="check" size={12} color="#fff" />
                   <Text size="xs" weight="medium" style={styles.uploadedBadgeText}>
                     Uploaded
                   </Text>
                 </View>
               )}

               {selectedImageUri && imageUploadState.error && (
                 <Pressable
                   onPress={() => {
                     imageUploadSessionRef.current += 1;
                     startImageUpload(selectedImageUri);
                   }}
                   style={[styles.uploadedBadge, styles.uploadErrorBadge]}
                 >
                   <Feather name="refresh-cw" size={12} color="#fff" />
                   <Text size="xs" weight="medium" style={styles.uploadedBadgeText}>
                     Retry
                   </Text>
                 </Pressable>
               )}
               {!editExpired && (
                 <Pressable
                   onPress={handleRemoveAttachment}
                   style={styles.removeButton}
                 >
                    <Feather name="x" size={14} color="#fff" />
                  </Pressable>
               )}
              </View>
            </Animated.View>
          )}

          {/* Text input */}
          {inputMode !== "link" && (
            <>
              <TextInput
                ref={inputRef}
                style={[styles.textInput, { color: theme.colors.text.default }, editExpired && { opacity: 0.5 }]}
                placeholder="Comment"
                placeholderTextColor={theme.colors.text.subtle}
                value={text}
                onChangeText={(val) => {
                  setText(val);
                  setTimeout(() => {
                    mention.detectMention(val, selectionRef.current.start);
                  }, 0);
                }}
                multiline
                maxLength={effectiveMaxLength}
                autoFocus={!editExpired}
                editable={!editExpired}
                selection={selection}
                onSelectionChange={(e) => {
                  selectionRef.current = e.nativeEvent.selection;
                }}
              />
              {text.length > 0 && (
                <Text
                  size="xs"
                  style={{
                    color: text.length >= effectiveMaxLength
                      ? theme.colors.error[500]
                      : theme.colors.text.subtle,
                    textAlign: "right",
                    marginTop: -8,
                  }}
                >
                  {text.length}/{effectiveMaxLength}
                </Text>
              )}
            </>
          )}
        </ScrollView>

        <MentionSuggestions
          visible={mention.mentionOpen}
          loading={mention.mentionLoading}
          results={mention.mentionResults}
          query={mention.mentionQuery}
          onClose={mention.closeMention}
          onSelect={(username) => {
            const cursorPos = selectionRef.current.start;
            const { newText, newCursorPos } = mention.insertMention(
              username,
              text,
              cursorPos,
            );
            setText(newText);
            textRef.current = newText;
            setSelection({ start: newCursorPos, end: newCursorPos });
            setTimeout(() => setSelection(undefined), 50);
          }}
        />

        {/* GIF section */}
        {inputMode === "gif" && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.gifSection}
          >
            <View
              style={[
                styles.gifDivider,
                { backgroundColor: theme.colors.border.subtle },
              ]}
            />
            <View style={styles.gifSearchRow}>
              <View
                style={[
                  styles.gifSearchContainer,
                  { backgroundColor: theme.colors.background.subtle },
                ]}
              >
                <Feather
                  name="search"
                  size={16}
                  color={theme.colors.text.subtle}
                  style={styles.gifSearchIcon}
                />
                <TextInput
                  ref={gifSearchRef}
                  style={[
                    styles.gifSearchInput,
                    { color: theme.colors.text.default },
                  ]}
                  placeholder="Search GIFs..."
                  placeholderTextColor={theme.colors.text.subtle}
                  value={gifSearch}
                  onChangeText={setGifSearch}
                  autoFocus
                />
                {isLoadingGifs && (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.text.subtle}
                  />
                )}
              </View>
              <Pressable
                onPress={handleCloseGifMode}
                style={styles.gifCloseButton}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={theme.colors.text.subtle}
                />
              </Pressable>
            </View>
            <View style={styles.giphyAttribution}>
              <Text size="xs" mode="subtle">
                Powered by GIPHY
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gifScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {!isGiphyConfigured && (
                <View style={styles.gifEmptyState}>
                  <Text size="sm" mode="subtle" style={{ textAlign: "center" }}>
                    Giphy API key not configured.{"\n"}
                    Set EXPO_PUBLIC_GIPHY_API_KEY
                  </Text>
                </View>
              )}
              {isGiphyConfigured && gifs.length === 0 && !isLoadingGifs && (
                <View style={styles.gifEmptyState}>
                  <Text size="sm" mode="subtle">
                    {gifSearch
                      ? `No GIFs found for "${gifSearch}"`
                      : "No trending GIFs"}
                  </Text>
                </View>
              )}
              {gifs.map((gif) => (
                <Pressable
                  key={gif.id}
                  onPress={() => handleSelectGif(gif.fullUrl)}
                  style={[
                    styles.gifItem,
                    selectedGifUrl === gif.fullUrl && styles.gifItemSelected,
                  ]}
                >
                  <RNImage
                    source={{ uri: gif.previewUrl }}
                    style={styles.gifImage}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Icon buttons bar */}
        {!mention.mentionOpen && (
       <View
         style={[
           styles.toolbar,
           {
              paddingBottom: isKeyboardVisible ? 8 : insets.bottom || 8,
             borderTopColor: theme.colors.border.subtle,
           },
         ]}
       >
          <View style={[styles.toolbarLeft, editExpired && { opacity: 0.4 }]} pointerEvents={editExpired ? "none" : "auto"}>
            <Pressable
              onPress={() => handleModeChange("keyboard")}
              style={[
                styles.toolbarButton,
                inputMode === "keyboard" && {
                  backgroundColor: theme.colors.background.hover,
                },
              ]}
            >
              <FontAwesome5
                name="keyboard"
                size={16}
                color={
                  inputMode === "keyboard"
                    ? theme.colors.text.default
                    : theme.colors.text.subtle
                }
              />
            </Pressable>
            <Pressable
              onPress={() => handleModeChange("link")}
              style={[
                styles.toolbarButton,
                inputMode === "link" && {
                  backgroundColor: theme.colors.background.hover,
                },
              ]}
            >
              <Feather
                name="link"
                size={16}
                color={
                  inputMode === "link"
                    ? theme.colors.text.default
                    : theme.colors.text.subtle
                }
              />
            </Pressable>
            <Pressable
              onPress={() => handleModeChange("gif")}
              style={[
                styles.toolbarButton,
                inputMode === "gif" && {
                  backgroundColor: theme.colors.background.hover,
                },
              ]}
            >
              <MaterialIcons
                name="gif"
                size={22}
                color={
                  inputMode === "gif"
                    ? theme.colors.text.default
                    : theme.colors.text.subtle
                }
              />
            </Pressable>
            <Pressable onPress={handlePickImage} style={styles.toolbarButton}>
              <Ionicons
                name="image-outline"
                size={18}
                color={theme.colors.text.subtle}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                triggerHaptic("selection");
                setShowStickerPicker(true);
              }}
              style={styles.toolbarButton}
            >
              <MaterialCommunityIcons
                name="sticker-emoji"
                size={18}
                color={theme.colors.text.subtle}
              />
            </Pressable>
            <Pressable onPress={handleSpoilerPress} style={styles.toolbarButton}>
              <Feather
                name="eye-off"
                size={16}
                color={theme.colors.text.subtle}
              />
            </Pressable>
          </View>
        </View>
        )}
      </View>
      <StickerPicker
        visible={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        onSelect={(urls) => {
          if (urls.length > 0) {
            setSelectedGifUrl(null);
            setSelectedImageUri(urls[0]);
            setIsMediaLoading(true);
          } else {
            setSelectedImageUri(null);
          }
        }}
        selectedStickers={selectedImageUri && MEME_STICKERS.includes(selectedImageUri) ? [selectedImageUri] : []}
        multiSelect={false}
      />
    </KeyboardAvoidingView>
  );
}
