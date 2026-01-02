import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  Feather,
  FontAwesome5,
  Ionicons,
  MaterialIcons,
} from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Pressable,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type InputMode = "keyboard" | "link" | "gif" | "photo";

type CommentInputProps = {
  /** Callback when comment is submitted */
  onSubmit?: (text: string) => void | Promise<void>;
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

// Sample GIFs for demo
const SAMPLE_GIFS = [
  "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif",
  "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif",
  "https://media.giphy.com/media/l41lGvinEgARjB2HC/giphy.gif",
  "https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif",
  "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
  "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif",
  "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif",
  "https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif",
];

export const CommentInput = ({
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
}: CommentInputProps) => {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const inputRef = useRef<TextInput>(null);

  const [isActive, setIsActive] = useState(false);
  const [text, setText] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("keyboard");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const canSubmit = text.trim().length > 0 && !disabled && !loading;
  const canAddLink = linkName.trim().length > 0 && linkUrl.trim().length > 0;

  const handleActivate = useCallback(() => {
    if (!isLoggedIn) {
      // Trigger auth sheet for guests
      onAuthRequired?.();
      return;
    }
    setIsActive(true);
    bottomSheetRef.current?.expand();
  }, [isLoggedIn, onAuthRequired]);

  const handleDeactivate = useCallback(() => {
    setIsActive(false);
    setInputMode("keyboard");
    Keyboard.dismiss();
    bottomSheetRef.current?.close();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    triggerHaptic("medium");
    const trimmedText = text.trim();
    setText("");
    handleDeactivate();
    await onSubmit?.(trimmedText);
  }, [canSubmit, text, onSubmit, handleDeactivate]);

  const handleModeChange = useCallback((mode: InputMode) => {
    triggerHaptic("selection");
    setInputMode(mode);
    if (mode === "keyboard") {
      inputRef.current?.focus();
    }
  }, []);

  const handleAddLink = useCallback(() => {
    if (!canAddLink) return;
    triggerHaptic("medium");
    onAddLink?.(linkName, linkUrl);
    setLinkName("");
    setLinkUrl("");
    setInputMode("keyboard");
  }, [canAddLink, linkName, linkUrl, onAddLink]);

  const handleSelectGif = useCallback(
    (gifUrl: string) => {
      triggerHaptic("medium");
      onAddGif?.(gifUrl);
      setText((prev) => prev + ` ${gifUrl}`);
      setInputMode("keyboard");
    },
    [onAddGif]
  );

  const handlePickImage = useCallback(() => {
    triggerHaptic("selection");

    Alert.alert("Add Photo", "Choose an option", [
      {
        text: "Camera",
        onPress: () => {
          console.log("Open camera");
        },
      },
      {
        text: "Photo Library",
        onPress: () => {
          console.log("Open photo library");
          onAddImage?.("photo-placeholder");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
    setInputMode("keyboard");
  }, [onAddImage]);

  const handleCancelReply = useCallback(() => {
    triggerHaptic("light");
    onCancelReply?.();
  }, [onCancelReply]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  // Inactive state - simple input bar
  if (!isActive) {
    return (
      <View
        style={[
          styles.inactiveContainer,
          style,
          { paddingBottom: insets.bottom },
        ]}
      >
        <Pressable
          onPress={handleActivate}
          style={styles.inactiveInput}
          disabled={disabled}
        >
          <Text size="sm" mode="subtle" style={styles.placeholder}>
            {isLoggedIn ? "Share your thoughts..." : "Login to comment"}
          </Text>
          <View style={styles.inactiveIcons}>
            <Pressable
              onPress={() => {
                if (isLoggedIn) {
                  handleActivate();
                  setTimeout(() => setInputMode("gif"), 100);
                }
              }}
              style={styles.inactiveIconButton}
            >
              <MaterialIcons
                name="gif"
                size={24}
                color={theme.colors.text.subtle}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                if (isLoggedIn) {
                  handlePickImage();
                }
              }}
              style={styles.inactiveIconButton}
            >
              <Ionicons
                name="image-outline"
                size={20}
                color={theme.colors.text.subtle}
              />
            </Pressable>
          </View>
        </Pressable>
      </View>
    );
  }

  // Active state - bottom sheet
  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={inputMode === "gif" ? ["50%", "80%"] : ["30%"]}
      enablePanDownToClose
      onClose={handleDeactivate}
      backdropComponent={renderBackdrop}
      backgroundStyle={[
        styles.sheetBackground,
        { backgroundColor: theme.colors.background.default },
      ]}
      handleIndicatorStyle={[
        styles.handleIndicator,
        { backgroundColor: theme.colors.border.default },
      ]}
      keyboardBehavior="extend"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetView style={styles.sheetContent}>
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

        {/* Content based on mode */}
        {inputMode === "link" ? (
          <View style={styles.linkContainer}>
            <BottomSheetTextInput
              style={[
                styles.linkInput,
                styles.linkNameInput,
                {
                  color: theme.colors.text.default,
                },
              ]}
              placeholder="Link name"
              placeholderTextColor={theme.colors.text.subtle}
              value={linkName}
              onChangeText={setLinkName}
              autoFocus
            />
            <BottomSheetTextInput
              style={[
                styles.linkInput,
                {
                  color: theme.colors.text.default,
                },
              ]}
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
                }}
              >
                Add link
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Text input */}
            <View style={styles.inputContainer}>
              <BottomSheetTextInput
                ref={inputRef as any}
                style={[
                  styles.textInput,
                  {
                    color: theme.colors.text.default,
                  },
                ]}
                placeholder="Share your thoughts..."
                placeholderTextColor={theme.colors.text.subtle}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={2000}
                autoFocus={inputMode === "keyboard"}
              />
            </View>

            {/* GIF grid */}
            {inputMode === "gif" && (
              <View style={styles.gifContainer}>
                <View style={styles.gifGrid}>
                  {SAMPLE_GIFS.map((gif, index) => (
                    <Pressable
                      key={index}
                      onPress={() => handleSelectGif(gif)}
                      style={styles.gifItem}
                    >
                      <View style={styles.gifPlaceholder}>
                        <Text size="xs" mode="subtle">
                          GIF {index + 1}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

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
            <Pressable
              onPress={handlePickImage}
              style={[
                styles.optionButton,
                inputMode === "photo" && styles.optionButtonActive,
              ]}
            >
              <Ionicons
                name="image-outline"
                size={18}
                color={theme.colors.text.subtle}
              />
            </Pressable>
          </View>

          {/* Reply button */}
          <Pressable
            onPress={handleSubmit}
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
      </BottomSheetView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create((theme) => ({
  // Inactive state
  inactiveContainer: {
    backgroundColor: theme.colors.background.default,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  inactiveInput: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
  },
  placeholder: {
    flex: 1,
  },
  inactiveIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  inactiveIconButton: {
    padding: 4,
  },

  // Bottom sheet
  sheetBackground: {
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },

  // Reply banner
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  cancelReply: {
    padding: theme.spacing.xs,
  },

  // Input container
  inputContainer: {
    marginBottom: theme.spacing.sm,
  },
  textInput: {
    fontSize: 14,
    lineHeight: 20,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    minHeight: 80,
    maxHeight: 150,
    textAlignVertical: "top",
  },

  // Link mode
  linkContainer: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  linkInput: {
    fontSize: 16,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 48,
  },
  linkNameInput: {
    fontSize: 18,
    fontWeight: "600",
  },
  addLinkButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.radius.xxl,
    marginTop: theme.spacing.xs,
  },

  // GIF mode
  gifContainer: {
    flex: 1,
    marginBottom: theme.spacing.sm,
  },
  gifGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  gifItem: {
    width: "23%",
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  gifPlaceholder: {
    flex: 1,
    backgroundColor: theme.colors.background.subtle,
    alignItems: "center",
    justifyContent: "center",
  },

  // Options bar
  optionsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
  optionsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  optionButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  optionButtonActive: {
    backgroundColor: theme.colors.background.hover,
  },
  replyButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
  },
}));
