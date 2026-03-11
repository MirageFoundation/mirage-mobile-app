import {
  Entypo,
  Feather,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Image } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { ResizeMode, Video } from "expo-av";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  uploadImageAndGetUrl,
  uploadVideoAndGetUrl,
} from "@/src/api/read/hooks/use-upload-media";
import { useAnnotate } from "@/src/api/write";
import { Box, Text } from "@/src/components/ui/primitives";
import { StickerPicker } from "@/src/components/molecules/sticker-picker";
import { CommunitySelectionModal } from "@/src/pages/create/community-selection-modal";
import { consumePendingVideoResult } from "@/src/pages/create/video-editor-screen";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useToast } from "@/src/providers/toast-provider";
import type { Community } from "@/src/stores/draft-store";
import {
  usePowQueueStore,
  generateActionId,
  getActionLabel,
} from "@/src/services/pow-queue";

const CONTENT_WARNING_OPTIONS: { value: string; label: string }[] = [
  { value: "sensitive", label: "Sensitive" },
  { value: "porn", label: "Porn" },
  { value: "violence", label: "Violence" },
  { value: "gore", label: "Gore" },
  { value: "death", label: "Death" },
];

type MediaType = "image" | "sticker" | "video" | null;

type VideoUploadEntry = { url: string | null; uploading: boolean; progress: number; error: string | null };
const VIDEO_UPLOADS = new Map<string, VideoUploadEntry>();

const formatCount = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

