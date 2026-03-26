import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { router } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { uploadImageAndGetUrl } from "@/src/api/read/hooks/use-upload-media";
import { usePost, useEdit } from "@/src/api/write";
import type { ContentTag } from "@/src/api/write/endpoints/posts";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useToast } from "@/src/providers/toast-provider";
import { TransactionProgressModal } from "@/src/components/molecules/transaction-progress-modal";
import { useTransactionProgress } from "@/src/hooks/use-transaction-progress";
import { useDraftStore, type Community } from "@/src/stores/draft-store";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { useUserLevel } from "@/src/stores/auth-store";
import { getTierPostLimits, canEditContent } from "@/src/utils/tiers";

import { CommunitySelectionModal } from "./create/community-selection-modal";
import { CreateContentWarningModal } from "./create/create-content-warning-modal";
import { CreateEditabilityBanner } from "./create/create-editability-banner";
import { CreateImagePreview } from "./create/create-image-preview";
import { CreateLinkSection } from "./create/create-link-section";
import { CreateMediaToolbar } from "./create/create-media-toolbar";
import { CreatePostMetaSection } from "./create/create-post-meta-section";
import { CreateProcessingOverlays } from "./create/create-processing-overlays";
import { CreateScreenHeader } from "./create/create-screen-header";
import { CreateStickerPreview } from "./create/create-sticker-preview";
import { CreateVideoPreview } from "./create/create-video-preview";
import { StickerPicker } from "@/src/components/molecules/sticker-picker";
import { useCreateIntake, VIDEO_META } from "./create/use-create-intake";
import { useCreateMediaActions } from "./create/use-create-media-actions";
import { useCreateSubmit } from "./create/use-create-submit";
import { useCreateVideoUploads } from "./create/use-create-video-uploads";

