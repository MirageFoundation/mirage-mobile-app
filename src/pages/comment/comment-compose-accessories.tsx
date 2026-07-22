import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { MentionSuggestions } from "@/src/components/molecules/mention-suggestions";
import { StickerPicker } from "@/src/components/molecules/sticker-picker";
import { MEME_STICKERS } from "@/src/data/stickers";
import {
  Feather,
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image as RNImage,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { styles } from "./comment-compose-styles";
import type { CommentComposeController } from "./use-comment-compose-controller";

export function CommentComposeAccessories({
  controller,
}: {
  controller: CommentComposeController;
}) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const {
    editExpired,
    gifSearchRef,
    giphy,
    handleCloseGifMode,
    handleMentionSelect,
    handleModeChange,
    handlePickImage,
    handleSelectGif,
    handleSpoilerPress,
    handleStickerSelect,
    inputMode,
    isKeyboardVisible,
    mention,
    selectedGifUrl,
    selectedImageUri,
    setShowStickerPicker,
    showStickerPicker,
  } = controller;

  return (
    <>
      <MentionSuggestions
        visible={mention.mentionOpen}
        loading={mention.mentionLoading}
        results={mention.mentionResults}
        query={mention.mentionQuery}
        onClose={mention.closeMention}
        onSelect={handleMentionSelect}
      />

      {inputMode === "gif" && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.gifSection}
        >
          <View
            style={[
              styles.gifDivider,
              { backgroundColor: theme.colors.border.subtle },
            ]}
          />
          <View style={styles.gifSearchRow}>
            <View
              style={[
                styles.gifSearchContainer,
                { backgroundColor: theme.colors.background.subtle },
              ]}
            >
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
                value={giphy.query}
                onChangeText={giphy.setQuery}
                autoFocus
              />
              {giphy.isLoading && (
                <ActivityIndicator size="small" color={theme.colors.text.subtle} />
              )}
            </View>
            <Pressable onPress={handleCloseGifMode} style={styles.gifCloseButton}>
              <Ionicons name="close" size={22} color={theme.colors.text.subtle} />
            </Pressable>
          </View>
          <View style={styles.giphyAttribution}>
            <Text size="xs" mode="subtle">Powered by GIPHY</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gifScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {!giphy.isConfigured && (
              <View style={styles.gifEmptyState}>
                <Text size="sm" mode="subtle" style={{ textAlign: "center" }}>
                  Giphy API key not configured.{"\n"}
                  Set EXPO_PUBLIC_GIPHY_API_KEY
                </Text>
              </View>
            )}
            {giphy.isConfigured && giphy.gifs.length === 0 && !giphy.isLoading && (
              <View style={styles.gifEmptyState}>
                <Text size="sm" mode="subtle">
                  {giphy.query ? `No GIFs found for "${giphy.query}"` : "No trending GIFs"}
                </Text>
              </View>
            )}
            {giphy.gifs.map((gif) => (
              <Pressable
                key={gif.id}
                onPress={() => handleSelectGif(gif.fullUrl)}
                style={[
                  styles.gifItem,
                  selectedGifUrl === gif.fullUrl && styles.gifItemSelected,
                ]}
              >
                <RNImage
                  source={{ uri: gif.previewUrl }}
                  style={styles.gifImage}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {!mention.mentionOpen && (
        <View
          style={[
            styles.toolbar,
            {
              paddingBottom: isKeyboardVisible ? 8 : insets.bottom || 8,
              borderTopColor: theme.colors.border.subtle,
            },
          ]}
        >
          <View
            style={[styles.toolbarLeft, editExpired && { opacity: 0.4 }]}
            pointerEvents={editExpired ? "none" : "auto"}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show keyboard"
              onPress={() => handleModeChange("keyboard")}
              style={[
                styles.toolbarButton,
                inputMode === "keyboard" && { backgroundColor: theme.colors.background.hover },
              ]}
            >
              <FontAwesome5
                name="keyboard"
                size={16}
                color={inputMode === "keyboard" ? theme.colors.text.default : theme.colors.text.subtle}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add link"
              onPress={() => handleModeChange("link")}
              style={[
                styles.toolbarButton,
                inputMode === "link" && { backgroundColor: theme.colors.background.hover },
              ]}
            >
              <Feather
                name="link"
                size={16}
                color={inputMode === "link" ? theme.colors.text.default : theme.colors.text.subtle}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add GIF"
              onPress={() => handleModeChange("gif")}
              style={[
                styles.toolbarButton,
                inputMode === "gif" && { backgroundColor: theme.colors.background.hover },
              ]}
            >
              <MaterialIcons
                name="gif"
                size={22}
                color={inputMode === "gif" ? theme.colors.text.default : theme.colors.text.subtle}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add image"
              onPress={handlePickImage}
              style={styles.toolbarButton}
            >
              <Ionicons name="image-outline" size={18} color={theme.colors.text.subtle} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add sticker"
              onPress={() => {
                triggerHaptic("selection");
                setShowStickerPicker(true);
              }}
              style={styles.toolbarButton}
            >
              <MaterialCommunityIcons
                name="sticker-emoji"
                size={18}
                color={theme.colors.text.subtle}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add content warning"
              onPress={handleSpoilerPress}
              style={styles.toolbarButton}
            >
              <Feather name="eye-off" size={16} color={theme.colors.text.subtle} />
            </Pressable>
          </View>
        </View>
      )}

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
    </>
  );
}
