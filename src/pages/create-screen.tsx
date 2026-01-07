import {
  Entypo,
  EvilIcons,
  Feather,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Avatar } from "@/src/components/atoms";
import GorhomPopupSheet, {
  type GorhomPopupSheetRef,
} from "@/src/components/ui/gorhom-popup-sheet";
import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useDraftStore, type Community } from "@/src/stores/draft-store";

// Community Selection Modal Component
import { CommunitySelectionModal } from "./create/community-selection-modal";

// URL validation regex
const URL_REGEX =
  /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

// Button background color

export function CreateScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const { draft, updateDraft, clearDraft, setAttachment, removeAttachment } =
    useDraftStore();

  // Refs
  const titleInputRef = useRef<TextInput>(null);
  const bodyInputRef = useRef<TextInput>(null);
  const linkInputRef = useRef<TextInput>(null);
  const tagsSheetRef = useRef<GorhomPopupSheetRef>(null);

  // Local state
  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Screen width for full-width image
  const screenWidth = Dimensions.get("window").width;

  // Selected community (null by default)
  const selectedCommunity = draft.community;

  // Can post check
  const canPost = useMemo(() => {
    return draft.title.trim().length > 0;
  }, [draft.title]);

  // Has attachment check - also consider showLinkInput as having an attachment
  const hasAttachment = useMemo(() => {
    return (
      showLinkInput ||
      draft.attachmentType !== null ||
      draft.mediaUris.length > 0 ||
      draft.linkUrl !== null
    );
  }, [showLinkInput, draft.attachmentType, draft.mediaUris, draft.linkUrl]);

  // Keyboard listeners
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

  // Handlers
  const handleClose = useCallback(() => {
    triggerHaptic("selection");
    if (draft.title || draft.body) {
      // Could show discard confirmation here
    }
    clearDraft();
    router.back();
  }, [clearDraft, draft.title, draft.body]);

  const handlePost = useCallback(() => {
    if (!canPost) return;
    triggerHaptic("success");
    // TODO: Submit post
    console.log("Posting:", draft);
    clearDraft();
    router.back();
  }, [canPost, draft, clearDraft]);

  const handleCommunitySelect = useCallback(
    (community: Community) => {
      updateDraft({ community });
      setShowCommunityModal(false);
      triggerHaptic("selection");
    },
    [updateDraft]
  );

  const handleOpenTags = useCallback(() => {
    triggerHaptic("selection");
    tagsSheetRef.current?.present();
  }, []);

  // Link handlers
  const handleLinkPress = useCallback(() => {
    if (hasAttachment && !showLinkInput) return;
    triggerHaptic("selection");
    setShowLinkInput(true);
    setAttachment("link", "");
    setTimeout(() => linkInputRef.current?.focus(), 100);
  }, [hasAttachment, showLinkInput, setAttachment]);

  const handleLinkChange = useCallback((text: string) => {
    setLinkUrl(text);
    if (text.length > 0) {
      const isValid = URL_REGEX.test(text);
      setLinkError(!isValid);
    } else {
      setLinkError(false);
    }
  }, []);

  const handleLinkSubmit = useCallback(() => {
    if (linkUrl && !linkError) {
      setAttachment("link", linkUrl);
      updateDraft({ linkUrl });
    }
  }, [linkUrl, linkError, setAttachment, updateDraft]);

  const handleRemoveLink = useCallback(() => {
    setShowLinkInput(false);
    setLinkUrl("");
    setLinkError(false);
    removeAttachment();
  }, [removeAttachment]);

  // Image/Video handlers
  const handleImagePress = useCallback(async () => {
    if (hasAttachment && draft.attachmentType !== "image") return;
    triggerHaptic("selection");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setAttachment("image", asset.uri);
      // Store image dimensions for proper aspect ratio
      if (asset.width && asset.height) {
        setImageDimensions({ width: asset.width, height: asset.height });
      }
    }
  }, [hasAttachment, draft.attachmentType, setAttachment]);

  const handleVideoPress = useCallback(async () => {
    if (hasAttachment && draft.attachmentType !== "video") return;
    triggerHaptic("selection");

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAttachment("video", result.assets[0].uri);
    }
  }, [hasAttachment, draft.attachmentType, setAttachment]);

  const handlePollPress = useCallback(() => {
    if (hasAttachment && draft.attachmentType !== "poll") return;
    triggerHaptic("selection");
    // TODO: Open poll creation
  }, [hasAttachment, draft.attachmentType]);

  const handleRemoveMedia = useCallback(() => {
    triggerHaptic("selection");
    removeAttachment();
    setImageDimensions(null);
  }, [removeAttachment]);

  // Tab bar height (approximate)
  const TAB_BAR_HEIGHT = 60;

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      {/* Header */}
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
          disabled={!canPost}
          style={[
            styles.postButton,
            !canPost && styles.postButtonDisabled,
            {
              backgroundColor: canPost
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
                color: canPost ? "#fff" : theme.colors.text.emphasis,
              },
            ]}
          >
            Post
          </Button.Text>
        </Button>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
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
          {/* Community Selector */}
          <Pressable
            onPress={() => {
              triggerHaptic("selection");
              setShowCommunityModal(true);
            }}
            style={[
              styles.communitySelector,
              { backgroundColor: theme.colors.background.subtle },
            ]}
          >
            {selectedCommunity ? (
              <Avatar
                size={24}
                seed={selectedCommunity.id}
                source={
                  selectedCommunity.avatar
                    ? { uri: selectedCommunity.avatar }
                    : undefined
                }
                rounded="full"
              />
            ) : (
              <MaterialCommunityIcons
                name="account-group-outline"
                size={20}
                color={theme.colors.text.default}
              />
            )}
            <Text
              size="md"
              weight="semibold"
              style={{ color: theme.colors.text.default }}
            >
              {selectedCommunity?.name ?? "Select a community"}
            </Text>
            <Box>
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

          {/* Title Input */}
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

          {/* Tags Button */}
          <Pressable
            onPress={handleOpenTags}
            style={[
              styles.tagsButton,
              { backgroundColor: theme.colors.background.subtle },
            ]}
          >
            <Text
              size="sm"
              weight="semibold"
              style={{ color: theme.colors.text.default }}
            >
              Add tags (optional)
            </Text>
          </Pressable>

          {/* Link Input */}
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
                    Oops, the link is not valid. Double-check, and try again.
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* Media Preview */}
          {draft.mediaUris.length > 0 && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              style={[
                styles.mediaPreviewContainer,
                {
                  width: screenWidth,
                  transform: [{ translateX: -16 }],
                },
              ]}
            >
              <Image
                source={{ uri: draft.mediaUris[0] }}
                style={{
                  width: screenWidth,
                  height: imageDimensions
                    ? screenWidth *
                      (imageDimensions.height / imageDimensions.width)
                    : screenWidth, // Default to square if dimensions unknown
                }}
              />
              <Pressable
                onPress={handleRemoveMedia}
                style={[
                  styles.mediaRemoveButton,
                  { backgroundColor: "rgba(0, 0, 0, 0.7)" },
                ]}
              >
                <Feather name="x" size={18} color={"#fff"} />
              </Pressable>
            </Animated.View>
          )}

          {/* Body Input */}
          <TextInput
            ref={bodyInputRef}
            style={[styles.bodyInput, { color: theme.colors.text.default }]}
            placeholder="body text (optional)"
            placeholderTextColor={theme.colors.text.subtle}
            value={draft.body}
            onChangeText={(text) => updateDraft({ body: text })}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>

        {/* Media Picker Bar */}
        <Animated.View
          style={[
            styles.mediaBar,
            {
              backgroundColor: theme.colors.background.default,
              paddingBottom: keyboardVisible
                ? 8
                : insets.bottom + TAB_BAR_HEIGHT + 8,
            },
          ]}
        >
          <View style={styles.mediaBarContent}>
            {/* Link */}
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
                size={18}
                color={
                  hasAttachment && !showLinkInput
                    ? theme.colors.text.subtle
                    : theme.colors.text.default
                }
              />
            </Pressable>

            {/* Image */}
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
                size={18}
                color={
                  hasAttachment && draft.attachmentType !== "image"
                    ? theme.colors.text.subtle
                    : theme.colors.text.default
                }
              />
            </Pressable>

            {/* Video */}
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
                size={18}
                color={
                  hasAttachment && draft.attachmentType !== "video"
                    ? theme.colors.text.subtle
                    : theme.colors.text.default
                }
              />
            </Pressable>

            {/* Poll */}
            <Pressable
              onPress={handlePollPress}
              disabled={hasAttachment && draft.attachmentType !== "poll"}
              style={[
                styles.mediaButton,
                hasAttachment &&
                  draft.attachmentType !== "poll" &&
                  styles.mediaButtonDisabled,
              ]}
            >
              <Entypo
                name="list"
                size={20}
                color={
                  hasAttachment && draft.attachmentType !== "poll"
                    ? theme.colors.text.subtle
                    : theme.colors.text.default
                }
              />
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Community Selection Modal */}
      <CommunitySelectionModal
        visible={showCommunityModal}
        onClose={() => setShowCommunityModal(false)}
        onSelect={handleCommunitySelect}
        selectedCommunity={selectedCommunity ?? undefined}
      />

      {/* Tags Bottom Sheet */}
      <GorhomPopupSheet ref={tagsSheetRef} title="Add Tags">
        <Box p="lg" center>
          <Text mode="subtle">Tag selection coming soon...</Text>
        </Box>
      </GorhomPopupSheet>
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
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    borderRadius: theme.radius.full,
    // marginBottom: theme.spacing.sm,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: "600",
    fontFamily: theme.typography.family.mono,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.md,
    minHeight: 40,
  },
  tagsButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.sm + 2,
    borderRadius: theme.radius.full,
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
  mediaPreview: {
    // Width and height are set dynamically based on image dimensions
  },
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
    fontSize: 16,
    fontFamily: theme.typography.family.mono,
    paddingVertical: theme.spacing.md,
    minHeight: 120,
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
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaButtonDisabled: {
    opacity: 0.4,
  },
}));
