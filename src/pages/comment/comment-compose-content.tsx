import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { Text } from "@/src/components/ui/primitives";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  Image as RNImage,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { CommentComposeAccessories } from "./comment-compose-accessories";
import { CommentComposeHeader } from "./comment-compose-header";
import { CommentComposeLinkSection } from "./comment-compose-link-section";
import { CommentComposeReplyBanner } from "./comment-compose-reply-banner";
import { styles } from "./comment-compose-styles";
import { useCommentComposeController } from "./use-comment-compose-controller";

export default function CommentComposeScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const controller = useCommentComposeController();
  const {
    canAddLink,
    canSubmit,
    editability,
    editExpired,
    effectiveMaxLength,
    handleAddLink,
    handleCancelLink,
    handleClose,
    handleLinkUrlChange,
    handleRemoveAttachment,
    handleRemoveMarkdownLink,
    handleRetryImageUpload,
    handleSubmit,
    handleTextChange,
    imageUploadState,
    inputMode,
    inputRef,
    isEditMode,
    isNetworkOnline,
    isPreparingImage,
    linkError,
    linkName,
    linkUrl,
    linkUrlRef,
    params,
    replyPreview,
    selectedGifUrl,
    selectedImageUri,
    selection,
    selectionRef,
    setIsMediaLoading,
    setIsPreviewVisible,
    setLinkName,
    showImagePreviewBlockingOverlay,
    text,
  } = controller;
  const {
    postContent,
    postThumbnail,
    postTitle,
    replyToContent,
    replyToUsername,
  } = params;

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
          <View style={styles.fullscreenLoadingOverlay} accessibilityRole="progressbar">
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
        {controller.replyNotice && <Text size="sm">{controller.replyNotice}</Text>}

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
          <View
            style={{
              marginHorizontal: 16,
              marginVertical: 8,
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: theme.colors.error[500] + "20",
              borderRadius: 10,
            }}
          >
            <Text size="sm" style={{ color: theme.colors.error[500] }}>
              Editing time has expired. Your tier allows editing up to{" "}
              {editability.limitMinutes} minutes after publishing.
            </Text>
          </View>
        )}

        {isEditMode &&
          editability?.allowed &&
          editability.remainingMinutes !== Infinity && (
            <View
              style={{
                marginHorizontal: 16,
                marginVertical: 8,
                paddingHorizontal: 16,
                paddingVertical: 10,
                backgroundColor: theme.colors.warning[500] + "15",
                borderRadius: 10,
              }}
            >
              <Text size="sm" style={{ color: theme.colors.warning[500] }}>
                {editability.remainingMinutes} min remaining to edit this comment
              </Text>
            </View>
          )}

        <ScrollView
          style={styles.contentArea}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
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

          {(selectedImageUri || selectedGifUrl) && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              style={styles.previewContainer}
            >
              <View style={styles.previewWrapper}>
                <RNImage
                  source={{ uri: selectedImageUri || selectedGifUrl || undefined }}
                  style={styles.previewImage}
                  resizeMode="cover"
                  accessibilityLabel="Comment attachment preview"
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
                {selectedImageUri && isPreparingImage && (
                  <View style={styles.uploadedBadge}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text size="xs" weight="medium" style={styles.uploadedBadgeText}>
                      Preparing...
                    </Text>
                  </View>
                )}
                {selectedImageUri && imageUploadState.uploading && !isPreparingImage && (
                  <View
                    style={[
                      styles.uploadedBadge,
                      !isNetworkOnline && styles.uploadWarningBadge,
                    ]}
                  >
                    <ActivityIndicator size="small" color="#fff" />
                    <Text size="xs" weight="medium" style={styles.uploadedBadgeText}>
                      {!isNetworkOnline ? "Low connectivity..." : "Uploading..."}
                    </Text>
                  </View>
                )}
                {selectedImageUri && imageUploadState.done && !imageUploadState.uploading && (
                  <View style={styles.uploadedBadge}>
                    <Feather name="check" size={12} color="#fff" />
                    <Text size="xs" weight="medium" style={styles.uploadedBadgeText}>
                      Uploaded
                    </Text>
                  </View>
                )}
                {selectedImageUri && imageUploadState.error && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Retry image upload"
                    onPress={handleRetryImageUpload}
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
                    accessibilityRole="button"
                    accessibilityLabel="Remove attachment"
                    onPress={handleRemoveAttachment}
                    style={styles.removeButton}
                  >
                    <Feather name="x" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>
            </Animated.View>
          )}

          {inputMode !== "link" && (
            <>
              <TextInput
                ref={inputRef}
                style={[
                  styles.textInput,
                  { color: theme.colors.text.default },
                  editExpired && { opacity: 0.5 },
                ]}
                placeholder="Comment"
                placeholderTextColor={theme.colors.text.subtle}
                value={text}
                onChangeText={handleTextChange}
                multiline
                maxLength={effectiveMaxLength}
                autoFocus={!editExpired}
                editable={!editExpired}
                selection={selection}
                onSelectionChange={(event) => {
                  selectionRef.current = event.nativeEvent.selection;
                }}
              />
              {text.length > 0 && (
                <Text
                  size="xs"
                  style={{
                    color:
                      text.length >= effectiveMaxLength
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

        <CommentComposeAccessories controller={controller} />
      </View>
    </KeyboardAvoidingView>
  );
}
