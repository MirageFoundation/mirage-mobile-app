import { useFocusEffect } from "@react-navigation/native";
import * as Sentry from "@sentry/react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { router } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Network from "expo-network";
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { consumePendingVideoResult } from "@/src/stores/video-editor-result-store";
import { Box } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useToast } from "@/src/providers/toast-provider";
import { useDraftStore } from "@/src/stores/draft-store";
import { useUserLevel, useAuthStore } from "@/src/stores/auth-store";
import { useUIStore } from "@/src/stores";
import { getTierPostLimits, canEditContent } from "@/src/utils/tiers";

import { useMentionSearch } from "@/src/hooks/use-mention-search";
import { useCreateComposeState } from "./create-compose-state";
import { CreateBodyInput } from "./create-body-input";
import { CreateComposeAccessories } from "./create-compose-accessories";
import { CreateContentWarningButton } from "./create-content-warning-button";
import { CreateCommunitySelector } from "./create-community-selector";
import { CreateEditabilityBanner } from "./create-editability-banner";
import { CreateHeader } from "./create-header";
import { CreateImagePreviewCarousel } from "./create-image-preview-carousel";
import { CreateLinkInput } from "./create-link-input";
import { CreatePreparingOverlay, CreateShareProcessingOverlay } from "./create-overlays";
import { CreateScreenModals } from "./create-screen-modals";
import { CreateStickerPreview } from "./create-sticker-preview";
import { CreateTitleInput } from "./create-title-input";
import { CreateUploadWarning } from "./create-upload-warning";
import { VideoPreviewCarousel } from "./video-preview-carousel";
import {
  VIDEO_META,
  VIDEO_UPLOADS,
  getHandledVideoParam,
  setHandledVideoParam,
} from "./create-upload-state";
import { styles } from "./create-screen-styles";
import { useCreateEditInitialization } from "./use-create-edit-initialization";
import { useCreateMediaUploads } from "./use-create-media-uploads";
import { useCreateShareIntent } from "./use-create-share-intent";
import { useCreateSubmitFlow } from "./use-create-submit-flow";