// Strict URL validation - requires protocol (http:// or https://)
const URL_REGEX = /^https?:\/\/[^\s<>"{}|\\^`\[\]]+$/i;

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
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

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

  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [showContentWarningModal, setShowContentWarningModal] = useState(false);
  const [selectedContentWarning, setSelectedContentWarning] =
    useState<ContentTag>("");
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [selectedStickers, setSelectedStickers] = useState<string[]>([]);

  const [, setIsVideoMuted] = useState(false);
  const [, setIsVideoPlaying] = useState(false);
  const [isProcessingShareLink, setIsProcessingShareLink] = useState(false);
  const [isPreparingVideo, setIsPreparingVideo] = useState(false);
  const navigatedToEditorRef = useRef(false);

  const toast = useToast();

  const {
    videoUploadState,
    isNetworkOnline,
    isUploadingVideo,
    startVideoUpload,
    clearVideoUploads,
    removeVideoUpload,
  } = useCreateVideoUploads(toast);

  const queryClient = useQueryClient();
  const txProgress = useTransactionProgress();
  const postMutation = usePost({ onPoWProgress: txProgress.updatePoWProgress });
  const editMutation = useEdit({ onPoWProgress: txProgress.updatePoWProgress });
  const triggerScrollToTop = useHomePostCardStore((s) => s.triggerScrollToTop);

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
  useCreateIntake({
    isEditMode,
    params,
    draft,
    maxContentLength: tierLimits.maxContentLength,
    maxTitleLength: tierLimits.maxTitleLength,
    hasShareIntent,
    shareIntent,
    resetShareIntent,
    clearDraft,
    updateDraft,
    setAttachment,
    removeAttachment,
    setShowLinkInput,
    setLinkUrl,
    setLinkError,
    setImageDimensions,
    setSelectedContentWarning,
    setSelectedStickers,
    setIsVideoMuted,
    setIsVideoPlaying,
    setIsProcessingShareLink,
    setIsPreparingVideo,
    clearVideoUploads,
    removeVideoUpload,
    startVideoUpload,
    navigatedToEditorRef,
  });

  const handleClose = useCallback(() => {
    if (isSubmitting) return;

    triggerHaptic("selection");
    router.back();
  }, [isSubmitting]);

  const handlePost = useCreateSubmit({
    canPost,
    isSubmitting,
    setIsSubmitting,
    draft,
    clearDraft,
    isEditMode,
    editPostId,
    selectedContentWarning,
    selectedStickers,
    setSelectedContentWarning,
    setSelectedStickers,
    setShowLinkInput,
    setLinkUrl,
    setLinkError,
    setImageDimensions,
    setIsVideoMuted,
    clearVideoUploads,
    clearVideoMeta: () => VIDEO_META.clear(),
    clearHandledVideoParam: () => {
      _handledVideoParam = null;
    },
    queryClient,
    txProgress,
    postMutation,
    editMutation,
    toast,
    router,
    triggerScrollToTop,
    uploadImageAndGetUrl,
  });

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

  const {
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
  } = useCreateMediaActions({
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
    urlRegex: URL_REGEX,
    looksLikeUrlWithoutProtocol,
  });

  const TAB_BAR_HEIGHT = isEditMode ? 0 : 60;

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      <CreateProcessingOverlays
        isProcessingShareLink={isProcessingShareLink}
        isPreparingVideo={isPreparingVideo}
        isDark={isDark}
        brandColor={theme.colors.brand[500]}
      />
      <CreateScreenHeader
        canSubmit={canPost}
        isSubmitting={isSubmitting}
        isEditMode={isEditMode}
        submitLabel="Post"
        closeIconColor={theme.colors.text.default}
        submitTextColor={
          canPost && !isSubmitting ? "#FFFFFF" : theme.colors.text.subtle
        }
        submitBackgroundColor={
          canPost && !isSubmitting
            ? theme.colors.brand[500]
            : theme.colors.background.subtle
        }
        onClose={handleClose}
        onSubmit={handlePost}
      />

      <CreateEditabilityBanner
        isEditMode={isEditMode}
        editability={editability}
        errorColor={theme.colors.error[500]}
        warningColor={theme.colors.warning[500]}
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
          <CreatePostMetaSection
            selectedCommunity={selectedCommunity}
            title={draft.title}
            maxTitleLength={tierLimits.maxTitleLength}
            selectedContentWarning={selectedContentWarning}
            editExpired={editExpired}
            titleInputRef={titleInputRef}
            bodyInputRef={bodyInputRef}
            textColor={theme.colors.text.default}
            subtleTextColor={theme.colors.text.subtle}
            lighterBackgroundColor={theme.colors.background.lighter}
            warningColor={theme.colors.warning[500]}
            errorColor={theme.colors.error[500]}
            onOpenCommunityModal={() => {
              triggerHaptic("selection");
              setShowCommunityModal(true);
            }}
            onChangeTitle={(text) => updateDraft({ title: text })}
            onOpenContentWarning={handleOpenContentWarning}
            onClearContentWarning={handleClearContentWarning}
          />

          <CreateLinkSection
            visible={showLinkInput}
            linkUrl={linkUrl}
            linkError={linkError}
            editExpired={editExpired}
            linkInputRef={linkInputRef}
            textColor={theme.colors.text.default}
            subtleTextColor={theme.colors.text.subtle}
            subtleBackgroundColor={theme.colors.background.subtle}
            borderColor={theme.colors.border.default}
            errorColor={theme.colors.error[500]}
            onChangeLink={handleLinkChange}
            onRemoveLink={handleRemoveLink}
          />

          {draft.attachmentType === "image" ? (
            <CreateImagePreview
              mediaUris={draft.mediaUris}
              editExpired={editExpired}
              onRemoveImage={handleRemoveImageItem}
            />
          ) : null}

          <CreateVideoPreview
            mediaUris={draft.mediaUris}
            scrollRef={videoScrollRef}
            videoUploadState={videoUploadState}
            isNetworkOnline={isNetworkOnline}
            editExpired={editExpired}
            onEditVideo={handleEditVideo}
            onRetryUpload={startVideoUpload}
            onRemoveVideo={handleRemoveVideo}
            onAddVideo={handleVideoPress}
          />

          {isUploadingVideo && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
                marginHorizontal: 4,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: theme.colors.warning[500] + "15",
                gap: 8,
              }}
            >
              <Feather name="alert-triangle" size={14} color={theme.colors.warning[500]} />
              <Text size="xs" style={{ color: theme.colors.warning[500], flex: 1 }}>
                Please don&apos;t leave the app while the video is uploading
              </Text>
            </Animated.View>
          )}

          <CreateStickerPreview
            stickers={selectedStickers}
            editExpired={editExpired}
            backgroundColor={theme.colors.background.subtle}
            onRemoveSticker={handleRemoveSticker}
          />

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

        <CreateMediaToolbar
          editExpired={editExpired}
          hasAttachment={hasAttachment}
          attachmentType={draft.attachmentType}
          showLinkInput={showLinkInput}
          keyboardPaddingBottom={
            keyboardVisible
              ? Platform.OS === "android"
                ? 0
                : 8
              : Platform.OS === "android"
                ? TAB_BAR_HEIGHT + 24
                : insets.bottom + TAB_BAR_HEIGHT + 8
          }
          backgroundColor={theme.colors.background.default}
          defaultIconColor={theme.colors.text.default}
          subtleIconColor={theme.colors.text.subtle}
          onLinkPress={handleLinkPress}
          onImagePress={handleImagePress}
          onVideoPress={handleVideoPress}
          onStickerPress={handleStickerPress}
          onSpoilerPress={handleSpoilerPress}
        />
      </KeyboardAvoidingView>

      <CommunitySelectionModal
        visible={showCommunityModal}
        onClose={() => setShowCommunityModal(false)}
        onSelect={handleCommunitySelect}
        selectedCommunity={selectedCommunity ?? undefined}
      />

      <CreateContentWarningModal
        visible={showContentWarningModal}
        selectedContentWarning={selectedContentWarning}
        options={CONTENT_WARNING_OPTIONS}
        backgroundColor={theme.colors.background.base}
        textColor={theme.colors.text.default}
        subtleTextColor={theme.colors.text.subtle}
        borderColor={theme.colors.border.default}
        brandColor={theme.colors.brand[500]}
        errorColor={theme.colors.error[500]}
        onClose={() => setShowContentWarningModal(false)}
        onSelect={handleSelectContentWarning}
        onClear={() => {
          setSelectedContentWarning("");
          setShowContentWarningModal(false);
        }}
      />

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
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
  },
  bodyInput: {
    fontSize: 18,
    fontFamily: theme.typography.family.mono,
    paddingVertical: theme.spacing.md,
    minHeight: 150,
    textAlignVertical: "top",
  },
}));
