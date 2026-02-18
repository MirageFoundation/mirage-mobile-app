import { Entypo, EvilIcons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Keyboard,
  Modal,
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

import {
  uploadImageAndGetUrl,
  uploadVideoAndGetUrl,
} from "@/src/api/read/hooks/use-upload-media";
import { usePost, type CreatePostMutationInput } from "@/src/api/write";
import type { ContentTag } from "@/src/api/write/endpoints/posts";
import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useToast } from "@/src/providers/toast-provider";
import { TransactionProgressModal } from "@/src/components/molecules/transaction-progress-modal";
import { useTransactionProgress } from "@/src/hooks/use-transaction-progress";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import { useDraftStore, type Community } from "@/src/stores/draft-store";
import { useHomePostCardStore } from "./home/home-post-card-store";

import { CommunitySelectionModal } from "./create/community-selection-modal";
import { StickerPicker } from "@/src/components/molecules/sticker-picker";

// Strict URL validation - requires protocol (http:// or https://)
const URL_REGEX = /^https?:\/\/[^\s<>"{}|\\^`\[\]]+$/i;

// Helper to check if input looks like a URL attempt (has dot but no protocol)
function looksLikeUrlWithoutProtocol(text: string): boolean {
  return (
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+/i.test(text) &&
    !text.startsWith("http")
  );
}

const CONTENT_WARNING_OPTIONS: { value: ContentTag; label: string }[] = [
  { value: "sensitive", label: "Sensitive" },
  { value: "porn", label: "Porn" },
  { value: "violence", label: "Violence" },
  { value: "gore", label: "Gore" },
  { value: "death", label: "Death" },
];

type VideoUploadEntry = { url: string | null; uploading: boolean; progress: number; error: string | null };
const VIDEO_UPLOADS = new Map<string, VideoUploadEntry>();

type VideoMeta = { originalUri: string; width: number; height: number; trimStart: number; trimEnd: number };
const VIDEO_META = new Map<string, VideoMeta>();

let _handledVideoParam: string | null = null;

export function CreateScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  // Get params from video editor
  const params = useLocalSearchParams<{
    videoUri?: string;
    originalVideoUri?: string;
    replacingUri?: string;
    videoWidth?: string;
    videoHeight?: string;
    trimStart?: string;
    trimEnd?: string;
    isMuted?: string;
  }>();

  const { draft, updateDraft, clearDraft, setAttachment, removeAttachment } =
    useDraftStore();

  const titleInputRef = useRef<TextInput>(null);
  const bodyInputRef = useRef<TextInput>(null);
  const bodySelectionRef = useRef({ start: 0, end: 0 });
  const [bodySelection, setBodySelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const linkInputRef = useRef<TextInput>(null);
  const videoScrollRef = useRef<ScrollView>(null);
  const editingVideoUriRef = useRef<string | null>(null);
  const videoMetaRef = useRef<Map<string, { originalUri: string; width: number; height: number; trimStart: number; trimEnd: number }>>(new Map());

  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [showContentWarningModal, setShowContentWarningModal] = useState(false);
  const [selectedContentWarning, setSelectedContentWarning] =
    useState<ContentTag>("");
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [selectedStickers, setSelectedStickers] = useState<string[]>([]);

  const [videoUploadState, setVideoUploadState] = useState<
    Record<string, { progress: number; uploading: boolean; done: boolean; error: string | null }>
  >(() => {
    const init: Record<string, { progress: number; uploading: boolean; done: boolean; error: string | null }> = {};
    for (const [uri, entry] of VIDEO_UPLOADS) {
      init[uri] = {
        progress: entry.progress,
        uploading: entry.uploading,
        done: !!entry.url,
        error: entry.error,
      };
    }
    return init;
  });
  const videoUploadStateRef = useRef(setVideoUploadState);
  videoUploadStateRef.current = setVideoUploadState;
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const toast = useToast();

  const isUploadingVideo = useMemo(() => {
    return Object.values(videoUploadState).some((v) => v.uploading);
  }, [videoUploadState]);

  const startVideoUpload = useCallback((uri: string) => {
    VIDEO_UPLOADS.set(uri, { url: null, uploading: true, progress: 0, error: null });
    videoUploadStateRef.current((prev) => ({
      ...prev,
      [uri]: { progress: 0, uploading: true, done: false, error: null },
    }));
    uploadVideoAndGetUrl(uri, (progress) => {
      const clamped = Math.min(100, Math.max(0, progress));
      const entry = VIDEO_UPLOADS.get(uri);
      if (entry) {
        VIDEO_UPLOADS.set(uri, { ...entry, progress: clamped });
      }
      videoUploadStateRef.current((prev) => ({
        ...prev,
        [uri]: { ...prev[uri], progress: clamped },
      }));
    })
      .then((url) => {
        console.log("[CreatePost] Video uploaded:", url);
        VIDEO_UPLOADS.set(uri, { url, uploading: false, progress: 100, error: null });
        videoUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { progress: 100, uploading: false, done: true, error: null },
        }));
        triggerHaptic("success");
      })
      .catch((err) => {
        console.error("[CreatePost] Video upload failed:", err);
        const msg = err instanceof Error ? err.message : "Upload failed";
        VIDEO_UPLOADS.set(uri, { url: null, uploading: false, progress: 0, error: msg });
        videoUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { progress: 0, uploading: false, done: false, error: msg },
        }));
        toast.error("Video upload failed", msg);
        triggerHaptic("error");
      });
  }, [toast]);

  const txProgress = useTransactionProgress();
  const postMutation = usePost({ onPoWProgress: txProgress.updatePoWProgress });
  const triggerScrollToTop = useHomePostCardStore((s) => s.triggerScrollToTop);

  const screenWidth = Dimensions.get("window").width;
  const selectedCommunity = draft.community;

  const canPost = useMemo(() => {
    const hasTitleContent = draft.title.trim().length > 0;
    const hasCommunity = draft.community !== null;
    const videoStillUploading =
      draft.attachmentType === "video" && isUploadingVideo;
    return hasTitleContent && hasCommunity && !videoStillUploading;
  }, [draft.title, draft.community, draft.attachmentType, isUploadingVideo]);

  const hasAttachment = useMemo(() => {
    return showLinkInput || draft.attachmentType !== null;
  }, [showLinkInput, draft.attachmentType]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Clean up stale attachment state on mount
  useEffect(() => {
    // If attachmentType is set but there's no actual content, clear it
    if (draft.attachmentType === "link" && !draft.linkUrl) {
      removeAttachment();
    } else if (
      (draft.attachmentType === "image" || draft.attachmentType === "video") &&
      draft.mediaUris.length === 0
    ) {
      removeAttachment();
    }
  }, []);

  // Handle video returned from editor
  useEffect(() => {
    if (!params.videoUri) return;
    if (_handledVideoParam === params.videoUri) return;

    _handledVideoParam = params.videoUri;
    console.log("[CreatePost] Received video from editor:", params.videoUri);

    const oldUri = params.replacingUri || null;
    if (oldUri) {
      const { removeMediaUri } = useDraftStore.getState();
      removeMediaUri(oldUri);
      VIDEO_UPLOADS.delete(oldUri);
      setVideoUploadState((prev) => { const next = { ...prev }; delete next[oldUri]; return next; });
      VIDEO_META.delete(oldUri);
    }

    const origUri = params.originalVideoUri ?? params.videoUri;
    const w = params.videoWidth ? parseInt(params.videoWidth) : 1920;
    const h = params.videoHeight ? parseInt(params.videoHeight) : 1080;
    const ts = params.trimStart ? parseInt(params.trimStart) : 0;
    const te = params.trimEnd ? parseInt(params.trimEnd) : 0;
    VIDEO_META.set(params.videoUri, { originalUri: origUri, width: w, height: h, trimStart: ts, trimEnd: te });

    setAttachment("video", params.videoUri);
    setIsVideoMuted(params.isMuted === "1");
    startVideoUpload(params.videoUri);
  }, [params.videoUri, params.originalVideoUri, params.replacingUri, params.videoWidth, params.videoHeight, params.trimStart, params.trimEnd, params.isMuted]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;

    triggerHaptic("selection");
    clearDraft();
    VIDEO_UPLOADS.clear();
    setVideoUploadState({});
    VIDEO_META.clear();
    _handledVideoParam = null;
    setIsVideoMuted(false);
    setIsVideoPlaying(false);
    router.back();
  }, [isSubmitting, clearDraft]);

  const handlePost = useCallback(async () => {
    if (!canPost || isSubmitting || txProgress.isVisible) return;

    Keyboard.dismiss();
    setIsSubmitting(true);
    txProgress.startTransaction();
    triggerHaptic("medium");

    try {
      const mediaUrls: string[] = [];

      if (selectedStickers.length > 0) {
        mediaUrls.push(...selectedStickers);
      }

      if (draft.attachmentType === "image" && draft.mediaUris.length > 0) {
        try {
          console.log("[CreatePost] Uploading images...", draft.mediaUris.length);
          const uploads = await Promise.all(
            draft.mediaUris.map((uri) => uploadImageAndGetUrl(uri))
          );
          mediaUrls.push(...uploads);
          console.log("[CreatePost] Images uploaded successfully:", mediaUrls);
        } catch (error) {
          console.error("[CreatePost] Image upload failed:", error);
          toast.error(
            "Image upload failed",
            error instanceof Error ? error.message : "Please try again",
          );
          setIsSubmitting(false);
          txProgress.reset();
          return;
        }
      }

      if (draft.attachmentType === "video") {
        console.log("[CreatePost] VIDEO_UPLOADS entries:", VIDEO_UPLOADS.size);
        for (const [uri, entry] of VIDEO_UPLOADS) {
          console.log("[CreatePost] Video entry:", uri, "url:", entry.url, "uploading:", entry.uploading);
          if (entry.url) {
            mediaUrls.push(entry.url);
          }
        }
      }

      let content = draft.body;

      if (draft.linkUrl) {
        content = content ? `${draft.linkUrl}\n\n${content}` : draft.linkUrl;
      }

      const isUserProfile =
        draft.community?.description === "Post to your profile";
      const topic = isUserProfile
        ? "general"
        : (draft.community?.id ?? "general");

      const postInput: CreatePostMutationInput = {
        topic,
        title: draft.title.trim(),
        content: content,
        tag: selectedContentWarning,
        media: mediaUrls.length > 0 ? mediaUrls : undefined,
        optimisticMediaUrl: mediaUrls[0] ?? undefined,
        optimisticMediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      };

      console.log("[CreatePost] Submitting post:", postInput);

      txProgress.setPhase("signing");
      const result = await postMutation.mutateAsync(postInput);

      txProgress.setPhase("confirming");
      let confirmed = false;
      if (result?.tx_hash) {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const status = await getTxStatus({ hash: result.tx_hash });
            if (status.found && status.indexed) {
              confirmed = true;
              break;
            }
          } catch {}
        }
      }

      txProgress.setSuccess(result?.tx_hash);

      console.log("[CreatePost] Post created successfully:", result);

      setSelectedContentWarning("");
      setSelectedStickers([]);
      setShowLinkInput(false);
      setLinkUrl("");
      setLinkError(null);
      setImageDimensions(null);
      VIDEO_UPLOADS.clear();
      setVideoUploadState({});
      VIDEO_META.clear();
      _handledVideoParam = null;
      setIsVideoMuted(false);

      clearDraft();

      setIsSubmitting(false);

      triggerScrollToTop();

      setTimeout(() => {
        txProgress.hideModal();
        router.replace("/(tabs)/");
      }, 1000);
    } catch (error) {
      console.error("[CreatePost] Error creating post:", error);

      setIsSubmitting(false);

      const errorMessage =
        error instanceof Error ? error.message : "Failed to create post";
      txProgress.setError(errorMessage);
    }
  }, [
    canPost,
    isSubmitting,
    draft,
    clearDraft,
    postMutation,
    toast,
    selectedContentWarning,
    isVideoMuted,
    router,
    txProgress,
  ]);

  const handleCommunitySelect = useCallback(
    (community: Community) => {
      updateDraft({ community });
      setShowCommunityModal(false);
      triggerHaptic("selection");
    },
    [updateDraft],
  );

  const handleOpenContentWarning = useCallback(() => {
    triggerHaptic("selection");
    setShowContentWarningModal(true);
  }, []);

  const handleSelectContentWarning = useCallback((warning: ContentTag) => {
    triggerHaptic("selection");
    setSelectedContentWarning(warning);
    setShowContentWarningModal(false);
  }, []);

  const handleClearContentWarning = useCallback(() => {
    triggerHaptic("selection");
    setSelectedContentWarning("");
  }, []);

  const handleLinkPress = useCallback(() => {
    if (hasAttachment && !showLinkInput) return;
    triggerHaptic("selection");
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.focus(), 100);
  }, [hasAttachment, showLinkInput]);

  const handleLinkChange = useCallback(
    (text: string) => {
      setLinkUrl(text);
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        // Check if it's a valid URL with protocol
        const isValid = URL_REGEX.test(text);
        if (isValid) {
          setLinkError(null);
          setAttachment("link", text);
          updateDraft({ linkUrl: text });
        } else if (looksLikeUrlWithoutProtocol(trimmed)) {
          // User typed something like "google.com" - show hint to add protocol
          setLinkError("Add https:// to the beginning of your link");
        } else {
          setLinkError("Please enter a valid URL (e.g., https://example.com)");
        }
      } else {
        setLinkError(null);
      }
    },
    [setAttachment, updateDraft],
  );

  const handleLinkSubmit = useCallback(() => {
    if (linkUrl && !linkError) {
      setAttachment("link", linkUrl);
      updateDraft({ linkUrl });
    }
  }, [linkUrl, linkError, setAttachment, updateDraft]);

  const handleRemoveLink = useCallback(() => {
    setShowLinkInput(false);
    setLinkUrl("");
    setLinkError(null);
    removeAttachment();
  }, [removeAttachment]);

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
  }, [hasAttachment, draft.attachmentType, draft.mediaUris.length, setAttachment]);

  const handleVideoPress = useCallback(async () => {
    if (hasAttachment && draft.attachmentType !== "video") return;
    if (draft.mediaUris.length >= 10) return;
    triggerHaptic("selection");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: 300,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      router.push({
        pathname: "/video-editor",
        params: {
          uri: asset.uri,
          width: asset.width?.toString() ?? "1920",
          height: asset.height?.toString() ?? "1080",
        },
      });
    }
  }, [hasAttachment, draft.attachmentType, draft.mediaUris.length]);

  const handlePollPress = useCallback(() => {
    if (hasAttachment) return;
    triggerHaptic("selection");
    toast.info("Coming soon", "Polls will be available soon");
  }, [hasAttachment, toast]);

  const handleStickerPress = useCallback(() => {
    triggerHaptic("selection");
    setShowStickerPicker(true);
  }, []);

  const handleSpoilerPress = useCallback(() => {
    triggerHaptic("selection");
    const { start, end } = bodySelectionRef.current;
    const body = draft.body;
    const before = body.slice(0, start);
    const selected = body.slice(start, end);
    const after = body.slice(end);
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
  }, [draft.body, updateDraft]);

  const handleRemoveMedia = useCallback(() => {
    triggerHaptic("selection");
    removeAttachment();
    setImageDimensions(null);
    VIDEO_UPLOADS.clear();
    setVideoUploadState({});
    setIsVideoMuted(false);
    setIsVideoPlaying(false);
  }, [removeAttachment]);

  const handleRemoveVideo = useCallback((uri: string) => {
    triggerHaptic("selection");
    const { removeMediaUri } = useDraftStore.getState();
    removeMediaUri(uri);
    VIDEO_UPLOADS.delete(uri);
    setVideoUploadState((prev) => { const next = { ...prev }; delete next[uri]; return next; });
    VIDEO_META.delete(uri);
  }, []);

  const handleEditVideo = useCallback((uri: string) => {
    triggerHaptic("selection");
    editingVideoUriRef.current = uri;
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
  }, []);

  const handleCancelVideoUpload = useCallback(() => {
    triggerHaptic("selection");
    removeAttachment();
    VIDEO_UPLOADS.clear();
    setVideoUploadState({});
    setIsVideoMuted(false);
    setIsVideoPlaying(false);
  }, [removeAttachment]);

  const handleToggleVideoMute = useCallback(() => {
    triggerHaptic("selection");
    setIsVideoMuted((prev) => !prev);
  }, []);

  const TAB_BAR_HEIGHT = 60;

  const renderVideoPreview = () => {
    if (draft.attachmentType !== "video" || draft.mediaUris.length === 0) {
      return null;
    }

    const VIDEO_HEIGHT = 180;
    const VIDEO_WIDTH = Math.round(VIDEO_HEIGHT * (16 / 9) * 0.6);

    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.videoPreviewContainer}
      >
        <ScrollView
          ref={videoScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
          onContentSizeChange={() => videoScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {draft.mediaUris.map((uri) => {
            const upload = videoUploadState[uri];
            return (
              <Pressable key={uri} onPress={() => handleEditVideo(uri)} style={[styles.videoPlayerWrapper, { height: VIDEO_HEIGHT, width: VIDEO_WIDTH }]}>
                <View pointerEvents="none">
                  <Video
                    source={{ uri }}
                    style={[styles.videoPlayer, { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }]}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={false}
                    isMuted
                    useNativeControls={false}
                  />
                </View>

                <View style={styles.mediaTypeBadge}>
                  <Feather name="video" size={12} color="#fff" />
                </View>

                {upload?.uploading && (
                  <View style={styles.uploadedBadge}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                      Uploading…
                    </Text>
                  </View>
                )}

                {upload && !upload.uploading && upload.done && (
                  <View style={styles.uploadedBadge}>
                    <Feather name="check" size={12} color="#fff" />
                    <Text
                      size="xs"
                      weight="medium"
                      style={{ color: "#fff", marginLeft: 4 }}
                    >
                      Uploaded
                    </Text>
                  </View>
                )}

                {upload?.error && (
                  <View style={[styles.uploadedBadge, { backgroundColor: "rgba(220,50,50,0.8)" }]}>
                    <Feather name="alert-circle" size={12} color="#fff" />
                    <Text
                      size="xs"
                      weight="medium"
                      style={{ color: "#fff", marginLeft: 4 }}
                    >
                      Failed
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={() => handleRemoveVideo(uri)}
                  style={styles.videoRemoveButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={styles.removeButtonInner}>
                    <Feather name="x" size={18} color="#fff" />
                  </View>
                </Pressable>
              </Pressable>
            );
          })}

          {draft.mediaUris.length < 10 && (
            <Pressable
              onPress={handleVideoPress}
              style={[
                styles.videoPlayerWrapper,
                {
                  height: VIDEO_HEIGHT,
                  width: VIDEO_WIDTH * 0.5,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.2)",
                  borderStyle: "dashed",
                },
              ]}
            >
              <Feather name="plus" size={32} color="rgba(255,255,255,0.5)" />
              <Text size="xs" style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                Add video
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    );
  };

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      <View style={styles.header}>
        <Button
          variant="ghost"
          size="auto"
          onPress={handleClose}
          style={styles.headerButton}
        >
          <Button.Icon>
            <EvilIcons
              name="close"
              size={36}
              color={theme.colors.text.default}
            />
          </Button.Icon>
        </Button>

        <Box flex />

        <Button
          variant={"outline"}
          size="sm"
          onPress={handlePost}
          disabled={!canPost || isSubmitting}
          style={[
            styles.postButton,
            (!canPost || isSubmitting) && styles.postButtonDisabled,
            {
              backgroundColor:
                canPost && !isSubmitting
                  ? "rgb(29,68,150)"
                  : theme.colors.background.subtle,
              paddingHorizontal: 10,
            },
          ]}
        >
          <Button.Text
            style={[
              styles.postButtonText,
              {
                color:
                  canPost && !isSubmitting
                    ? "#fff"
                    : theme.colors.text.emphasis,
              },
            ]}
          >
            Post
          </Button.Text>
        </Button>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 80 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => {
              triggerHaptic("selection");
              setShowCommunityModal(true);
            }}
            style={[
              styles.communitySelector,
              {
                backgroundColor: theme.colors.background.lighter,
              },
            ]}
          >
            {selectedCommunity && (
              <Text
                size="xl"
                weight="bold"
                style={{ color: theme.colors.text.default }}
              >
                #
              </Text>
            )}
            <Text
              size="lg"
              weight="semibold"
              style={{ color: theme.colors.text.default }}
            >
              {selectedCommunity?.name?.toLowerCase() ?? "Select a topic"}
            </Text>
            <Box style={{ marginLeft: 5 }}>
              <Entypo
                name="chevron-up"
                size={12}
                color={theme.colors.text.default}
                style={{ marginBottom: -5 }}
              />
              <Entypo
                name="chevron-down"
                size={12}
                color={theme.colors.text.default}
              />
            </Box>
          </Pressable>

          {selectedCommunity?.isNewTopic && (
            <View
              style={[
                styles.newTopicWarning,
                { backgroundColor: theme.colors.warning[500] + "15" },
              ]}
            >
              <Text size="xs" mode="subtle" style={{ lineHeight: 16 }}>
                Topics are communities centered around specific interests.
                Posting in the wrong topic may affect your overall trust status
                on Mirage. Make sure to post into the right category!
              </Text>
            </View>
          )}

          <TextInput
            ref={titleInputRef}
            style={[styles.titleInput, { color: theme.colors.text.default }]}
            placeholder="Title"
            placeholderTextColor={theme.colors.text.subtle}
            value={draft.title}
            onChangeText={(text) => updateDraft({ title: text })}
            multiline
            maxLength={300}
            returnKeyType="next"
            onSubmitEditing={() => bodyInputRef.current?.focus()}
            blurOnSubmit={false}
          />

          <Pressable
            onPress={handleOpenContentWarning}
            style={[
              styles.tagsButton,
              {
                backgroundColor: theme.colors.background.lighter,
              },
            ]}
          >
            {selectedContentWarning ? (
              <View style={styles.contentWarningSelected}>
                <Text
                  size="md"
                  weight="bold"
                  style={{ color: theme.colors.warning[500] }}
                >
                  ⚠️{" "}
                  {selectedContentWarning.charAt(0).toUpperCase() +
                    selectedContentWarning.slice(1)}
                </Text>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    handleClearContentWarning();
                  }}
                  hitSlop={8}
                >
                  <Feather
                    name="x"
                    size={14}
                    color={theme.colors.text.subtle}
                  />
                </Pressable>
              </View>
            ) : (
              <Text
                size="md"
                weight="semibold"
                style={{ color: theme.colors.text.default }}
              >
                Add content warning (optional)
              </Text>
            )}
          </Pressable>

          {showLinkInput && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              style={styles.linkInputContainer}
            >
              <View style={styles.linkInputWrapper}>
                <TextInput
                  ref={linkInputRef}
                  style={[
                    styles.linkInput,
                    { color: theme.colors.text.default },
                  ]}
                  placeholder="URL"
                  placeholderTextColor={theme.colors.text.subtle}
                  value={linkUrl}
                  onChangeText={handleLinkChange}
                  onSubmitEditing={handleLinkSubmit}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Pressable
                  onPress={handleRemoveLink}
                  style={[
                    styles.linkClearButton,
                    { backgroundColor: theme.colors.background.subtle },
                  ]}
                >
                  <Feather
                    name="x"
                    size={16}
                    color={theme.colors.text.subtle}
                  />
                </Pressable>
              </View>
              {linkError && (
                <View
                  style={[
                    styles.linkErrorContainer,
                    { borderColor: theme.colors.border.default },
                  ]}
                >
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
            </Animated.View>
          )}

          {draft.attachmentType === "image" && draft.mediaUris.length > 0 && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              style={styles.videoPreviewContainer}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
              >
                {draft.mediaUris.map((uri, index) => (
                  <View key={uri} style={[styles.videoPlayerWrapper, { height: 200, width: 200 }]}>
                    <Image
                      source={{ uri }}
                      style={[styles.videoPlayer, { resizeMode: "cover" }]}
                    />
                    <View style={styles.mediaTypeBadge}>
                      <Feather name="image" size={12} color="#fff" />
                    </View>
                    <Pressable
                      onPress={() => {
                        const { removeMediaUri } = useDraftStore.getState();
                        removeMediaUri(uri);
                      }}
                      style={styles.videoRemoveButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <View style={styles.removeButtonInner}>
                        <Feather name="x" size={18} color="#fff" />
                      </View>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {renderVideoPreview()}

          {selectedStickers.length > 0 && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              style={styles.videoPreviewContainer}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
              >
                {selectedStickers.map((url) => (
                  <View key={url} style={[styles.videoPlayerWrapper, { height: 140, width: 140, backgroundColor: theme.colors.background.subtle }]}>
                    <Image
                      source={{ uri: url }}
                      style={[styles.videoPlayer, { resizeMode: "contain" }]}
                    />
                    <Pressable
                      onPress={() => setSelectedStickers((prev) => prev.filter((s) => s !== url))}
                      style={[styles.videoRemoveButton, { top: 4, right: 4 }]}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <View style={styles.removeButtonInner}>
                        <Feather name="x" size={18} color="#fff" />
                      </View>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          <TextInput
            ref={bodyInputRef}
            style={[styles.bodyInput, { color: theme.colors.text.default }]}
            placeholder="body text (optional)"
            placeholderTextColor={theme.colors.text.subtle}
            value={draft.body}
            onChangeText={(text) => updateDraft({ body: text })}
            multiline
            textAlignVertical="top"
            selection={bodySelection}
            onSelectionChange={(e) => {
              bodySelectionRef.current = e.nativeEvent.selection;
            }}
          />
        </ScrollView>

        <Animated.View
          style={[
            styles.mediaBar,
            {
              backgroundColor: theme.colors.background.default,
              paddingBottom: keyboardVisible
                ? 8
                : Platform.OS === "android"
                  ? TAB_BAR_HEIGHT + 24
                  : insets.bottom + TAB_BAR_HEIGHT + 8,
            },
          ]}
        >
          <View style={styles.mediaBarContent}>
            <Pressable
              onPress={handleLinkPress}
              disabled={hasAttachment && !showLinkInput}
              style={[
                styles.mediaButton,
                hasAttachment && !showLinkInput && styles.mediaButtonDisabled,
              ]}
            >
              <Feather
                name="link"
                size={22}
                color={
                  hasAttachment && !showLinkInput
                    ? theme.colors.text.subtle
                    : theme.colors.text.default
                }
              />
            </Pressable>

            <Pressable
              onPress={handleImagePress}
              disabled={hasAttachment && draft.attachmentType !== "image"}
              style={[
                styles.mediaButton,
                hasAttachment &&
                  draft.attachmentType !== "image" &&
                  styles.mediaButtonDisabled,
              ]}
            >
              <Feather
                name="image"
                size={22}
                color={
                  hasAttachment && draft.attachmentType !== "image"
                    ? theme.colors.text.subtle
                    : theme.colors.text.default
                }
              />
            </Pressable>

            <Pressable
              onPress={handleVideoPress}
              disabled={hasAttachment && draft.attachmentType !== "video"}
              style={[
                styles.mediaButton,
                hasAttachment &&
                  draft.attachmentType !== "video" &&
                  styles.mediaButtonDisabled,
              ]}
            >
              <Feather
                name="video"
                size={22}
                color={
                  hasAttachment && draft.attachmentType !== "video"
                    ? theme.colors.text.subtle
                    : theme.colors.text.default
                }
              />
            </Pressable>

            <Pressable
              onPress={handleStickerPress}
              style={styles.mediaButton}
            >
              <MaterialCommunityIcons
                name="sticker-emoji"
                size={22}
                color={theme.colors.text.default}
              />
            </Pressable>

            <Pressable
              onPress={handleSpoilerPress}
              style={styles.mediaButton}
            >
              <Feather
                name="eye-off"
                size={22}
                color={theme.colors.text.default}
              />
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>

      <CommunitySelectionModal
        visible={showCommunityModal}
        onClose={() => setShowCommunityModal(false)}
        onSelect={handleCommunitySelect}
        selectedCommunity={selectedCommunity ?? undefined}
      />

      <Modal
        visible={showContentWarningModal}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowContentWarningModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowContentWarningModal(false)}
        >
          <Pressable
            style={[
              styles.contentWarningModalContent,
              { backgroundColor: theme.colors.background.base },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.contentWarningHeader}>
              <Text size="lg" weight="bold">
                Add content warning
              </Text>
              <Pressable
                onPress={() => setShowContentWarningModal(false)}
                hitSlop={8}
              >
                <Feather name="x" size={20} color={theme.colors.text.subtle} />
              </Pressable>
            </View>

            <View style={styles.contentWarningOptions}>
              {CONTENT_WARNING_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelectContentWarning(option.value)}
                  style={styles.contentWarningOption}
                >
                  <Text size="md" style={{ color: theme.colors.text.default }}>
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor:
                          selectedContentWarning === option.value
                            ? theme.colors.brand[500]
                            : theme.colors.border.default,
                        backgroundColor:
                          selectedContentWarning === option.value
                            ? theme.colors.brand[500]
                            : "transparent",
                      },
                    ]}
                  >
                    {selectedContentWarning === option.value && (
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: "#fff",
                        }}
                      />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>

            {selectedContentWarning && (
              <Pressable
                onPress={() => {
                  setSelectedContentWarning("");
                  setShowContentWarningModal(false);
                }}
                style={styles.clearWarningButton}
              >
                <Text size="sm" style={{ color: theme.colors.error[500] }}>
                  Remove warning
                </Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <StickerPicker
        visible={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        onSelect={setSelectedStickers}
        selectedStickers={selectedStickers}
        multiSelect
      />

      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Creating Post"
        description="Your post is being published to the blockchain"
        onDismiss={() => {
          txProgress.hideModal();
          setIsSubmitting(false);
        }}
        onRetry={handlePost}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
  },
  postButton: {
    paddingHorizontal: theme.spacing.md,
    height: 36,
    borderRadius: theme.radius.full,
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  postButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
  },
  communitySelector: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    gap: 0,
    borderRadius: theme.radius.full,
  },
  newTopicWarning: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.sm,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: "700",
    fontFamily: theme.typography.family.mono,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.md,
    minHeight: 50,
  },
  tagsButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md + 2,
    borderRadius: theme.radius.full,
  },
  contentWarningSelected: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  linkInputContainer: {
    paddingTop: theme.spacing.md,
  },
  linkInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  linkInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: theme.typography.family.mono,
    paddingVertical: theme.spacing.sm,
  },
  linkClearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  linkErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.md,
  },
  mediaPreviewContainer: {
    marginTop: theme.spacing.md,
    overflow: "hidden",
    position: "relative",
  },
  mediaPreview: {},
  mediaRemoveButton: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  bodyInput: {
    fontSize: 18,
    fontFamily: theme.typography.family.mono,
    paddingVertical: theme.spacing.md,
    minHeight: 150,
    textAlignVertical: "top",
  },
  mediaBar: {
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  mediaBarContent: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  mediaButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaButtonDisabled: {
    opacity: 0.4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  contentWarningModalContent: {
    width: "100%",
    maxWidth: 340,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
  },
  contentWarningHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  contentWarningOptions: {
    gap: theme.spacing.xs,
  },
  contentWarningOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  clearWarningButton: {
    alignItems: "center",
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  uploadOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  uploadProgressContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 180,
  },
  uploadProgressContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  progressBar: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  cancelUploadButton: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  uploadSuccessBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  muteToggleButton: {
    position: "absolute",
    bottom: 12,
    right: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  muteToggleButtonLarge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  videoPreviewContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  videoPlayerWrapper: {
    width: "100%",
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  videoPlayer: {
    width: "100%",
    height: "100%",
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playPauseButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoRemoveButton: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  removeButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaTypeBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 20,
  },
  uploadStatusOverlay: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
  },
  uploadStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: "flex-start",
  },
  uploadProgressBarOverlay: {
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  uploadProgressFillOverlay: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 2,
  },
  uploadedBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.9)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  videoMuteButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
  },
  muteButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
}));
