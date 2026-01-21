import {
  Entypo,
  EvilIcons,
  Feather,
} from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
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

import { uploadImageAndGetUrl } from "@/src/api/read/hooks/use-upload-media";
import { usePost, type CreatePostMutationInput } from "@/src/api/write";
import type { ContentTag } from "@/src/api/write/endpoints/posts";
import { Avatar } from "@/src/components/atoms";
import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useToast } from "@/src/providers/toast-provider";
import { useDraftStore, type Community } from "@/src/stores/draft-store";
import { useHomePostCardStore } from "./home/home-post-card-store";

import { CommunitySelectionModal } from "./create/community-selection-modal";

const URL_REGEX =
  /^(https?:\/\/)?([‌\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

const CONTENT_WARNING_OPTIONS: { value: ContentTag; label: string }[] = [
  { value: "sensitive", label: "Sensitive" },
  { value: "porn", label: "Porn" },
  { value: "violence", label: "Violence" },
  { value: "gore", label: "Gore" },
  { value: "death", label: "Death" },
];

export function CreateScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const { draft, updateDraft, clearDraft, setAttachment, removeAttachment } =
    useDraftStore();

  const titleInputRef = useRef<TextInput>(null);
  const bodyInputRef = useRef<TextInput>(null);
  const linkInputRef = useRef<TextInput>(null);

  const [showCommunityModal, setShowCommunityModal] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [showContentWarningModal, setShowContentWarningModal] = useState(false);
  const [selectedContentWarning, setSelectedContentWarning] = useState<ContentTag>("");

  const postMutation = usePost();
  const toast = useToast();
  const triggerScrollToTop = useHomePostCardStore((s) => s.triggerScrollToTop);

  const screenWidth = Dimensions.get("window").width;
  const selectedCommunity = draft.community;

  const canPost = useMemo(() => {
    return draft.title.trim().length > 0;
  }, [draft.title]);

  const hasAttachment = useMemo(() => {
    return (
      showLinkInput ||
      draft.attachmentType !== null ||
      draft.mediaUris.length > 0 ||
      draft.linkUrl !== null
    );
  }, [showLinkInput, draft.attachmentType, draft.mediaUris, draft.linkUrl]);

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

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    
    triggerHaptic("selection");
    if (draft.title || draft.body) {
    }
    clearDraft();
    router.back();
  }, [isSubmitting, clearDraft, draft.title, draft.body]);

  const handlePost = useCallback(async () => {
    if (!canPost || isSubmitting) return;

    Keyboard.dismiss();
    setIsSubmitting(true);
    triggerHaptic("medium");

    try {
      let imageUrl: string | null = null;
      if (draft.attachmentType === "image" && draft.mediaUris.length > 0) {
        try {
          console.log("[CreatePost] Uploading image...", draft.mediaUris[0]);
          imageUrl = await uploadImageAndGetUrl(draft.mediaUris[0]);
          console.log("[CreatePost] Image uploaded successfully:", imageUrl);
        } catch (error) {
          console.error("[CreatePost] Image upload failed:", error);
          toast.error("Image upload failed", error instanceof Error ? error.message : "Please try again");
          setIsSubmitting(false);
          return;
        }
      }

      let content = draft.body;
      
      if (imageUrl) {
        content = content ? `${content}\n\n${imageUrl}` : imageUrl;
      }
      
      if (draft.linkUrl) {
        content = content ? `${content}\n\n${draft.linkUrl}` : draft.linkUrl;
      }

      const isUserProfile = draft.community?.description === "Post to your profile";
      const topic = isUserProfile ? "general" : (draft.community?.id ?? "general");
      
      const postInput: CreatePostMutationInput = {
        topic,
        title: draft.title.trim(),
        content: content,
        tag: selectedContentWarning,
        optimisticMediaUrl: imageUrl ?? undefined,
      };

      console.log("[CreatePost] Submitting post:", postInput);

      const result = await postMutation.mutateAsync(postInput);

      console.log("[CreatePost] Post created successfully:", result);

      triggerHaptic("success");

      // Reset all local state
      setSelectedContentWarning("");
      setShowLinkInput(false);
      setLinkUrl("");
      setLinkError(false);
      setImageDimensions(null);

      // Clear draft store
      clearDraft();

      setIsSubmitting(false);

      // Trigger scroll to top on home screen
      triggerScrollToTop();

      setTimeout(() => {
        router.replace("/(tabs)/");
      }, 1000);
    } catch (error) {
      console.error("[CreatePost] Error creating post:", error);
      
      setIsSubmitting(false);

      const errorMessage = error instanceof Error ? error.message : "Failed to create post";
      toast.error("Failed to create post", errorMessage);

      triggerHaptic("error");
    }
  }, [canPost, isSubmitting, draft, clearDraft, postMutation, toast, selectedContentWarning, router]);

  const handleCommunitySelect = useCallback(
    (community: Community) => {
      updateDraft({ community });
      setShowCommunityModal(false);
      triggerHaptic("selection");
    },
    [updateDraft]
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
      if (asset.width && asset.height) {
        setImageDimensions({ width: asset.width, height: asset.height });
      }
    }
  }, [hasAttachment, draft.attachmentType, setAttachment]);

  const handleVideoPress = useCallback(() => {
    if (hasAttachment) return;
    triggerHaptic("selection");
    toast.info("Coming soon", "Video uploads will be available soon");
  }, [hasAttachment, toast]);

  const handlePollPress = useCallback(() => {
    if (hasAttachment) return;
    triggerHaptic("selection");
    toast.info("Coming soon", "Polls will be available soon");
  }, [hasAttachment, toast]);

  const handleRemoveMedia = useCallback(() => {
    triggerHaptic("selection");
    removeAttachment();
    setImageDimensions(null);
  }, [removeAttachment]);

  const TAB_BAR_HEIGHT = 60;

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
        behavior="padding"
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
              {selectedCommunity?.name ?? "Select a topic"}
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

          {selectedCommunity?.isNewTopic && (
            <View style={[styles.newTopicWarning, { backgroundColor: theme.colors.warning[500] + "15" }]}>
              <Text size="xs" mode="subtle" style={{ lineHeight: 16 }}>
                Topics are communities centered around specific interests. Posting in the wrong topic may affect your overall trust status on Mirage. Make sure to post into the right category!
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
              { backgroundColor: theme.colors.background.subtle },
            ]}
          >
            {selectedContentWarning ? (
              <View style={styles.contentWarningSelected}>
                <Text
                  size="sm"
                  weight="semibold"
                  style={{ color: theme.colors.warning[500] }}
                >
                  ⚠️ {selectedContentWarning.charAt(0).toUpperCase() + selectedContentWarning.slice(1)}
                </Text>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    handleClearContentWarning();
                  }}
                  hitSlop={8}
                >
                  <Feather name="x" size={14} color={theme.colors.text.subtle} />
                </Pressable>
              </View>
            ) : (
              <Text
                size="sm"
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
                    Oops, the link is not valid. Double-check, and try again.
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

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
                    : screenWidth,
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
                size={18}
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
                size={18}
                color={
                  hasAttachment && draft.attachmentType !== "image"
                    ? theme.colors.text.subtle
                    : theme.colors.text.default
                }
              />
            </Pressable>

            <Pressable
              onPress={handleVideoPress}
              disabled={hasAttachment}
              style={[
                styles.mediaButton,
                hasAttachment && styles.mediaButtonDisabled,
              ]}
            >
              <Feather
                name="video"
                size={18}
                color={hasAttachment ? theme.colors.text.subtle : theme.colors.text.default}
              />
            </Pressable>

            <Pressable
              onPress={handlePollPress}
              disabled={hasAttachment}
              style={[
                styles.mediaButton,
                hasAttachment && styles.mediaButtonDisabled,
              ]}
            >
              <Entypo
                name="list"
                size={20}
                color={hasAttachment ? theme.colors.text.subtle : theme.colors.text.default}
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
                  <Text
                    size="md"
                    style={{ color: theme.colors.text.default }}
                  >
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: selectedContentWarning === option.value
                          ? theme.colors.brand[500]
                          : theme.colors.border.default,
                        backgroundColor: selectedContentWarning === option.value
                          ? theme.colors.brand[500]
                          : "transparent",
                      },
                    ]}
                  >
                    {selectedContentWarning === option.value && (
                      <Feather name="check" size={12} color="#fff" />
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

      <Modal
        visible={isSubmitting}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.background.base,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.xl,
              alignItems: "center",
              minWidth: 200,
            }}
          >
            <ActivityIndicator
              size="large"
              color={theme.colors.brand[500]}
              style={{ marginBottom: theme.spacing.md }}
            />
            <Text size="md" weight="medium" style={{ marginBottom: theme.spacing.xs }}>
              Creating post...
            </Text>
            <Text size="sm" mode="subtle" style={{ textAlign: "center" }}>
              Please wait while we submit your post
            </Text>
          </View>
        </View>
      </Modal>
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
  },
  newTopicWarning: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    marginTop: theme.spacing.sm,
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
  mediaPreview: {
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
    borderRadius: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  clearWarningButton: {
    alignItems: "center",
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
}));