export function CreateScreen() {
  const insets = useSafeAreaInsets();
  const userLevel = useUserLevel();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
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
  const linkUrlInputRef = useRef<TextInput>(null);

  const showLinkInput = useCreateComposeState((state) => state.showLinkInput);
  const selectedContentWarning = useCreateComposeState(
    (state) => state.selectedContentWarning,
  );
  const selectedStickers = useCreateComposeState((state) => state.selectedStickers);
  const openLinkInput = useCreateComposeState((state) => state.openLinkInput);
  const setLinkUrl = useCreateComposeState((state) => state.setLinkUrl);
  const setSelectedContentWarning = useCreateComposeState(
    (state) => state.setSelectedContentWarning,
  );
  const setSelectedStickers = useCreateComposeState((state) => state.setSelectedStickers);
  const resetComposeState = useCreateComposeState((state) => state.resetComposeState);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isProcessingShareLink, setIsProcessingShareLink] = useState(false);
  const [isPreparingImages, setIsPreparingImages] = useState(false);
  const [isPreparingVideo, setIsPreparingVideo] = useState(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState(true);
  const navigatedToEditorRef = useRef(false);
  const mention = useMentionSearch();
  const toast = useToast();

  const {
    getUploadedImageUrls,
    imageUploadsReady,
    imageUploadState,
    isUploadingImage,
    isUploadingVideo,
    resetImageUploads,
    resetVideoUploads,
    setImageUploadState,
    setVideoUploadState,
    startImageUpload,
    startVideoUpload,
    videoUploadControllersRef,
    videoUploadsReady,
    videoUploadState,
  } = useCreateMediaUploads();

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
      if (navigatedToEditorRef.current) {
        navigatedToEditorRef.current = false;
        setIsPreparingVideo(false);
      }
    }, [])
  );

  const canPost = useMemo(() => {
    const hasTitleContent = draft.title.trim().length > 0;
    const hasCommunity = draft.community !== null;
    const videoStillUploading =
      draft.attachmentType === "video" && isUploadingVideo;
    const videoUploadBroken =
      draft.attachmentType === "video" &&
      draft.mediaUris.length > 0 &&
      !videoUploadsReady;
    const imageStillUploading =
      draft.attachmentType === "image" && isUploadingImage;
    const imageUploadBroken =
      draft.attachmentType === "image" &&
      draft.mediaUris.length > 0 &&
      !imageUploadsReady;
    const editBlocked = isEditMode && editability && !editability.allowed;
    return (
      hasTitleContent &&
      hasCommunity &&
      !videoStillUploading &&
      !videoUploadBroken &&
      !imageStillUploading &&
      !imageUploadBroken &&
      !editBlocked
    );
  }, [
    draft.title,
    draft.community,
    draft.attachmentType,
    draft.mediaUris.length,
    isUploadingVideo,
    videoUploadsReady,
    isUploadingImage,
    imageUploadsReady,
    isEditMode,
    editability,
  ]);

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
      openLinkInput();
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

  useCreateEditInitialization({
    isEditMode,
    params,
    clearDraft,
    updateDraft,
    setSelectedContentWarning,
    setSelectedStickers,
  });

  useCreateShareIntent({
    clearDraft,
    isEditMode,
    isLoggedIn,
    removeAttachment,
    resetComposeState,
    resetImageUploads,
    resetVideoUploads,
    setAttachment,
    setIsProcessingShareLink,
    showAuthSheet,
    startImageUpload,
    startVideoUpload,
    tierLimits,
    updateDraft,
  });

  // Handle video returned from editor (via consumePendingVideoResult on focus).
  // This avoids `router.replace("/(tabs)/create", ...)` which can land on the
  // wrong tab. The video editor now uses `router.back()` + a shared pending result.
  useFocusEffect(
    useCallback(() => {
      const result = consumePendingVideoResult();
      if (!result) return;
      if (getHandledVideoParam() === result.videoUri) return;
      setHandledVideoParam(result.videoUri);

      const oldUri = result.replacingUri || null;
      const origUri = result.originalVideoUri ?? result.videoUri;
      VIDEO_META.set(result.videoUri, {
        originalUri: origUri,
        width: result.videoWidth,
        height: result.videoHeight,
        trimStart: result.trimStart,
        trimEnd: result.trimEnd,
      });

      if (oldUri && oldUri !== result.videoUri) {
        const { replaceMediaUri } = useDraftStore.getState();
        replaceMediaUri(oldUri, result.videoUri);
        VIDEO_UPLOADS.delete(oldUri);
        setVideoUploadState((prev) => {
          const next = { ...prev };
          delete next[oldUri];
          return next;
        });
        VIDEO_META.delete(oldUri);
      } else {
        setAttachment("video", result.videoUri);
      }
      setIsPreparingVideo(false);
      startVideoUpload(result.videoUri);
    }, [setAttachment, startVideoUpload])
  );

  const hasDraftContent = useMemo(() => {
    return (
      draft.community !== null ||
      draft.title.trim().length > 0 ||
      draft.body.trim().length > 0 ||
      draft.mediaUris.length > 0 ||
      draft.linkUrl !== null ||
      draft.attachmentType !== null ||
      selectedContentWarning !== "" ||
      selectedStickers.length > 0 ||
      showLinkInput
    );
  }, [draft.community, draft.title, draft.body, draft.mediaUris, draft.linkUrl, draft.attachmentType, selectedContentWarning, selectedStickers, showLinkInput]);

  const [showDraftModal, setShowDraftModal] = useState(false);

  const { handlePost, isSubmitting, setIsSubmitting, txProgress } = useCreateSubmitFlow({
    canPost,
    editPostId,
    getUploadedImageUrls,
    isEditMode,
    resetImageUploads,
    resetVideoUploads,
  });

  const discardDraftAndClose = useCallback(() => {
    clearDraft();
    resetComposeState();
    removeAttachment();
    resetVideoUploads();
    resetImageUploads();
    VIDEO_META.clear();
    setHandledVideoParam(null);
    setShowDraftModal(false);
    router.back();
  }, [clearDraft, removeAttachment, resetComposeState, resetVideoUploads, resetImageUploads]);

  const saveDraftAndClose = useCallback(() => {
    setShowDraftModal(false);
    router.back();
  }, []);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;

    triggerHaptic("selection");

    if (isEditMode || !hasDraftContent) {
      router.back();
      return;
    }

    setShowDraftModal(true);
  }, [isSubmitting, isEditMode, hasDraftContent]);

  const handleImagePress = useCallback(async () => {
    if (hasAttachment && draft.attachmentType !== "image") return;
    triggerHaptic("selection");

    try {
      setIsPreparingImages(true);
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
          startImageUpload(asset.uri, true)?.catch(() => {});
        }
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { feature: "create-post", operation: "image-picker" } });
      toast.error("Couldn't load images", "Try different photos or re-download them from iCloud");
    } finally {
      setIsPreparingImages(false);
    }
  }, [hasAttachment, draft.attachmentType, draft.mediaUris.length, setAttachment, startImageUpload, toast]);

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
              returnTo: "/(tabs)/create",
            },
          });
        }, 100);
      }
    } catch (err) {
      setIsPreparingVideo(false);
      Sentry.captureException(err, { tags: { feature: "create-post", operation: "video-picker" } });
      toast.error("Couldn't load video", "Try a different video or re-download it from iCloud");
    }
  }, [hasAttachment, draft.attachmentType, draft.mediaUris.length, toast]);

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

  const TAB_BAR_HEIGHT = isEditMode ? 0 : 60;

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      <CreateShareProcessingOverlay visible={isProcessingShareLink} />
      <CreatePreparingOverlay visible={isPreparingVideo || isPreparingImages} />
      <CreateHeader
        canPost={canPost}
        isSubmitting={isSubmitting}
        isEditMode={isEditMode}
        onClose={handleClose}
        onPost={handlePost}
      />

      <CreateEditabilityBanner
        isEditMode={isEditMode}
        editability={editability}
      />

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
          <CreateCommunitySelector />

          <CreateTitleInput
            inputRef={titleInputRef}
            bodyInputRef={bodyInputRef}
            maxLength={tierLimits.maxTitleLength}
            editExpired={editExpired}
          />

          <CreateContentWarningButton />

          <CreateLinkInput
            linkInputRef={linkInputRef}
            linkUrlInputRef={linkUrlInputRef}
          />

          <CreateImagePreviewCarousel
            imageUploadState={imageUploadState}
            setImageUploadState={setImageUploadState}
            isNetworkOnline={isNetworkOnline}
            editExpired={editExpired}
            onRetryUpload={(uri) => startImageUpload(uri)?.catch(() => {})}
          />

          <VideoPreviewCarousel
            videoUploadState={videoUploadState}
            setVideoUploadState={setVideoUploadState}
            videoUploadControllersRef={videoUploadControllersRef}
            isNetworkOnline={isNetworkOnline}
            editExpired={editExpired}
            onRetryUpload={startVideoUpload}
            onAddVideo={handleVideoPress}
          />

          <CreateUploadWarning visible={isUploadingImage} kind="image" />
          <CreateUploadWarning visible={isUploadingVideo} kind="video" />

          <CreateStickerPreview editExpired={editExpired} />

          <CreateBodyInput
            inputRef={bodyInputRef}
            maxLength={tierLimits.maxContentLength}
            editExpired={editExpired}
            selection={bodySelection}
            bodySelectionRef={bodySelectionRef}
            detectMention={mention.detectMention}
          />
        </ScrollView>

        <CreateComposeAccessories
          mentionOpen={mention.mentionOpen}
          mentionLoading={mention.mentionLoading}
          mentionResults={mention.mentionResults}
          mentionQuery={mention.mentionQuery}
          keyboardVisible={keyboardVisible}
          editExpired={editExpired}
          tabBarHeight={TAB_BAR_HEIGHT}
          hasAttachment={hasAttachment}
          attachmentType={draft.attachmentType}
          bodySelectionRef={bodySelectionRef}
          setBodySelection={setBodySelection}
          onCloseMention={mention.closeMention}
          insertMention={mention.insertMention}
          onImagePress={handleImagePress}
          onVideoPress={handleVideoPress}
          onSpoilerPress={handleSpoilerPress}
        />
      </KeyboardAvoidingView>

      <CreateScreenModals
        txProgress={txProgress}
        isEditMode={isEditMode}
        onDismissTransaction={() => {
          txProgress.hideModal();
          setIsSubmitting(false);
        }}
        onRetryTransaction={() => {
          setIsSubmitting(false);
          handlePost();
        }}
        showDraftModal={showDraftModal}
        onSaveDraft={saveDraftAndClose}
        onDiscardDraft={discardDraftAndClose}
        onCancelDraft={() => setShowDraftModal(false)}
      />
    </Box>
  );
}
