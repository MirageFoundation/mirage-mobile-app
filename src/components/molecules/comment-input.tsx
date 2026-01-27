import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useGiphy } from "@/src/hooks";
import {
  Feather,
  FontAwesome5,
  Ionicons,
  MaterialIcons,
} from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type InputMode = "keyboard" | "link" | "gif" | "photo";

type CommentInputProps = {
  /** Callback when comment is submitted */
  onSubmit?: (
    text: string,
    imageUri?: string | null,
    gifUrl?: string | null,
  ) => void | Promise<void>;
  /** Callback when link is added */
  onAddLink?: (name: string, url: string) => void;
  /** Callback when image is selected */
  onAddImage?: (uri: string) => void;
  /** Callback when GIF is selected */
  onAddGif?: (url: string) => void;
  /** Whether the user is logged in */
  isLoggedIn?: boolean;
  /** Callback when auth is required (guest tries to comment) */
  onAuthRequired?: () => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Loading state (while submitting) */
  loading?: boolean;
  /** Reply context - username being replied to */
  replyingTo?: string | null;
  /** Callback to cancel reply mode */
  onCancelReply?: () => void;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
};

export type CommentInputRef = {
  /** Activate the comment input and focus */
  activate: () => void;
};

// Fixed preview dimensions
const PREVIEW_WIDTH = 120;
const PREVIEW_HEIGHT = 90;