export function AnnotateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const toast = useToast();
  const params = useLocalSearchParams<{
    postId: string;
    postTitle?: string;
    postTopic?: string;
    postContent?: string;
    postTag?: string;
    postLikes?: string;
    postComments?: string;
    postThumbnail?: string;
  }>();

  const postId = params.postId ?? "";
  const originalTitle = params.postTitle ?? "";
  const originalTopic = params.postTopic ?? "";
  const postLikes = parseInt(params.postLikes ?? "0", 10);
  const postComments = parseInt(params.postComments ?? "0", 10);
  const postThumbnail = params.postThumbnail ?? "";

  const [title, setTitle] = useState("");
  const [titleEnabled, setTitleEnabled] = useState(false);
  const [content, setContent] = useState("");
  const [contentEnabled, setContentEnabled] = useState(false);

  const [topicEnabled, setTopicEnabled] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(
    null,
  );
  const [showCommunityModal, setShowCommunityModal] = useState(false);

  const [tagEnabled, setTagEnabled] = useState(false);
  const [selectedTag, setSelectedTag] = useState("");
  const [showTagModal, setShowTagModal] = useState(false);

  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [mediaType, setMediaType] = useState<MediaType>(null);
  const [mediaUris, setMediaUris] = useState<string[]>([]);
  const [selectedStickers, setSelectedStickers] = useState<string[]>([]);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const [appendix, setAppendix] = useState("");

  const [isPreparingVideo, setIsPreparingVideo] = useState(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const [videoUploadState, setVideoUploadState] = useState<
    Record<string, { progress: number; uploading: boolean; done: boolean; error: string | null }>
  >({});
  const videoUploadStateRef = useRef(setVideoUploadState);
  videoUploadStateRef.current = setVideoUploadState;
  const videoUploadToastShownRef = useRef(false);

  const annotateMutation = useAnnotate();
  const enqueue = usePowQueueStore((state) => state.enqueue);

  useEffect(() => {
    Network.getNetworkStateAsync().then((state) => {
      setIsNetworkOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    const sub = Network.addNetworkStateListener((event) => {
      setIsNetworkOnline(event.isConnected === true && event.isInternetReachable !== false);
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const result = consumePendingVideoResult();
      if (result) {
        const oldUri = result.replacingUri || null;
        setMediaEnabled(true);
        setMediaType("video");

        if (oldUri && oldUri !== result.videoUri) {
          VIDEO_UPLOADS.delete(oldUri);
          setVideoUploadState((prev) => { const next = { ...prev }; delete next[oldUri]; return next; });
          setMediaUris((prev) => prev.map((u) => (u === oldUri ? result.videoUri : u)));
        } else {
          setMediaUris((prev) => [...prev, result.videoUri].slice(0, 10));
        }

        startVideoUpload(result.videoUri);
      }
      setIsPreparingVideo(false);
    }, [startVideoUpload])
  );

  const isUploadingVideo = useMemo(() => {
    return Object.values(videoUploadState).some((v) => v.uploading);
  }, [videoUploadState]);

  const failedVideoUploads = useMemo(() => {
    return Object.entries(videoUploadState)
      .filter(([, v]) => v.error)
      .map(([uri, v]) => ({ uri, error: v.error! }));
  }, [videoUploadState]);

  const hasFailedUploads = failedVideoUploads.length > 0;

  const startVideoUpload = useCallback((uri: string, silent = false) => {
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
        videoUploadToastShownRef.current = false;
        triggerHaptic("success");
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Upload failed";
        VIDEO_UPLOADS.set(uri, { url: null, uploading: false, progress: 0, error: msg });
        videoUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { progress: 0, uploading: false, done: false, error: msg },
        }));
        if (!silent && !videoUploadToastShownRef.current) {
          videoUploadToastShownRef.current = true;
          toast.error("Video upload failed", msg);
        }
        triggerHaptic("error");
      });
  }, [toast]);

  useEffect(() => {
    if (!hasFailedUploads) return;
    let retryScheduled = false;
    const sub = Network.addNetworkStateListener((event) => {
      if (retryScheduled) return;
      if (event.isConnected && event.isInternetReachable !== false) {
        retryScheduled = true;
        setTimeout(() => {
          const toRetry = [...VIDEO_UPLOADS.entries()]
            .filter(([, e]) => !!e.error)
            .map(([uri]) => uri);
          toRetry.forEach((uri) => startVideoUpload(uri, true));
        }, 1500);
      }
    });
    Network.getNetworkStateAsync().then((state) => {
      if (retryScheduled) return;
      if (state.isConnected && state.isInternetReachable !== false) {
        retryScheduled = true;
        setTimeout(() => {
          const toRetry = [...VIDEO_UPLOADS.entries()]
            .filter(([, e]) => !!e.error)
            .map(([uri]) => uri);
          toRetry.forEach((uri) => startVideoUpload(uri, true));
        }, 3000);
      }
    });
    return () => sub.remove();
  }, [hasFailedUploads, startVideoUpload]);

  const hasMediaContent =
    mediaEnabled && (mediaUris.length > 0 || selectedStickers.length > 0);

  const hasChanges = useMemo(() => {
    const titleValid = titleEnabled && title.trim().length > 0;
    const contentValid = contentEnabled && content.trim().length > 0;
    const topicValid = topicEnabled && selectedCommunity !== null;
    const tagValid = tagEnabled && selectedTag.length > 0;
    const appendixValid = appendix.trim().length > 0;
    const videoStillUploading = mediaType === "video" && isUploadingVideo;
    return (
      (titleValid ||
        contentValid ||
        topicValid ||
        tagValid ||
        hasMediaContent ||
        appendixValid) &&
      !videoStillUploading
    );
  }, [
    titleEnabled,
    title,
    contentEnabled,
    content,
    topicEnabled,
    selectedCommunity,
    tagEnabled,
    selectedTag,
    mediaEnabled,
    hasMediaContent,
    appendix,
    mediaType,
    isUploadingVideo,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!postId || !hasChanges) return;
    triggerHaptic("medium");

    let resolvedMedia: string[] | undefined;
    if (mediaEnabled) {
      if (selectedStickers.length > 0) {
        resolvedMedia = selectedStickers;
      } else if (mediaUris.length > 0) {
        resolvedMedia = [];
        for (const uri of mediaUris) {
          if (uri.startsWith("https://")) {
            resolvedMedia.push(uri);
          } else {
            const cachedUpload = VIDEO_UPLOADS.get(uri);
            if (cachedUpload?.url) {
              resolvedMedia.push(cachedUpload.url);
            } else if (mediaType === "video") {
              toast.error("Video not ready", "Please wait for the video to finish uploading.");
              return;
            } else {
              const uploaded = await uploadImageAndGetUrl(uri);
              resolvedMedia.push(uploaded);
            }
          }
        }
      }
    }

    const input = {
      override: postId,
      title: titleEnabled && title.trim() ? title : undefined,
      content: contentEnabled && content.trim() ? content : undefined,
      topic:
        topicEnabled && selectedCommunity ? selectedCommunity.name : undefined,
      tag: tagEnabled && selectedTag ? selectedTag : undefined,
      media:
        resolvedMedia && resolvedMedia.length > 0 ? resolvedMedia : undefined,
      appendix: appendix.trim() || undefined,
    };

    const actionId = generateActionId();
    enqueue({
      id: actionId,
      type: "annotate",
      label: getActionLabel("annotate"),
      execute: async () => {
        return annotateMutation.mutateAsync(input);
      },
      onSuccess: () => {
        toast.success("Annotation applied", "Your overlay has been published.");
      },
      onError: () => {
        toast.error(
          "Annotation failed",
          "Something went wrong. Please try again.",
        );
      },
    });

    VIDEO_UPLOADS.clear();
    setVideoUploadState({});
    router.back();
  }, [
    postId,
    hasChanges,
    titleEnabled,
    title,
    contentEnabled,
    content,
    topicEnabled,
    selectedCommunity,
    tagEnabled,
    selectedTag,
    mediaEnabled,
    mediaType,
    mediaUris,
    selectedStickers,
    appendix,
    enqueue,
    annotateMutation,
    toast,
    router,
  ]);

  const handleBack = useCallback(() => {
    VIDEO_UPLOADS.clear();
    setVideoUploadState({});
    router.back();
  }, [router]);

  const handleCommunitySelect = useCallback((community: Community) => {
    setSelectedCommunity(community);
    setShowCommunityModal(false);
    triggerHaptic("selection");
  }, []);

  const handleSelectTag = useCallback((tag: string) => {
    triggerHaptic("selection");
    setSelectedTag(tag);
    setShowTagModal(false);
  }, []);

  const handleImagePress = useCallback(async () => {
    if (mediaType && mediaType !== "image") return;
    triggerHaptic("selection");

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: 10 - mediaUris.length,
      });

      if (!result.canceled && result.assets.length > 0) {
        setMediaType("image");
        setMediaUris((prev) =>
          [...prev, ...result.assets.map((a) => a.uri)].slice(0, 10),
        );
      }
    } catch {
      toast.error("Failed to pick image", "Please try again.");
    }
  }, [mediaType, mediaUris.length, toast]);

  const handleVideoPress = useCallback(async () => {
    if (mediaType && mediaType !== "video") return;
    triggerHaptic("selection");

    try {
      const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permResult.granted) {
        toast.error(
          "Permission required",
          "Please allow access to your photo library",
        );
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
        const asset = result.assets[0];
        setTimeout(() => {
          router.push({
            pathname: "/video-editor",
            params: {
              uri: asset.uri,
              width: asset.width?.toString() ?? "1920",
              height: asset.height?.toString() ?? "1080",
              returnTo: "/annotate",
            },
          });
        }, 100);
      }
    } catch (err) {
      setIsPreparingVideo(false);
      console.warn("[AnnotateScreen] Video picker failed:", err);
      toast.error("Couldn't load video", "Try a different video or re-download it from iCloud");
    }
  }, [mediaType, toast, startVideoUpload]);

  const handleStickerPress = useCallback(() => {
    if (mediaType && mediaType !== "sticker") return;
    triggerHaptic("selection");
    setShowStickerPicker(true);
  }, [mediaType]);

  const handleRemoveMedia = useCallback((uri: string) => {
    triggerHaptic("selection");
    setMediaUris((prev) => {
      const next = prev.filter((u) => u !== uri);
      if (next.length === 0) setMediaType(null);
      return next;
    });
  }, []);

  const handleRemoveVideo = useCallback((uri: string) => {
    triggerHaptic("selection");
    VIDEO_UPLOADS.delete(uri);
    setVideoUploadState((prev) => { const next = { ...prev }; delete next[uri]; return next; });
    setMediaUris((prev) => {
      const next = prev.filter((u) => u !== uri);
      if (next.length === 0) setMediaType(null);
      return next;
    });
  }, []);

  const handleEditVideo = useCallback((uri: string) => {
    triggerHaptic("selection");
    router.push({
      pathname: "/video-editor",
      params: {
        uri,
        width: "1920",
        height: "1080",
        replacingUri: uri,
        returnTo: "/annotate",
      },
    });
  }, [router]);

  const handleRemoveSticker = useCallback((url: string) => {
    triggerHaptic("selection");
    setSelectedStickers((prev) => {
      const next = prev.filter((s) => s !== url);
      if (next.length === 0) setMediaType(null);
      return next;
    });
  }, []);

  const handleToggleMedia = useCallback(() => {
    const next = !mediaEnabled;
    setMediaEnabled(next);
    if (!next) {
      setMediaType(null);
      setMediaUris([]);
      setSelectedStickers([]);
      VIDEO_UPLOADS.clear();
      setVideoUploadState({});
    }
  }, [mediaEnabled]);

  const VIDEO_HEIGHT = 180;
  const VIDEO_WIDTH = Math.round(VIDEO_HEIGHT * (16 / 9) * 0.6);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background.default }}
      behavior="padding"
    >
      <Box flex background="default">
        {isPreparingVideo && (
          <View style={styles.preparingVideoOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={[styles.headerTitleAbsolute, { paddingTop: insets.top, paddingBottom: theme.spacing.sm }]} pointerEvents="none">
            <Text size="lg" weight="bold">
              Annotate Post
            </Text>
          </View>
          <Pressable onPress={handleBack} style={styles.headerButton}>
            <Ionicons
              name="close"
              size={28}
              color={theme.colors.text.default}
            />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={handleSubmit}
            disabled={!hasChanges}
            style={[
              styles.postButton,
              {
                backgroundColor: hasChanges
                  ? theme.colors.brand[500]
                  : theme.colors.background.subtle,
              },
            ]}
          >
            <Text
              size="sm"
              weight="bold"
              style={{
                color: hasChanges ? "#FFFFFF" : theme.colors.text.subtle,
              }}
            >
              Submit
            </Text>
          </Pressable>
        </View>

        {/* Post summary - stuck to header */}
        <View
          style={[
            styles.postSummary,
            {
              backgroundColor: theme.colors.background.default,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border.subtle,
            },
          ]}
        >
          <View style={styles.postSummaryInfo}>
            <Text
              size="md"
              weight="bold"
              numberOfLines={1}
              style={styles.postSummaryTitle}
            >
              {originalTitle || "Untitled post"}
            </Text>
            <View style={styles.postSummaryStats}>
              <Text size="sm" mode="subtle">
                {formatCount(postLikes)} upvotes
              </Text>
              <Text size="sm" mode="subtle" style={styles.postSummaryDot}>
                •
              </Text>
              <Text size="sm" mode="subtle">
                {formatCount(postComments)} comments
              </Text>
            </View>
          </View>
          {postThumbnail ? (
            <ExpoImage
              source={{ uri: postThumbnail }}
              style={styles.postSummaryThumb}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : null}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Agent info */}
          <View style={[styles.agentBanner, { borderColor: "#EF4444" + "30" }]}>
            <View
              style={[
                styles.agentBannerIcon,
                { backgroundColor: "#EF4444" + "15" },
              ]}
            >
              <Ionicons name="shield-checkmark" size={18} color="#EF4444" />
            </View>
            <View style={styles.agentBannerText}>
              <Text size="sm" weight="semibold">
                Agent Annotation
              </Text>
              <Text size="xs" mode="subtle">
                Your changes overlay this post for users who enabled you.
              </Text>
            </View>
          </View>

          {/* Title */}
          <AnnotateToggle
            label="Title"
            enabled={titleEnabled}
            onToggle={() => setTitleEnabled(!titleEnabled)}
            theme={theme}
          >
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.colors.background.light,
                  borderColor: theme.colors.border.default,
                  color: theme.colors.text.default,
                },
              ]}
              value={title}
              onChangeText={setTitle}
              placeholder="Replacement title..."
              placeholderTextColor={theme.colors.text.subtle}
            />
          </AnnotateToggle>

          {/* Content */}
          <AnnotateToggle
            label="Content"
            enabled={contentEnabled}
            onToggle={() => setContentEnabled(!contentEnabled)}
            theme={theme}
          >
            <TextInput
              style={[
                styles.textInput,
                styles.multilineInput,
                {
                  backgroundColor: theme.colors.background.light,
                  borderColor: theme.colors.border.default,
                  color: theme.colors.text.default,
                },
              ]}
              value={content}
              onChangeText={setContent}
              placeholder="Replacement content..."
              placeholderTextColor={theme.colors.text.subtle}
              multiline
              textAlignVertical="top"
            />
          </AnnotateToggle>

          {/* Topic */}
          <AnnotateToggle
            label="Topic"
            enabled={topicEnabled}
            onToggle={() => setTopicEnabled(!topicEnabled)}
            theme={theme}
          >
            <Pressable
              onPress={() => {
                triggerHaptic("selection");
                setShowCommunityModal(true);
              }}
              style={[
                styles.selectorButton,
                { backgroundColor: theme.colors.background.light },
              ]}
            >
              {selectedCommunity && (
                <Text
                  size="lg"
                  weight="bold"
                  style={{ color: theme.colors.text.default }}
                >
                  #
                </Text>
              )}
              <Text
                size="md"
                weight="semibold"
                style={{ color: theme.colors.text.default }}
              >
                {selectedCommunity?.name?.toLowerCase() ?? "Select a topic"}
              </Text>
              <Box style={{ marginLeft: 8 }}>
                <Entypo
                  name="chevron-up"
                  size={10}
                  color={theme.colors.text.default}
                  style={{ marginBottom: -4 }}
                />
                <Entypo
                  name="chevron-down"
                  size={10}
                  color={theme.colors.text.default}
                />
              </Box>
            </Pressable>
          </AnnotateToggle>

          {topicEnabled && selectedCommunity?.isNewTopic && (
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

          {/* Tag */}
          <AnnotateToggle
            label="Tag"
            enabled={tagEnabled}
            onToggle={() => setTagEnabled(!tagEnabled)}
            theme={theme}
          >
            {selectedTag ? (
              <Pressable
                onPress={() => {
                  triggerHaptic("selection");
                  setShowTagModal(true);
                }}
                style={[
                  styles.selectorButton,
                  { backgroundColor: theme.colors.background.light, gap: theme.spacing.sm },
                ]}
              >
                <Text
                  size="md"
                  weight="bold"
                  style={{ color: theme.colors.warning[500] }}
                >
                  ⚠️{" "}
                  {selectedTag.charAt(0).toUpperCase() + selectedTag.slice(1)}
                </Text>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    triggerHaptic("selection");
                    setSelectedTag("");
                  }}
                  hitSlop={8}
                >
                  <Feather
                    name="x"
                    size={14}
                    color={theme.colors.text.subtle}
                  />
                </Pressable>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  triggerHaptic("selection");
                  setShowTagModal(true);
                }}
                style={[
                  styles.selectorButton,
                  { backgroundColor: theme.colors.background.light },
                ]}
              >
                <Text
                  size="md"
                  weight="semibold"
                  style={{ color: theme.colors.text.default }}
                >
                  Add content warning
                </Text>
              </Pressable>
            )}
          </AnnotateToggle>

          {/* Media */}
          <AnnotateToggle
            label="Media"
            enabled={mediaEnabled}
            onToggle={handleToggleMedia}
            theme={theme}
          >
            {/* Image preview */}
            {mediaType === "image" && mediaUris.length > 0 && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={styles.mediaPreviewScroll}
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {mediaUris.map((uri) => (
                    <View
                      key={uri}
                      style={[
                        styles.mediaThumb,
                        { backgroundColor: theme.colors.background.light },
                      ]}
                    >
                      <Image source={{ uri }} style={styles.mediaThumbImage} />
                      <Pressable
                        onPress={() => handleRemoveMedia(uri)}
                        style={styles.mediaRemoveBtn}
                        hitSlop={10}
                      >
                        <View style={styles.mediaRemoveBtnInner}>
                          <Feather name="x" size={14} color="#fff" />
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </Animated.View>
            )}

            {/* Video preview */}
            {mediaType === "video" && mediaUris.length > 0 && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={styles.videoPreviewContainer}
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {mediaUris.map((uri) => {
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
                          <View style={[styles.uploadedBadge, !isNetworkOnline && { backgroundColor: "rgba(234,179,8,0.85)" }]}>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                              {isNetworkOnline ? "Uploading…" : "Low connectivity…"}
                            </Text>
                          </View>
                        )}

                        {upload && !upload.uploading && upload.done && (
                          <View style={styles.uploadedBadge}>
                            <Feather name="check" size={12} color="#fff" />
                            <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                              Uploaded
                            </Text>
                          </View>
                        )}

                        {upload?.error && (
                          <Pressable
                            onPress={() => startVideoUpload(uri)}
                            style={[styles.uploadedBadge, { backgroundColor: "rgba(220,50,50,0.8)" }]}
                          >
                            <Feather name="refresh-cw" size={12} color="#fff" />
                            <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                              Retry
                            </Text>
                          </Pressable>
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

                  {mediaUris.length < 10 && (
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
            )}

            {selectedStickers.length > 0 && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={styles.mediaPreviewScroll}
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {selectedStickers.map((url) => (
                    <View
                      key={url}
                      style={[
                        styles.mediaThumb,
                        { backgroundColor: theme.colors.background.light },
                      ]}
                    >
                      <Image
                        source={{ uri: url }}
                        style={[
                          styles.mediaThumbImage,
                          { resizeMode: "contain" },
                        ]}
                      />
                      <Pressable
                        onPress={() => handleRemoveSticker(url)}
                        style={styles.mediaRemoveBtn}
                        hitSlop={10}
                      >
                        <View style={styles.mediaRemoveBtnInner}>
                          <Feather name="x" size={14} color="#fff" />
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </Animated.View>
            )}

            {/* Media toolbar */}
            <View style={styles.mediaToolbar}>
              <Pressable
                onPress={handleImagePress}
                disabled={!!mediaType && mediaType !== "image"}
                style={[
                  styles.mediaIconBtn,
                  !!mediaType &&
                    mediaType !== "image" &&
                    styles.mediaIconDisabled,
                ]}
              >
                <Feather
                  name="image"
                  size={22}
                  color={
                    !!mediaType && mediaType !== "image"
                      ? theme.colors.text.subtle
                      : theme.colors.text.default
                  }
                />
                <Text
                  size="xs"
                  style={{
                    color:
                      !!mediaType && mediaType !== "image"
                        ? theme.colors.text.subtle
                        : theme.colors.text.default,
                  }}
                >
                  Image
                </Text>
              </Pressable>

              <Pressable
                onPress={handleVideoPress}
                disabled={!!mediaType && mediaType !== "video"}
                style={[
                  styles.mediaIconBtn,
                  !!mediaType &&
                    mediaType !== "video" &&
                    styles.mediaIconDisabled,
                ]}
              >
                <Feather
                  name="video"
                  size={22}
                  color={
                    !!mediaType && mediaType !== "video"
                      ? theme.colors.text.subtle
                      : theme.colors.text.default
                  }
                />
                <Text
                  size="xs"
                  style={{
                    color:
                      !!mediaType && mediaType !== "video"
                        ? theme.colors.text.subtle
                        : theme.colors.text.default,
                  }}
                >
                  Video
                </Text>
              </Pressable>

              <Pressable
                onPress={handleStickerPress}
                disabled={!!mediaType && mediaType !== "sticker"}
                style={[
                  styles.mediaIconBtn,
                  !!mediaType &&
                    mediaType !== "sticker" &&
                    styles.mediaIconDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="sticker-emoji"
                  size={22}
                  color={
                    !!mediaType && mediaType !== "sticker"
                      ? theme.colors.text.subtle
                      : theme.colors.text.default
                  }
                />
                <Text
                  size="xs"
                  style={{
                    color:
                      !!mediaType && mediaType !== "sticker"
                        ? theme.colors.text.subtle
                        : theme.colors.text.default,
                  }}
                >
                  Sticker
                </Text>
              </Pressable>
            </View>
          </AnnotateToggle>

          {/* Appendix */}
          <View style={styles.section}>
            <Text size="md" weight="semibold">
              Appendix
            </Text>
            <Text size="xs" mode="subtle">
              Added below the post. All agent appendices stack.
            </Text>
            <TextInput
              style={[
                styles.textInput,
                styles.multilineInput,
                {
                  backgroundColor: theme.colors.background.light,
                  borderColor: theme.colors.border.default,
                  color: theme.colors.text.default,
                },
              ]}
              value={appendix}
              onChangeText={setAppendix}
              placeholder="Add context, corrections, or notes..."
              placeholderTextColor={theme.colors.text.subtle}
              multiline
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

      </Box>

      <CommunitySelectionModal
        visible={showCommunityModal}
        onClose={() => setShowCommunityModal(false)}
        onSelect={handleCommunitySelect}
        selectedCommunity={selectedCommunity ?? undefined}
      />

      <Modal
        visible={showTagModal}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setShowTagModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowTagModal(false)}
        >
          <Pressable
            style={[
              styles.tagModalContent,
              { backgroundColor: theme.colors.background.base },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.tagModalHeader}>
              <Text size="lg" weight="bold">
                Add content warning
              </Text>
              <Pressable onPress={() => setShowTagModal(false)} hitSlop={8}>
                <Feather name="x" size={20} color={theme.colors.text.subtle} />
              </Pressable>
            </View>
            <View style={styles.tagOptions}>
              {CONTENT_WARNING_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelectTag(option.value)}
                  style={styles.tagOption}
                >
                  <Text size="md" style={{ color: theme.colors.text.default }}>
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.tagRadio,
                      {
                        borderColor:
                          selectedTag === option.value
                            ? theme.colors.brand[500]
                            : theme.colors.border.default,
                        backgroundColor:
                          selectedTag === option.value
                            ? theme.colors.brand[500]
                            : "transparent",
                      },
                    ]}
                  >
                    {selectedTag === option.value && (
                      <Feather name="check" size={12} color="#fff" />
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
            {selectedTag ? (
              <Pressable
                onPress={() => {
                  setSelectedTag("");
                  setShowTagModal(false);
                }}
                style={styles.clearTagButton}
              >
                <Text size="sm" style={{ color: theme.colors.error[500] }}>
                  Remove warning
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <StickerPicker
        visible={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        onSelect={(urls) => {
          if (urls.length > 0) {
            setMediaType("sticker");
            setSelectedStickers([urls[urls.length - 1]]);
          } else {
            setSelectedStickers([]);
            setMediaType(null);
          }
        }}
        selectedStickers={selectedStickers}
        multiSelect={false}
      />
    </KeyboardAvoidingView>
  );
}

function AnnotateToggle({
  label,
  enabled,
  onToggle,
  theme,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  theme: any;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable onPress={onToggle} style={styles.fieldToggle}>
        <Ionicons
          name={enabled ? "checkbox" : "square-outline"}
          size={20}
          color={enabled ? "#EF4444" : theme.colors.text.subtle}
        />
        <Text size="md" weight="semibold" style={styles.fieldLabel}>
          Override {label}
        </Text>
      </Pressable>
      {enabled && children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleAbsolute: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  postButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  postSummary: {
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "hidden",
  },
  postSummaryInfo: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    justifyContent: "center",
  },
  postSummaryTitle: {
    lineHeight: 18,
  },
  postSummaryStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  postSummaryDot: {
    marginHorizontal: theme.spacing.xs,
  },
  postSummaryThumb: {
    width: 70,
    height: "100%",
    minHeight: 48,
    marginLeft: theme.spacing.sm,
  },
  agentBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  agentBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  agentBannerText: {
    flex: 1,
    gap: 2,
  },
  section: {
    gap: theme.spacing.xs,
  },
  fieldToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  fieldLabel: {
    flex: 1,
  },
  textInput: {
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 100,
  },
  selectorButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: 0,
    borderRadius: theme.radius.md,
  },
  newTopicWarning: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    marginTop: -theme.spacing.sm,
  },
  mediaToolbar: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginLeft: -theme.spacing.sm,
  },
  mediaIconBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    gap: 2,
  },
  mediaIconDisabled: {
    opacity: 0.3,
  },
  mediaPreviewScroll: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  mediaThumb: {
    width: 120,
    height: 120,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    position: "relative",
  },
  mediaThumbImage: {
    width: "100%",
    height: "100%",
  },
  mediaRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  mediaRemoveBtnInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  preparingVideoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  videoPreviewContainer: {
    marginTop: 4,
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
  videoRemoveButton: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  removeButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  tagModalContent: {
    width: "100%",
    maxWidth: 340,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
  },
  tagModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  tagOptions: {
    gap: theme.spacing.xs,
  },
  tagOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  tagRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  clearTagButton: {
    alignItems: "center",
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
}));
