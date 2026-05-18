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
import { useRouter } from "@/src/hooks/use-router";
import { uploadImageAndGetUrl } from "@/src/api/read/hooks/use-upload-media";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { StickerPicker } from "@/src/components/molecules/sticker-picker";
import { MentionSuggestions } from "@/src/components/molecules/mention-suggestions";
import { useMentionSearch } from "@/src/hooks/use-mention-search";
import { MEME_STICKERS } from "@/src/data/stickers";
import { useUserLevel } from "@/src/stores/auth-store";
import { canEditContent, getTierPostLimits } from "@/src/utils/tiers";

type InputMode = "keyboard" | "link" | "gif" | "photo";

type CommentImageUploadState = {
  uploading: boolean;
  done: boolean;
  error: string | null;
  url: string | null;
};

const PREVIEW_WIDTH = 180;
const PREVIEW_HEIGHT = 140;

const URL_REGEX = /^https?:\/\/[^\s<>"{}|\\^`\[\]]+$/i;
const HTTP_URL_REGEX = /^https?:\/\//i;

function looksLikeUrlWithoutProtocol(text: string): boolean {
  return (
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+/i.test(text) &&
    !text.startsWith("http")
  );
}

const MARKDOWN_LINK_EXTRACT = /\[([^\]]+)\]\(([^)]+)\)/g;

function extractMarkdownLinks(text: string): { name: string; url: string }[] {
  const links: { name: string; url: string }[] = [];
  let match: RegExpExecArray | null;
  MARKDOWN_LINK_EXTRACT.lastIndex = 0;
  while ((match = MARKDOWN_LINK_EXTRACT.exec(text)) !== null) {
    links.push({ name: match[1], url: match[2] });
  }
  return links;
}

const IMAGE_URL_REGEX = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))$/i;
const CLOUDFLARE_IMAGE_REGEX = /^https?:\/\/imagedelivery\.net\/[^\s]+$/i;
const GIPHY_URL_REGEX =
  /^https?:\/\/(?:media\d?\.giphy\.com|i\.giphy\.com)\/[^\s]+$/i;

function isImageUrl(url: string): boolean {
  return (
    IMAGE_URL_REGEX.test(url) ||
    CLOUDFLARE_IMAGE_REGEX.test(url) ||
    GIPHY_URL_REGEX.test(url)
  );
}

