import { Entypo, EvilIcons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinkPreviewCard } from "@/src/components/molecules/link-preview-card";
import { markEditJustCompleted } from "@/src/utils/edit-post";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import { fetchLinkMeta } from "@/src/utils/fetch-link-meta";
import { mergeAudioVideo } from "@/src/utils/merge-audio-video";
import { trimToMaxDuration } from "@/src/utils/video-processing";
import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";
import { Audio, ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { Paths, File as ExpoFile } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
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
import { BlurView } from "expo-blur";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  uploadImageAndGetUrl,
  uploadVideoAndGetUrl,
} from "@/src/api/read/hooks/use-upload-media";
import { usePost, useEdit, type CreatePostMutationInput } from "@/src/api/write";
import type { ContentTag, EditPostInput } from "@/src/api/write/endpoints/posts";
import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useToast } from "@/src/providers/toast-provider";
import { TransactionProgressModal } from "@/src/components/molecules/transaction-progress-modal";
import { useTransactionProgress } from "@/src/hooks/use-transaction-progress";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import { useDraftStore, type Community } from "@/src/stores/draft-store";
import { useHomePostCardStore } from "./home/home-post-card-store";
import { useUserLevel } from "@/src/stores/auth-store";
import { getTierPostLimits, canEditContent } from "@/src/utils/tiers";

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
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();
  const userLevel = useUserLevel();
  const tierLimits = useMemo(() => getTierPostLimits(userLevel), [userLevel]);

  // Get params from video editor or edit mode
  const params = useLocalSearchParams<{
    videoUri?: string;
    originalVideoUri?: string;
    replacingUri?: string;
    videoWidth?: string;
    videoHeight?: string;
    trimStart?: string;
    trimEnd?: string;
    isMuted?: string;
    editPostId?: string;
    editTopic?: string;
    editTitle?: string;
    editBody?: string;
    editTag?: string;
    editMedia?: string;
    editCreatedAt?: string;
  }>();

  const isEditMode = !!params.editPostId;
  const editPostId = params.editPostId ?? "";

  const editability = useMemo(() => {
    if (!isEditMode || !params.editCreatedAt) return null;
    return canEditContent(userLevel, parseInt(params.editCreatedAt, 10));
  }, [isEditMode, params.editCreatedAt, userLevel]);

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
  const [isProcessingShareLink, setIsProcessingShareLink] = useState(false);
  const [isPreparingVideo, setIsPreparingVideo] = useState(false);
  const navigatedToEditorRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (navigatedToEditorRef.current) {
        navigatedToEditorRef.current = false;
        setIsPreparingVideo(false);
      }
    }, [])
  );

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
        VIDEO_UPLOADS.set(uri, { url, uploading: false, progress: 100, error: null });
        videoUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { progress: 100, uploading: false, done: true, error: null },
        }));
        triggerHaptic("success");
      })
      .catch((err) => {
        Sentry.addBreadcrumb({ category: "video-upload", message: "Video upload failed", data: { error: String(err) }, level: "error" });
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

  const queryClient = useQueryClient();
  const txProgress = useTransactionProgress();
  const postMutation = usePost({ onPoWProgress: txProgress.updatePoWProgress });
  const editMutation = useEdit({ onPoWProgress: txProgress.updatePoWProgress });
  const triggerScrollToTop = useHomePostCardStore((s) => s.triggerScrollToTop);

  const screenWidth = Dimensions.get("window").width;
  const selectedCommunity = draft.community;

  const canPost = useMemo(() => {
    const hasTitleContent = draft.title.trim().length > 0;
    const hasCommunity = draft.community !== null;
    const videoStillUploading =
      draft.attachmentType === "video" && isUploadingVideo;
    const editBlocked = isEditMode && editability && !editability.allowed;
    return hasTitleContent && hasCommunity && !videoStillUploading && !editBlocked;
  }, [draft.title, draft.community, draft.attachmentType, isUploadingVideo, isEditMode, editability]);

  const editExpired = isEditMode && editability !== null && !editability.allowed;

  const hasAttachment = useMemo(() => {
    return showLinkInput || draft.attachmentType !== null;
  }, [showLinkInput, draft.attachmentType]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardWillShow", () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardWillHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Clean up stale attachment state on mount
  useEffect(() => {
    if (isEditMode) return;
    if (draft.attachmentType === "link" && draft.linkUrl) {
      setShowLinkInput(true);
      setLinkUrl(draft.linkUrl);
    } else if (draft.attachmentType === "link" && !draft.linkUrl) {
      removeAttachment();
    } else if (
      (draft.attachmentType === "image" || draft.attachmentType === "video") &&
      draft.mediaUris.length === 0
    ) {
      removeAttachment();
    }
  }, []);

  const editInitializedRef = useRef(false);
  useEffect(() => {
    if (!isEditMode || editInitializedRef.current) return;
    editInitializedRef.current = true;

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
  }, [isEditMode]);

  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const lastProcessedIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasShareIntent || !shareIntent || isEditMode) return;

    const intentKey = shareIntent.webUrl ?? shareIntent.text ?? shareIntent.files?.[0]?.path ?? null;
    if (!intentKey || intentKey === lastProcessedIntentRef.current) return;
    lastProcessedIntentRef.current = intentKey;

    console.log("[CreateScreen] Share intent received:", {
      type: shareIntent.type,
      webUrl: shareIntent.webUrl,
      text: shareIntent.text,
      files: shareIntent.files,
    });

    Sentry.addBreadcrumb({
      category: "share-intent",
      message: "Processing share intent",
      data: { type: shareIntent.type, webUrl: shareIntent.webUrl, hasText: !!shareIntent.text, fileCount: shareIntent.files?.length ?? 0 },
      level: "info",
    });

    clearDraft();
    setShowLinkInput(false);
    setLinkUrl("");
    setLinkError(null);
    removeAttachment();
    setImageDimensions(null);
    setSelectedContentWarning("");
    setSelectedStickers([]);
    VIDEO_UPLOADS.clear();
    setVideoUploadState({});
    VIDEO_META.clear();
    _handledVideoParam = null;
    setIsVideoMuted(false);
    setIsVideoPlaying(false);

    const redditMatch = (shareIntent.webUrl ?? shareIntent.text ?? "").match(/reddit\.com\/r\/([^/]+)/i);
    if (redditMatch) {
      const topicName = redditMatch[1].toLowerCase();
      updateDraft({
        community: {
          id: topicName,
          name: topicName,
          memberCount: 0,
          isSubscribed: false,
          isNewTopic: true,
        },
      });
    }

    setTimeout(() => {
      if (shareIntent.text && !shareIntent.webUrl) {
        updateDraft({ body: shareIntent.text });
      }
      if (shareIntent.webUrl) {
        setIsProcessingShareLink(true);
        fetchLinkMeta(shareIntent.webUrl).then(async (meta) => {
          console.log("[CreateScreen] Link meta extracted:", {
            url: shareIntent.webUrl,
            title: meta.title,
            description: meta.description,
            domain: meta.domain,
            image: meta.image,
            images: meta.images,
            video: meta.video,
            audioUrl: meta.audioUrl,
            audioUrls: meta.audioUrls,
          });
          Sentry.addBreadcrumb({
            category: "share-intent",
            message: "Link meta fetched",
            data: { domain: meta.domain, hasTitle: !!meta.title, hasVideo: !!meta.video, imageCount: meta.images?.length ?? 0 },
            level: "info",
          });
          if (meta.title) {
            updateDraft({ title: meta.title.slice(0, tierLimits.maxTitleLength) });
          }
          const bodyParts: string[] = [];
          if (meta.description) {
            bodyParts.push(meta.description.slice(0, tierLimits.maxContentLength));
          }
          updateDraft({ body: bodyParts.join("\n\n") });
          console.log("[CreateScreen] Draft auto-filled:", {
            title: meta.title?.slice(0, tierLimits.maxTitleLength),
            body: bodyParts.join("\n\n").slice(0, 200),
            community: redditMatch ? redditMatch[1].toLowerCase() : null,
          });

          if (meta.externalUrl) {
            console.log("[CreateScreen] External link detected:", meta.externalUrl);
            setShowLinkInput(true);
            setLinkUrl(meta.externalUrl);
            updateDraft({ linkUrl: meta.externalUrl });
          }

          let videoDownloaded = false;

          if (meta.video) {
            try {
              const response = await fetch(meta.video);
              const contentType = response.headers.get("content-type") ?? "";
              const videoUrl = response.url;

              const isVideoContent = contentType.startsWith("video/") || contentType.startsWith("application/octet-stream");
              const hasVideoExtension = /\.(mp4|mov|webm|m3u8|ts)(\?|#|$)/i.test(videoUrl || meta.video);

              if (response.ok && (isVideoContent || hasVideoExtension)) {
                const ext = contentType.includes("mp4") ? "mp4"
                  : contentType.includes("webm") ? "webm"
                  : contentType.includes("quicktime") ? "mov"
                  : (videoUrl || meta.video).match(/\.(mp4|mov|webm|m3u8)/i)?.[1] ?? "mp4";
                const destFile = new ExpoFile(Paths.cache, `shared_link_video_${Date.now()}.${ext}`);
                const arrayBuffer = await response.arrayBuffer();
                if (arrayBuffer.byteLength > 1000) {
                  const audioUrlsToTry = meta.audioUrls?.length > 0
                    ? meta.audioUrls
                    : meta.audioUrl
                      ? [meta.audioUrl]
                      : [];
                  if (audioUrlsToTry.length > 0) {
                    for (const tryAudioUrl of audioUrlsToTry) {
                      if (videoDownloaded) break;
                      try {
                        const audioRes = await fetch(tryAudioUrl, {
                          headers: {
                            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                            "Referer": "https://www.reddit.com/",
                            "Accept": "*/*",
                          },
                        });
                        if (!audioRes.ok) continue;
                        const audioBuffer = await audioRes.arrayBuffer();
                        if (audioBuffer.byteLength < 500) continue;
                        const audioContentType = audioRes.headers.get("content-type") ?? "";
                        if (audioContentType.includes("text/html") || audioContentType.includes("text/xml")) continue;
                        const mergedBuffer = await mergeAudioVideo(arrayBuffer, audioBuffer);
                        const mergedFile = new ExpoFile(Paths.cache, `shared_link_merged_${Date.now()}.mp4`);
                        mergedFile.write(new Uint8Array(mergedBuffer));
                        let finalUri = mergedFile.uri;
                        try {
                          const { sound } = await Audio.Sound.createAsync({ uri: mergedFile.uri });
                          const status = await sound.getStatusAsync();
                          await sound.unloadAsync();
                          if (status.isLoaded && status.durationMillis && status.durationMillis > 59000) {
                            finalUri = await trimToMaxDuration(mergedFile.uri, status.durationMillis);
                          }
                        } catch {}
                        setAttachment("video", finalUri);
                        startVideoUpload(finalUri);
                        videoDownloaded = true;
                        Sentry.addBreadcrumb({ category: "share-intent", message: "Audio+video merged", level: "info" });
                        break;
                      } catch (mergeErr) {
                        Sentry.addBreadcrumb({ category: "share-intent", message: "Audio merge attempt failed", data: { error: String(mergeErr) }, level: "warning" });
                      }
                    }
                  }
                  if (!videoDownloaded) {
                    destFile.write(new Uint8Array(arrayBuffer));
                    let finalUri = destFile.uri;
                    try {
                      const { sound } = await Audio.Sound.createAsync({ uri: destFile.uri });
                      const status = await sound.getStatusAsync();
                      await sound.unloadAsync();
                      if (status.isLoaded && status.durationMillis && status.durationMillis > 59000) {
                        finalUri = await trimToMaxDuration(destFile.uri, status.durationMillis);
                      }
                    } catch {}
                    setAttachment("video", finalUri);
                    startVideoUpload(finalUri);
                    videoDownloaded = true;
                  }
                }
              }
            } catch (vidErr) {
              Sentry.addBreadcrumb({
                category: "share-intent",
                message: "Failed to download OG video",
                data: { video: meta.video, error: String(vidErr) },
                level: "warning",
              });
            }
          }

          if (!videoDownloaded) {
            const imagesToDownload = meta.images?.length > 0
              ? meta.images.slice(0, 10)
              : meta.image
                ? [meta.image]
                : [];
            if (imagesToDownload.length > 0) {
              for (let i = 0; i < imagesToDownload.length; i++) {
                try {
                  const imgUrl = imagesToDownload[i];
                  const ext = imgUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] ?? "jpg";
                  const destFile = new ExpoFile(Paths.cache, `shared_link_image_${Date.now()}_${i}.${ext}`);
                  const response = await fetch(imgUrl);
                  if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    if (arrayBuffer.byteLength > 500) {
                      destFile.write(new Uint8Array(arrayBuffer));
                      setAttachment("image", destFile.uri);
                    }
                  }
                } catch (imgErr) {
                  Sentry.addBreadcrumb({
                    category: "share-intent",
                    message: "Failed to download OG image",
                    data: { image: imagesToDownload[i], error: String(imgErr) },
                    level: "warning",
                  });
                }
              }
            }
          }

          if (!videoDownloaded && meta.video) {
            const currentBody = useDraftStore.getState().draft.body;
            const link = shareIntent.webUrl!;
            const newBody = currentBody ? `${currentBody}\n\n${link}` : link;
            updateDraft({ body: newBody });
          }

          if (meta.externalUrl) {
            updateDraft({ linkUrl: meta.externalUrl });
          }
        }).catch((err: any) => {
          updateDraft({ body: shareIntent.webUrl! });
          Sentry.captureException(err, { tags: { feature: "share-intent-meta" } });
        }).finally(() => {
          setIsProcessingShareLink(false);
        });
      }
      if (shareIntent.files?.length) {
        const file = shareIntent.files[0];
        if (file.mimeType?.startsWith("image/")) {
          setAttachment("image", file.path);
        } else if (file.mimeType?.startsWith("video/")) {
          setAttachment("video", file.path);
          startVideoUpload(file.path);
        }
      }
      resetShareIntent();
    }, 50);
  }, [hasShareIntent, shareIntent]);

  // Handle video returned from editor
  useEffect(() => {
    if (!params.videoUri) return;
    if (_handledVideoParam === params.videoUri) return;

    _handledVideoParam = params.videoUri;
    const oldUri = params.replacingUri || null;
    const origUri = params.originalVideoUri ?? params.videoUri;
    const w = params.videoWidth ? parseInt(params.videoWidth) : 1920;
    const h = params.videoHeight ? parseInt(params.videoHeight) : 1080;
    const ts = params.trimStart ? parseInt(params.trimStart) : 0;
    const te = params.trimEnd ? parseInt(params.trimEnd) : 0;
    VIDEO_META.set(params.videoUri, { originalUri: origUri, width: w, height: h, trimStart: ts, trimEnd: te });

    if (oldUri && oldUri !== params.videoUri) {
      const { replaceMediaUri } = useDraftStore.getState();
      replaceMediaUri(oldUri, params.videoUri);
      VIDEO_UPLOADS.delete(oldUri);
      setVideoUploadState((prev) => { const next = { ...prev }; delete next[oldUri]; return next; });
      VIDEO_META.delete(oldUri);
    } else {
      setAttachment("video", params.videoUri);
    }
    setIsVideoMuted(params.isMuted === "1");
    setIsPreparingVideo(false);
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
    if (!canPost || isSubmitting) return;
    if (txProgress.isVisible && txProgress.progress.phase !== "error") return;

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
          const uploads = await Promise.all(
            draft.mediaUris.map((uri) => uploadImageAndGetUrl(uri))
          );
          mediaUrls.push(...uploads);
        } catch (error) {
          Sentry.addBreadcrumb({ category: "image-upload", message: "Image upload failed", data: { error: String(error) }, level: "error" });
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
        for (const [uri, entry] of VIDEO_UPLOADS) {
          if (entry.url) {
            mediaUrls.push(entry.url);
          }
        }
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

      let result;
      if (isEditMode) {
        const editInput: EditPostInput = {
          postId: editPostId,
          topic,
          title: draft.title.trim(),
          content: content,
          tag: selectedContentWarning,
          media: mediaUrls.length > 0 ? mediaUrls : undefined,
        };
        result = await editMutation.mutateAsync(editInput);
      } else {
        const postInput: CreatePostMutationInput = {
          topic,
          title: draft.title.trim(),
          content: content,
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
        const updatePostInCache = (post: any) => {
          if (post?.post_id !== editPostId) return post;
          return {
            ...post,
            title: draft.title.trim(),
            content,
            tag: selectedContentWarning || post.tag,
            topic: topic || post.topic,
            media: mediaUrls.length > 0 ? mediaUrls : post.media,
            edited_at: nowSeconds,
          };
        };
        const applyToData = (data: any) => {
          if (!data) return data;
          if (data.pages && Array.isArray(data.pages)) {
            return {
              ...data,
              pages: data.pages.map((page: any) => ({
                ...page,
                posts: page.posts.map(updatePostInCache),
              })),
            };
          }
          if (data.posts && Array.isArray(data.posts)) {
            return { ...data, posts: data.posts.map(updatePostInCache) };
          }
          return data;
        };
        queryClient.getQueriesData({ queryKey: ["posts"] }).forEach(([key]) => {
          queryClient.setQueryData(key, (old: any) => applyToData(old));
        });
        queryClient.getQueriesData({ queryKey: ["user", "posts"] }).forEach(([key]) => {
          queryClient.setQueryData(key, (old: any) => applyToData(old));
        });
        queryClient.getQueriesData<any>({ queryKey: ["comments"] }).forEach(([key, data]) => {
          if (data?.root?.post_id === editPostId) {
            queryClient.setQueryData(key, {
              ...data,
              root: {
                ...data.root,
                title: draft.title.trim(),
                content,
                tag: selectedContentWarning || data.root.tag,
                topic: topic || data.root.topic,
                media: mediaUrls.length > 0 ? mediaUrls : data.root.media,
                edited_at: nowSeconds,
              },
            });
          }
        });

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

        markEditJustCompleted();
        setTimeout(() => {
          txProgress.hideModal();
          router.back();
        }, 500);
      } else {
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
          useHomePostCardStore.getState().setSkipNextRefresh(true);
          router.replace("/(tabs)/");
        }, 1000);
      }
    } catch (error) {
      setIsSubmitting(false);

      const serverError = (error as any)?.response?.data?.error;
      const fallback = isEditMode ? "Failed to edit post" : "Failed to create post";
      const errorMessage = serverError || (error instanceof Error ? error.message : fallback);
      txProgress.setError(errorMessage);
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
    isVideoMuted,
    router,
    txProgress,
    queryClient,
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
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Automatic,
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
    } catch (err) {
      setIsPreparingVideo(false);
      console.warn("[CreateScreen] Video picker failed:", err);
      toast.error("Couldn't load video", "Try a different video or re-download it from iCloud");
    }
  }, [hasAttachment, draft.attachmentType, draft.mediaUris.length, toast]);

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

  const TAB_BAR_HEIGHT = isEditMode ? 0 : 60;

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

                {!editExpired && (
                  <Pressable
                    onPress={() => handleRemoveVideo(uri)}
                    style={styles.videoRemoveButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <View style={styles.removeButtonInner}>
                      <Feather name="x" size={18} color="#fff" />
                    </View>
                  </Pressable>
                )}
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
      {isProcessingShareLink && (
        <View style={styles.shareLinkOverlay}>
          <BlurView
            intensity={50}
            tint={isDark ? "dark" : "light"}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View
            style={[
              styles.shareLinkOverlayContent,
              {
                backgroundColor: isDark
                  ? "rgba(25, 25, 25, 0.98)"
                  : "rgba(255, 255, 255, 0.98)",
              },
            ]}
          >
            <ActivityIndicator size="large" color={isDark ? "#fff" : theme.colors.brand[500]} />
            <Text size="lg" weight="bold" style={styles.shareLinkOverlayTitle}>Extracting Content</Text>
            <Text size="sm" style={styles.shareLinkOverlayText}>Fetching media from shared link...</Text>
          </View>
        </View>
      )}
      {isPreparingVideo && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
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
            {isEditMode ? "Save" : "Post"}
          </Button.Text>
        </Button>
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
            {editability.remainingMinutes} min remaining to edit this post
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "android" ? -(TAB_BAR_HEIGHT + 24) : 0}
        style={{ flex: 1 }}
      >
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
            style={[styles.titleInput, { color: theme.colors.text.default }, editExpired && { opacity: 0.5 }]}
            placeholder="Title"
            placeholderTextColor={theme.colors.text.subtle}
            value={draft.title}
            onChangeText={(text) => updateDraft({ title: text })}
            multiline
            maxLength={tierLimits.maxTitleLength}
            returnKeyType="next"
            onSubmitEditing={() => bodyInputRef.current?.focus()}
            blurOnSubmit={false}
            editable={!editExpired}
          />
          <Text
            size="xs"
            style={{
              color: draft.title.length >= tierLimits.maxTitleLength
                ? theme.colors.error[500]
                : theme.colors.text.subtle,
              textAlign: "right",
              marginTop: -8,
              marginBottom: 4,
            }}
          >
            {draft.title.length}/{tierLimits.maxTitleLength}
          </Text>

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
                  multiline
                />
                <Pressable
                  onPress={handleRemoveLink}
                  disabled={editExpired}
                  style={[
                    styles.linkClearButton,
                    { backgroundColor: theme.colors.background.subtle },
                    editExpired && { opacity: 0 },
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

          {showLinkInput && linkUrl && !linkError && (
            <LinkPreviewCard url={linkUrl} />
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
                    {!editExpired && (
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
                    )}
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
                    {!editExpired && (
                      <Pressable
                        onPress={() => setSelectedStickers((prev) => prev.filter((s) => s !== url))}
                        style={[styles.videoRemoveButton, { top: 4, right: 4 }]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <View style={styles.removeButtonInner}>
                          <Feather name="x" size={18} color="#fff" />
                        </View>
                      </Pressable>
                    )}
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          <TextInput
            ref={bodyInputRef}
            style={[styles.bodyInput, { color: theme.colors.text.default }, editExpired && { opacity: 0.5 }]}
            placeholder="body text (optional)"
            placeholderTextColor={theme.colors.text.subtle}
            value={draft.body}
            onChangeText={(text) => updateDraft({ body: text })}
            multiline
            maxLength={tierLimits.maxContentLength}
            textAlignVertical="top"
            selection={bodySelection}
            onSelectionChange={(e) => {
              bodySelectionRef.current = e.nativeEvent.selection;
            }}
            editable={!editExpired}
          />
          {draft.body.length > 0 && (
            <Text
              size="xs"
              style={{
                color: draft.body.length >= tierLimits.maxContentLength
                  ? theme.colors.error[500]
                  : theme.colors.text.subtle,
                textAlign: "right",
                marginTop: -8,
              }}
            >
              {draft.body.length}/{tierLimits.maxContentLength}
            </Text>
          )}
        </ScrollView>

        <Animated.View
          style={[
            styles.mediaBar,
            {
              backgroundColor: theme.colors.background.default,
              paddingBottom: keyboardVisible
                ? (Platform.OS === "android" ? 0 : 8)
                : Platform.OS === "android"
                  ? TAB_BAR_HEIGHT + 24
                  : insets.bottom + TAB_BAR_HEIGHT + 8,
            },
          ]}
        >
          <View style={[styles.mediaBarContent, editExpired && { opacity: 0.4 }]} pointerEvents={editExpired ? "none" : "auto"}>
            <Pressable
              onPress={handleLinkPress}
              disabled={editExpired || (hasAttachment && !showLinkInput)}
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
        onSelect={(urls) => setSelectedStickers(urls.length > 0 ? [urls[urls.length - 1]] : [])}
        selectedStickers={selectedStickers}
        multiSelect={false}
      />

      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title={isEditMode ? "Editing Post" : "Creating Post"}
        description={isEditMode ? "Your edit is being published to the blockchain" : "Your post is being published to the blockchain"}
        onDismiss={() => {
          txProgress.hideModal();
          setIsSubmitting(false);
        }}
        onRetry={() => {
          setIsSubmitting(false);
          handlePost();
        }}
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
    alignItems: "flex-start",
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
  shareLinkOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  shareLinkOverlayContent: {
    width: "100%",
    maxWidth: 340,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 16,
  },
  shareLinkOverlayTitle: {
    textAlign: "center" as const,
    marginBottom: theme.spacing.xs,
  },
  shareLinkOverlayText: {
    textAlign: "center" as const,
    paddingHorizontal: theme.spacing.md,
  },
}));
