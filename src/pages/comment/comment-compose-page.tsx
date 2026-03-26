import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { StickerPicker } from "@/src/components/molecules/sticker-picker";
import { MEME_STICKERS } from "@/src/data/stickers";

import { CommentComposeAttachmentPreview } from "./components/comment-compose-attachment-preview";
import { CommentComposeContext } from "./components/comment-compose-context";
import { CommentComposeGifSection } from "./components/comment-compose-gif-section";
import { CommentComposeHeader } from "./components/comment-compose-header";
import { CommentComposeLinkEditor } from "./components/comment-compose-link-editor";
import { CommentComposeTextEditor } from "./components/comment-compose-text-editor";
import { CommentComposeToolbar } from "./components/comment-compose-toolbar";
import { useCommentCompose } from "./use-comment-compose";

export default function CommentComposeScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const {
    canAddLink,
    canSubmit,
    editExpired,
    editability,
    effectiveMaxLength,
    gifSearch,
    gifSearchRef,
    gifs,
    handleAddLink,
    handleClose,
    handleCloseGifMode,
    handleModeChange,
    handlePickImage,
    handleRemoveAttachment,
    handleSelectGif,
    handleSpoilerPress,
    handleStickerSelect,
    handleSubmit,
    inputMode,
    inputRef,
    isEditMode,
    isGiphyConfigured,
    isKeyboardVisible,
    isLoadingGifs,
    isMediaLoading,
    linkName,
    linkUrl,
    linkUrlRef,
    params,
    replyPreview,
    selectedGifUrl,
    selectedImageUri,
    selection,
    selectionRef,
    setGifSearch,
    setIsMediaLoading,
    setLinkName,
    setLinkUrl,
    setSelection,
    setShowStickerPicker,
    setText,
    showStickerPicker,
    text,
  } = useCommentCompose();

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
        <CommentComposeHeader
          isEditMode={isEditMode}
          canSubmit={canSubmit}
          onClose={handleClose}
          onSubmit={handleSubmit}
        />

        <CommentComposeContext
          replyToUsername={params.replyToUsername}
          replyPreview={replyPreview}
          postTitle={params.postTitle}
          postThumbnail={params.postThumbnail}
          replyToContent={params.replyToContent}
          isEditMode={isEditMode}
          editability={editability}
        />

        <ScrollView
          style={styles.contentArea}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          <CommentComposeLinkEditor
            visible={inputMode === "link"}
            linkName={linkName}
            linkUrl={linkUrl}
            canAddLink={canAddLink}
            linkUrlRef={linkUrlRef}
            onChangeLinkName={setLinkName}
            onChangeLinkUrl={setLinkUrl}
            onSubmit={handleAddLink}
          />

          <CommentComposeAttachmentPreview
            uri={selectedImageUri || selectedGifUrl}
            isMediaLoading={isMediaLoading}
            editable={!editExpired}
            onRemove={handleRemoveAttachment}
            onLoadStart={() => setIsMediaLoading(true)}
            onLoad={() => setIsMediaLoading(false)}
            onError={() => setIsMediaLoading(false)}
          />

          {inputMode !== "link" ? (
            <CommentComposeTextEditor
              editExpired={editExpired}
              effectiveMaxLength={effectiveMaxLength}
              inputRef={inputRef}
              selection={selection}
              text={text}
              onChangeText={setText}
              onSelectionChange={(nextSelection) => {
                selectionRef.current = nextSelection;
                setSelection(nextSelection);
              }}
            />
          ) : null}
        </ScrollView>

        <CommentComposeGifSection
          visible={inputMode === "gif"}
          gifSearchRef={gifSearchRef}
          gifSearch={gifSearch}
          gifs={gifs}
          isLoadingGifs={isLoadingGifs}
          isGiphyConfigured={isGiphyConfigured}
          selectedGifUrl={selectedGifUrl}
          onChangeSearch={setGifSearch}
          onClose={handleCloseGifMode}
          onSelectGif={handleSelectGif}
        />

        <CommentComposeToolbar
          inputMode={inputMode}
          editExpired={editExpired}
          paddingBottom={isKeyboardVisible ? 8 : insets.bottom || 8}
          onModeChange={handleModeChange}
          onPickImage={handlePickImage}
          onOpenStickerPicker={() => setShowStickerPicker(true)}
          onSpoilerPress={handleSpoilerPress}
        />
      </View>

      <StickerPicker
        visible={showStickerPicker}
        onClose={() => setShowStickerPicker(false)}
        onSelect={handleStickerSelect}
        selectedStickers={
          selectedImageUri && MEME_STICKERS.includes(selectedImageUri)
            ? [selectedImageUri]
            : []
        }
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
  contentArea: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    flexGrow: 1,
  },
}));