function extractImageUrls(content: string): {
  text: string;
  imageUrls: string[];
} {
  const imageUrls: string[] = [];
  const textLines: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (isImageUrl(trimmed)) {
      imageUrls.push(trimmed);
    } else {
      textLines.push(line);
    }
  }
  return { text: textLines.join("\n").trim(), imageUrls };
}

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
  const canSubmit = (text.trim().length > 0 || hasAttachment) && !editExpired && !imageUploadBlocked;
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
      if (!isEditMode && postId && !didSubmitRef.current) {
        saveDraft(postId, replyToId ?? null, {
          text: textRef.current,
          imageUri: selectedImageUriRef.current,
          gifUrl: selectedGifUrlRef.current,
        });
      }
    };
  }, [isEditMode, postId, replyToId, saveDraft]);

  const replyPreview = useMemo(() => {
    if (!replyToContent) return null;
    return extractImageUrls(replyToContent);
  }, [replyToContent]);

 const handleClose = useCallback(() => {
    setWasDismissed(true);
   router.back();
  }, [router, setWasDismissed]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    triggerHaptic("medium");
    const resolvedImageUri = selectedImageUri ? imageUploadState.url ?? selectedImageUri : null;
    if (isEditMode && editCommentId && editParentId) {
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
      setPendingComment({
        postId: postId!,
        replyToId: replyToId ?? null,
        text: text.trim(),
        imageUri: resolvedImageUri,
        gifUrl: selectedGifUrl,
      });
    }
    if (!isEditMode && postId) {
      didSubmitRef.current = true;
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
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.headerButton}>
            <Ionicons
              name="close"
              size={28}
              color={theme.colors.text.default}
            />
          </Pressable>
          <Text size="lg" weight="bold" style={styles.headerTitle}>
            {isEditMode ? "Edit comment" : "Add comment"}
          </Text>
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[
              styles.postButton,
              {
                backgroundColor: canSubmit
                  ? theme.colors.brand[500]
                  : theme.colors.background.subtle,
              },
            ]}
          >
            <Text
              size="sm"
              weight="bold"
              style={{
                color: canSubmit ? "#FFFFFF" : theme.colors.text.subtle,
              }}
            >
              {isEditMode ? "Save" : "Post"}
            </Text>
          </Pressable>
        </View>

        {/* Reply to banner */}
        {replyToUsername && (
          <View style={styles.replyBanner}>
            <Text size="xs" mode="subtle">
              Replying to{" "}
              <Text
                size="xs"
                weight="semibold"
                style={{ color: theme.colors.brand[500] }}
              >
                @{replyToUsername}
              </Text>
            </Text>
          </View>
        )}

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
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              style={styles.linkContainer}
            >
             <TextInput
               style={[
                 styles.linkInput,
                 styles.linkNameInput,
                 { color: theme.colors.text.default },
               ]}
               placeholder="Link name"
               placeholderTextColor={theme.colors.text.subtle}
               value={linkName}
               onChangeText={setLinkName}
               autoFocus
                returnKeyType="next"
                onSubmitEditing={() => linkUrlRef.current?.focus()}
                blurOnSubmit={false}
             />
             <TextInput
                ref={linkUrlRef}
               style={[styles.linkInput, { color: theme.colors.text.default }]}
               placeholder="https://"
                placeholderTextColor={theme.colors.text.subtle}
                value={linkUrl}
                onChangeText={handleLinkUrlChange}
                keyboardType="url"
                autoCapitalize="none"
              />
              {linkError && (
                <View style={styles.linkErrorContainer}>
                  <Feather
                    name="alert-circle"
                    size={14}
                    color={theme.colors.error[500]}
                  />
                  <Text
                    size="xs"
                    style={{ color: theme.colors.error[500], marginLeft: 4 }}
                  >
                    {linkError}
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
                <Pressable
                  onPress={handleAddLink}
                  disabled={!canAddLink}
                  style={[
                    styles.addLinkButton,
                    {
                      backgroundColor: canAddLink
                        ? theme.colors.brand[500]
                        : theme.colors.background.subtle,
                    },
                  ]}
                >
                  <Text
                    size="md"
                    weight="semibold"
                    style={{
                      color: canAddLink ? "#FFFFFF" : theme.colors.text.subtle,
                      fontSize: 16,
                    }}
                  >
                    Add link
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setLinkName("");
                    setLinkUrl("");
                    setLinkError(null);
                    setInputMode("keyboard");
                    inputModeRef.current = "keyboard";
                    inputRef.current?.focus();
                  }}
                  style={[
                    styles.addLinkButton,
                    { backgroundColor: theme.colors.background.subtle },
                  ]}
                >
                  <Text size="md" weight="semibold" style={{ color: theme.colors.text.subtle, fontSize: 16 }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
              {(() => {
                const links = extractMarkdownLinks(text);
                if (links.length === 0) return null;
                return (
                  <View style={styles.addedLinksContainer}>
                    <Text size="md" weight="semibold">Added links:</Text>
                    {links.map((link, i) => (
                      <View key={i} style={styles.addedLinkRow}>
                        <Feather name="link" size={16} color={theme.colors.text.subtle} style={{ marginTop: 4 }} />
                        <View style={{ flex: 1 }}>
                          <Text size="md" style={{ color: "#3B82F6" }}>
                            {link.name}
                          </Text>
                          <Text size="md" mode="subtle">
                            {link.url.split("").join("\u200B")}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {
                            const markdown = `[${link.name}](${link.url})`;
                            setText((prev) => prev.replace(markdown, "").replace(/\n{2,}/g, "\n").trim());
                          }}
                          hitSlop={8}
                        >
                          <Ionicons name="close-circle" size={18} color={theme.colors.error[500]} style={{ marginTop: 4 }} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </Animated.View>
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

const styles = StyleSheet.create((theme) => ({
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.background.default,
  },
  screen: {
    flex: 1,
  },
  fullscreenLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.sm,
    height: 52,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
  },
  postButton: {
    paddingHorizontal: theme.spacing.md + 4,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full,
  },
  replyBanner: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  postPreview: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  postPreviewInfo: {
    flex: 1,
    maxHeight: Dimensions.get("window").height * 0.2,
  },
  postPreviewInfoContent: {
    gap: 2,
  },
  postPreviewBody: {
    marginTop: theme.spacing.xs,
  },
  postPreviewThumbnail: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    marginLeft: theme.spacing.sm,
  },
  contentArea: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    flexGrow: 1,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: "top",
    paddingVertical: theme.spacing.xs,
  },
  linkContainer: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  linkInput: {
    fontSize: 18,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
  },
  linkNameInput: {
    fontSize: 20,
    fontWeight: "600",
  },
  linkErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
  },
  addLinkButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.radius.full,
  },
  addedLinksContainer: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  addedLinkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.xs,
  },
  previewContainer: {
    marginBottom: theme.spacing.sm,
  },
  previewWrapper: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    position: "relative",
    backgroundColor: theme.colors.background.subtle,
  },
  previewImage: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  },
  previewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadedBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.9)",
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  uploadedBadgeText: {
    color: "#fff",
    marginLeft: 4,
  },
  uploadWarningBadge: {
    backgroundColor: "rgba(234,179,8,0.85)",
  },
  uploadErrorBadge: {
    backgroundColor: "rgba(220,50,50,0.85)",
  },
  removeButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
  },
  toolbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  toolbarButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  gifSection: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  gifDivider: {
    height: 1,
    marginHorizontal: -theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  gifSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  gifSearchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  gifSearchIcon: {
    marginRight: theme.spacing.xs,
  },
  gifSearchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: theme.spacing.sm,
  },
  gifCloseButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  giphyAttribution: {
    marginBottom: theme.spacing.xs,
  },
  gifScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    minHeight: 100,
  },
  gifEmptyState: {
    width: 200,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  gifItem: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  gifItemSelected: {
    borderColor: theme.colors.brand[500],
  },
  gifImage: {
    width: "100%",
    height: "100%",
  },
}));
