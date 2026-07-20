import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import {
  uploadImageAndGetUrl,
  uploadVideoAndGetUrl,
} from "@/src/api/read/hooks/use-upload-media";
import * as Sentry from "@sentry/react-native";
import { getApiErrorMessage } from "@/src/utils/parse-api-error";
import { useAnnotate } from "@/src/api/write";
import { Box, Text } from "@/src/components/ui/primitives";
import { StaticVideoPreview } from "@/src/components/molecules/static-video-preview";
import { StickerPicker } from "@/src/components/molecules/sticker-picker";
import { CommunitySelectionModal } from "@/src/components/molecules/community-selection-modal";
import { consumePendingVideoResult } from "@/src/stores/video-editor-result-store";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useToast } from "@/src/providers/toast-provider";
import type { Community } from "@/src/stores/draft-store";
import {
  usePowQueueStore,
  generateActionId,
  getActionLabel,
} from "@/src/services/pow-queue";
import { AnnotateAgentBanner } from "./annotate-agent-banner";
import { AnnotateAppendixSection } from "./annotate-appendix-section";
import { AnnotateContentWarningModal } from "./annotate-content-warning-modal";
import { AnnotateHeader } from "./annotate-header";
import { AnnotatePostSummary } from "./annotate-post-summary";
import { styles } from "./annotate-styles";
import { AnnotateTextOverrideSection } from "./annotate-text-override-section";
import { AnnotateTopicTagSection } from "./annotate-topic-tag-section";
import { AnnotateToggle } from "./annotate-toggle";

type MediaType = "image" | "sticker" | "video" | null;

type VideoUploadEntry = { url: string | null; uploading: boolean; progress: number; error: string | null; isServerError?: boolean };
const VIDEO_UPLOADS = new Map<string, VideoUploadEntry>();

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
        const msg = err?.response?.data?.error_code ? getApiErrorMessage(err) : (err instanceof Error ? err.message : "Upload failed");
        Sentry.captureException(err, { tags: { feature: "annotate", operation: "video-upload" } });
        const isServerError = !!err?.response?.status && err.response.status >= 400;
        VIDEO_UPLOADS.set(uri, { url: null, uploading: false, progress: 0, error: msg, isServerError });
        videoUploadStateRef.current((prev) => ({
          ...prev,
          [uri]: { progress: 0, uploading: false, done: false, error: msg },
        }));
        if (!silent && !videoUploadToastShownRef.current) {
          videoUploadToastShownRef.current = true;
          const serverError = err?.response?.data?.error;
          const status = err?.response?.status;
          const title = serverError ? `${serverError} (${status})` : "Video upload failed";
          toast.error(title, serverError ? "Please try again" : msg);
        }
        triggerHaptic("error");
      });
  }, [toast]);

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

  useEffect(() => {
    if (!hasFailedUploads) return;
    let retryScheduled = false;
    const sub = Network.addNetworkStateListener((event) => {
      if (retryScheduled) return;
      if (event.isConnected && event.isInternetReachable !== false) {
        retryScheduled = true;
        setTimeout(() => {
          const toRetry = [...VIDEO_UPLOADS.entries()]
            .filter(([, e]) => !!e.error && !e.isServerError)
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
            .filter(([, e]) => !!e.error && !e.isServerError)
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
      Sentry.captureException(err, { tags: { feature: "annotate", operation: "video-picker" } });
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
      <Box flex background="base">
        {isPreparingVideo && (
          <View style={styles.preparingVideoOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        <AnnotateHeader
          canSubmit={hasChanges}
          topInset={insets.top}
          onBack={handleBack}
          onSubmit={handleSubmit}
        />

        <AnnotatePostSummary
          comments={postComments}
          likes={postLikes}
          thumbnail={postThumbnail}
          title={originalTitle}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AnnotateAgentBanner />

          <AnnotateTextOverrideSection
            label="Title"
            enabled={titleEnabled}
            onToggle={() => setTitleEnabled(!titleEnabled)}
            value={title}
            onChange={setTitle}
            placeholder="Replacement title..."
          />

          <AnnotateTextOverrideSection
            label="Content"
            enabled={contentEnabled}
            onToggle={() => setContentEnabled(!contentEnabled)}
            value={content}
            onChange={setContent}
            placeholder="Replacement content..."
            multiline
          />

          <AnnotateTopicTagSection
            selectedCommunity={selectedCommunity}
            selectedTag={selectedTag}
            tagEnabled={tagEnabled}
            topicEnabled={topicEnabled}
            onClearTag={() => setSelectedTag("")}
            onOpenCommunity={() => {
              triggerHaptic("selection");
              setShowCommunityModal(true);
            }}
            onOpenTag={() => {
              triggerHaptic("selection");
              setShowTagModal(true);
            }}
            onToggleTag={() => setTagEnabled(!tagEnabled)}
            onToggleTopic={() => setTopicEnabled(!topicEnabled)}
          />

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
                          <StaticVideoPreview
                            uri={uri}
                            style={[styles.videoPlayer, { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }]}
                          />
                        </View>

                        <View style={styles.mediaTypeBadge}>
                          <Feather name="video" size={12} color="#fff" />
                        </View>

                        {upload?.uploading && (
                          <View style={[styles.uploadedBadge, !isNetworkOnline && { backgroundColor: "rgba(234,179,8,0.85)" }]}>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text size="xs" weight="medium" style={{ color: "#fff", marginLeft: 4 }}>
                              {!isNetworkOnline
                                ? "Low connectivity…"
                                : upload.progress >= 98
                                  ? "Processing…"
                                  : "Uploading…"}
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
                          backgroundColor: theme.colors.background.subtle,
                          borderColor: theme.colors.border.default,
                          borderStyle: "dashed",
                        },
                      ]}
                    >
                      <Feather name="plus" size={32} color={theme.colors.text.subtle} />
                      <Text size="xs" style={{ color: theme.colors.text.subtle, marginTop: 4 }}>
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

          <AnnotateAppendixSection
            appendix={appendix}
            onChangeAppendix={setAppendix}
          />
        </ScrollView>

      </Box>

      <CommunitySelectionModal
        visible={showCommunityModal}
        onClose={() => setShowCommunityModal(false)}
        onSelect={handleCommunitySelect}
        selectedCommunity={selectedCommunity ?? undefined}
      />

      <AnnotateContentWarningModal
        selectedTag={selectedTag}
        visible={showTagModal}
        onClear={() => {
          setSelectedTag("");
          setShowTagModal(false);
        }}
        onClose={() => setShowTagModal(false)}
        onSelect={handleSelectTag}
      />

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