export const CommentInput = forwardRef<CommentInputRef, CommentInputProps>(
  (
    {
      onSubmit,
      onAddLink,
      onAddImage,
      onAddGif,
      isLoggedIn = false,
      onAuthRequired,
      disabled = false,
      loading = false,
      replyingTo,
      onCancelReply,
      style,
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    const { theme } = useUnistyles();
    const inputRef = useRef<TextInput>(null);
    const gifSearchRef = useRef<TextInput>(null);

    const [isActive, setIsActive] = useState(false);
    const [text, setText] = useState("");
    const [inputMode, setInputMode] = useState<InputMode>("keyboard");
    const inputModeRef = useRef<InputMode>("keyboard");
    const [linkName, setLinkName] = useState("");
    const [linkUrl, setLinkUrl] = useState("");

    // Giphy integration
    const {
      gifs,
      isLoading: isLoadingGifs,
      query: gifSearch,
      setQuery: setGifSearch,
      isConfigured: isGiphyConfigured,
    } = useGiphy({ debounceMs: 300, limit: 20 });

    // Image and GIF state
    const [selectedImageUri, setSelectedImageUri] = useState<string | null>(
      null,
    );
    const [selectedGifUrl, setSelectedGifUrl] = useState<string | null>(null);

    // Flag to prevent deactivation during image picking
    const isPickingImageRef = useRef(false);

    const hasAttachment = selectedImageUri !== null || selectedGifUrl !== null;
    const canSubmit =
      (text.trim().length > 0 || hasAttachment) && !disabled && !loading;
    const canAddLink = linkName.trim().length > 0 && linkUrl.trim().length > 0;

    const handleActivate = useCallback(() => {
      if (!isLoggedIn) {
        onAuthRequired?.();
        return;
      }
      setIsActive(true);
      setInputMode("keyboard");
      setTimeout(() => inputRef.current?.focus(), 100);
    }, [isLoggedIn, onAuthRequired]);

    useImperativeHandle(
      ref,
      () => ({
        activate: () => {
          handleActivate();
        },
      }),
      [handleActivate],
    );

    const handleDeactivate = useCallback(() => {
      Keyboard.dismiss();
      setIsActive(false);
      setInputMode("keyboard");
    }, []);

    // Deactivate when keyboard is dismissed (clicking outside)
    // Only deactivate if in keyboard mode and there's no content
    useEffect(() => {
      const keyboardHideListener = Keyboard.addListener(
        "keyboardDidHide",
        () => {
          // Don't deactivate if we're picking an image (picker is open)
          if (isPickingImageRef.current) {
            return;
          }
          // Only deactivate if there's no content AND we're in keyboard mode
          // Don't deactivate when in link/gif mode as those intentionally dismiss keyboard
          // Use ref to get the latest mode value (avoids stale closure issue)
          if (
            inputModeRef.current === "keyboard" &&
            !text.trim() &&
            !selectedImageUri &&
            !selectedGifUrl
          ) {
            setIsActive(false);
            setInputMode("keyboard");
          }
        },
      );

      return () => {
        keyboardHideListener.remove();
      };
    }, [text, selectedImageUri, selectedGifUrl]);

    const handleSubmit = useCallback(() => {
      if (!canSubmit) return;
      Keyboard.dismiss();
      const trimmedText = text.trim();
      const imageUri = selectedImageUri;
      const gifUrl = selectedGifUrl;

      setText("");
      setSelectedImageUri(null);
      setSelectedGifUrl(null);
      triggerHaptic("medium");
      setIsActive(false);
      setInputMode("keyboard");

      setTimeout(() => onSubmit?.(trimmedText, imageUri, gifUrl), 0);
    }, [canSubmit, text, selectedImageUri, selectedGifUrl, onSubmit]);

    const handleModeChange = useCallback((mode: InputMode) => {
      triggerHaptic("selection");
      inputModeRef.current = mode; // Update ref immediately
      setInputMode(mode);
      if (mode === "keyboard") {
        inputRef.current?.focus();
      } else if (mode === "gif") {
        // Keep keyboard open, focus will go to search
        setTimeout(() => gifSearchRef.current?.focus(), 100);
      }
    }, []);

    const handleCloseGifMode = useCallback(() => {
      triggerHaptic("selection");
      inputModeRef.current = "keyboard";
      setInputMode("keyboard");
      setGifSearch(""); // Reset search query
      inputRef.current?.focus();
    }, [setGifSearch]);

    const handleAddLink = useCallback(() => {
      if (!canAddLink) return;
      triggerHaptic("medium");

      const markdownLink = `[${linkName.trim()}](${linkUrl.trim()})`;
      setText((prev) => {
        if (prev.trim()) {
          return `${prev} ${markdownLink}`;
        }
        return markdownLink;
      });

      onAddLink?.(linkName, linkUrl);
      setLinkName("");
      setLinkUrl("");
      setInputMode("keyboard");
    }, [canAddLink, linkName, linkUrl, onAddLink]);

    const handleSelectGif = useCallback(
      (gifUrl: string) => {
        triggerHaptic("medium");
        setSelectedImageUri(null);
        setSelectedGifUrl(gifUrl);
        onAddGif?.(gifUrl);
        // Ensure we stay active and update both ref and state
        setIsActive(true);
        inputModeRef.current = "keyboard";
        setInputMode("keyboard");
        setGifSearch(""); // Reset search query
        // Focus input after a short delay
        setTimeout(() => inputRef.current?.focus(), 100);
      },
      [onAddGif, setGifSearch],
    );

    const handlePickImage = useCallback(async () => {
      triggerHaptic("selection");

      // Set flag to prevent deactivation during picking
      isPickingImageRef.current = true;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });

      // Clear flag after picking
      isPickingImageRef.current = false;

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedGifUrl(null);
        setSelectedImageUri(asset.uri);
        onAddImage?.(asset.uri);
        // Keep input active and in keyboard mode
        setIsActive(true);
        inputModeRef.current = "keyboard";
        setInputMode("keyboard");
        // Focus input after a short delay
        setTimeout(() => inputRef.current?.focus(), 100);
      } else {
        // User cancelled - ensure we stay active if we have content
        if (!text.trim() && !selectedGifUrl) {
          // No content, can deactivate
          setIsActive(false);
        }
      }
    }, [onAddImage, text, selectedGifUrl]);

    const handleRemoveAttachment = useCallback(() => {
      triggerHaptic("selection");
      setSelectedImageUri(null);
      setSelectedGifUrl(null);
    }, []);

    const handleCancelReply = useCallback(() => {
      triggerHaptic("light");
      onCancelReply?.();
    }, [onCancelReply]);

    // Inactive state - simple input bar with icons inside
    if (!isActive) {
      return (
        <View
          style={[
            styles.inactiveContainer,
            style,
            { paddingBottom: insets.bottom || 8 },
          ]}
        >
          <View style={styles.inactiveInputWrapper}>
            <Pressable
              onPress={handleActivate}
              style={styles.inactiveInput}
              disabled={disabled}
            >
              <Text size="md">
                {isLoggedIn ? "Share your thoughts..." : "Login to comment"}
              </Text>
            </Pressable>
            <View style={styles.inactiveIcons}>
              <Pressable
                onPress={() => {
                  if (isLoggedIn) {
                    setIsActive(true);
                    setInputMode("gif");
                    setTimeout(() => gifSearchRef.current?.focus(), 100);
                  }
                }}
                style={styles.inactiveIconButton}
              >
                <MaterialIcons
                  name="gif"
                  size={24}
                  color={theme.colors.text.default}
                />
              </Pressable>
              <Pressable
                onPress={() => {
                  if (isLoggedIn) {
                    handleActivate();
                    setTimeout(() => handlePickImage(), 100);
                  }
                }}
                style={styles.inactiveIconButton}
              >
                <Ionicons
                  name="image-outline"
                  size={20}
                  color={theme.colors.text.default}
                />
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    // Active state - expanded input
    return (
      <View style={[styles.container, style]}>
        {/* Handle indicator */}
        <View style={styles.handleContainer}>
          <View
            style={[
              styles.handleIndicator,
              { backgroundColor: theme.colors.border.default },
            ]}
          />
        </View>

        {/* Reply context */}
        {replyingTo && (
          <View style={styles.replyBanner}>
            <Text size="xs" mode="subtle">
              Replying to{" "}
              <Text
                size="xs"
                weight="semibold"
                style={{ color: theme.colors.brand[500] }}
              >
                @{replyingTo}
              </Text>
            </Text>
            <Pressable onPress={handleCancelReply} style={styles.cancelReply}>
              <Ionicons
                name="close"
                size={16}
                color={theme.colors.text.subtle}
              />
            </Pressable>
          </View>
        )}

        {/* Image/GIF Preview */}
        {(selectedImageUri || selectedGifUrl) && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.previewContainer}
          >
            <View style={styles.previewWrapper}>
              <Image
                source={{
                  uri: selectedImageUri || selectedGifUrl || undefined,
                }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <Pressable
                onPress={handleRemoveAttachment}
                style={styles.removeButton}
              >
                <Feather name="x" size={14} color="#fff" />
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* Link input mode */}
        {inputMode === "link" && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.linkContainer}
          >
            <TextInput
              style={[
                styles.linkInput,
                styles.linkNameInput,
                { color: theme.colors.text.default },
              ]}
              placeholder="Link name"
              placeholderTextColor={theme.colors.text.subtle}
              value={linkName}
              onChangeText={setLinkName}
              autoFocus
            />
            <TextInput
              style={[styles.linkInput, { color: theme.colors.text.default }]}
              placeholder="https://"
              placeholderTextColor={theme.colors.text.subtle}
              value={linkUrl}
              onChangeText={setLinkUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
            <Pressable
              onPress={handleAddLink}
              disabled={!canAddLink}
              style={[
                styles.addLinkButton,
                {
                  backgroundColor: canAddLink
                    ? theme.colors.brand[500]
                    : theme.colors.background.subtle,
                },
              ]}
            >
              <Text
                size="md"
                weight="semibold"
                style={{
                  color: canAddLink ? "#FFFFFF" : theme.colors.text.subtle,
                  fontSize: 16,
                }}
              >
                Add link
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Text input - always visible except in link mode */}
        {inputMode !== "link" && (
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, { color: theme.colors.text.default }]}
              placeholder="Share your thoughts..."
              placeholderTextColor={theme.colors.text.subtle}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              autoFocus={inputMode === "keyboard"}
            />
          </View>
        )}

        {/* Divider */}
        <View
          style={[
            styles.divider,
            { backgroundColor: theme.colors.border.subtle },
          ]}
        />

        {/* Options bar */}
        <View style={styles.optionsBar}>
          <View style={styles.optionsLeft}>
            {/* Keyboard */}
            <Pressable
              onPress={() => handleModeChange("keyboard")}
              style={[
                styles.optionButton,
                inputMode === "keyboard" && styles.optionButtonActive,
              ]}
            >
              <FontAwesome5
                name="keyboard"
                size={16}
                color={
                  inputMode === "keyboard"
                    ? theme.colors.text.default
                    : theme.colors.text.subtle
                }
              />
            </Pressable>

            {/* Link */}
            <Pressable
              onPress={() => handleModeChange("link")}
              style={[
                styles.optionButton,
                inputMode === "link" && styles.optionButtonActive,
              ]}
            >
              <Feather
                name="link"
                size={16}
                color={
                  inputMode === "link"
                    ? theme.colors.text.default
                    : theme.colors.text.subtle
                }
              />
            </Pressable>

            {/* GIF */}
            <Pressable
              onPress={() => handleModeChange("gif")}
              style={[
                styles.optionButton,
                inputMode === "gif" && styles.optionButtonActive,
              ]}
            >
              <MaterialIcons
                name="gif"
                size={22}
                color={
                  inputMode === "gif"
                    ? theme.colors.text.default
                    : theme.colors.text.subtle
                }
              />
            </Pressable>

            {/* Photo */}
            <Pressable onPress={handlePickImage} style={styles.optionButton}>
              <Ionicons
                name="image-outline"
                size={18}
                color={theme.colors.text.subtle}
              />
            </Pressable>
          </View>

          <View style={styles.optionsRight}>
            {/* Reply button */}
            <Pressable
              onPressIn={handleSubmit}
              disabled={!canSubmit}
              style={[
                styles.replyButton,
                {
                  backgroundColor: canSubmit
                    ? theme.colors.brand[500]
                    : theme.colors.background.subtle,
                },
              ]}
            >
              <Text
                size="sm"
                weight="semibold"
                style={{
                  color: canSubmit ? "#FFFFFF" : theme.colors.text.subtle,
                }}
              >
                Reply
              </Text>
            </Pressable>
          </View>
        </View>

        {/* GIF section - appears below options bar */}
        {inputMode === "gif" && (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.gifSection}
          >
            {/* Full width divider */}
            <View style={styles.gifDivider} />

            {/* Search bar with close button */}
            <View style={styles.gifSearchRow}>
              <View style={styles.gifSearchContainer}>
                <Feather
                  name="search"
                  size={16}
                  color={theme.colors.text.subtle}
                  style={styles.gifSearchIcon}
                />
                <TextInput
                  ref={gifSearchRef}
                  style={[
                    styles.gifSearchInput,
                    { color: theme.colors.text.default },
                  ]}
                  placeholder="Search GIFs..."
                  placeholderTextColor={theme.colors.text.subtle}
                  value={gifSearch}
                  onChangeText={setGifSearch}
                  autoFocus
                />
                {isLoadingGifs && (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.text.subtle}
                    style={styles.gifLoadingIndicator}
                  />
                )}
              </View>
              <Pressable
                onPress={handleCloseGifMode}
                style={styles.gifCloseButton}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={theme.colors.text.subtle}
                />
              </Pressable>
            </View>

            {/* Giphy attribution */}
            <View style={styles.giphyAttribution}>
              <Text size="xs" mode="subtle">
                Powered by GIPHY
              </Text>
            </View>

            {/* Horizontal GIF list */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gifScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {!isGiphyConfigured && (
                <View style={styles.gifEmptyState}>
                  <Text size="sm" mode="subtle" style={{ textAlign: "center" }}>
                    Giphy API key not configured.{"\n"}
                    Set EXPO_PUBLIC_GIPHY_API_KEY
                  </Text>
                </View>
              )}
              {isGiphyConfigured && gifs.length === 0 && !isLoadingGifs && (
                <View style={styles.gifEmptyState}>
                  <Text size="sm" mode="subtle">
                    {gifSearch
                      ? `No GIFs found for "${gifSearch}"`
                      : "No trending GIFs"}
                  </Text>
                </View>
              )}
              {gifs.map((gif) => (
                <Pressable
                  key={gif.id}
                  onPress={() => handleSelectGif(gif.fullUrl)}
                  style={[
                    styles.gifItem,
                    selectedGifUrl === gif.fullUrl && styles.gifItemSelected,
                  ]}
                >
                  <Image
                    source={{ uri: gif.previewUrl }}
                    style={styles.gifImage}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </View>
    );
  },
);

CommentInput.displayName = "CommentInput";

const styles = StyleSheet.create((theme) => ({
  container: {
    backgroundColor: theme.colors.background.default,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
    // Top border radius
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    // Borders
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border.subtle,
    // Shadow on top
    shadowColor: theme.colors.primary[600],
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  handleContainer: {
    alignItems: "center",
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  handleIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  divider: {
    height: 1,
    marginBottom: theme.spacing.xs,
    marginHorizontal: -theme.spacing.md, // Full width - extend to screen edges
  },

  // Inactive state - simple bar
  inactiveContainer: {
    backgroundColor: theme.colors.background.default,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
  inactiveInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background.lighter,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    // minHeight: 48,
  },
  inactiveInput: {
    flex: 1,
    justifyContent: "center",
  },
  inactiveIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  inactiveIconButton: {
    padding: 4,
  },

  // Reply banner
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: theme.spacing.xs,
  },
  cancelReply: {
    padding: theme.spacing.xs,
  },

  // Preview container for image/GIF
  previewContainer: {
    marginBottom: theme.spacing.sm,
  },
  previewWrapper: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  },
  removeButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Text input row
  inputRow: {
    marginBottom: theme.spacing.sm,
  },
  textInput: {
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: theme.spacing.xs,
    minHeight: 60, // 3 lines
    maxHeight: 120,
    textAlignVertical: "top",
  },

  // Link mode
  linkContainer: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  linkInput: {
    fontSize: 18,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
  },
  linkNameInput: {
    fontSize: 20,
    fontWeight: "600",
  },
  addLinkButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.radius.full,
    marginTop: theme.spacing.xs,
  },
  addLinkButtonText: {
    fontSize: 16,
  },

  // Options bar
  optionsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  optionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  optionButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  optionButtonActive: {
    backgroundColor: theme.colors.background.hover,
  },
  replyButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full,
  },

  // GIF section - below options bar
  gifSection: {
    paddingTop: theme.spacing.sm,
  },
  gifDivider: {
    height: 1,
    backgroundColor: theme.colors.border.subtle,
    marginHorizontal: -theme.spacing.md, // Full width - extend to screen edges
    marginBottom: theme.spacing.sm,
  },
  gifSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  gifSearchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  gifSearchIcon: {
    marginRight: theme.spacing.xs,
  },
  gifSearchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: theme.spacing.sm,
  },
  gifLoadingIndicator: {
    marginLeft: theme.spacing.xs,
  },
  gifCloseButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  giphyAttribution: {
    marginBottom: theme.spacing.xs,
  },
  gifScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    minHeight: 100,
  },
  gifEmptyState: {
    width: 200,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  gifItem: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  gifItemSelected: {
    borderColor: theme.colors.brand[500],
  },
  gifImage: {
    width: "100%",
    height: "100%",
  },
}));
