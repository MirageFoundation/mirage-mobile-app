import type { RefObject } from "react";
import { ActivityIndicator, Image as RNImage, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather, Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type GifItem = {
  id: string;
  previewUrl: string;
  fullUrl: string;
};

type CommentComposeGifSectionProps = {
  visible: boolean;
  gifSearchRef: RefObject<TextInput | null>;
  gifSearch: string;
  gifs: GifItem[];
  isLoadingGifs: boolean;
  isGiphyConfigured: boolean;
  selectedGifUrl: string | null;
  onChangeSearch: (value: string) => void;
  onClose: () => void;
  onSelectGif: (gifUrl: string) => void;
};

export function CommentComposeGifSection({
  visible,
  gifSearchRef,
  gifSearch,
  gifs,
  isLoadingGifs,
  isGiphyConfigured,
  selectedGifUrl,
  onChangeSearch,
  onClose,
  onSelectGif,
}: CommentComposeGifSectionProps) {
  const { theme } = useUnistyles();

  if (!visible) {
    return null;
  }

  return (
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
            value={gifSearch}
            onChangeText={onChangeSearch}
            autoFocus
          />
          {isLoadingGifs ? (
            <ActivityIndicator size="small" color={theme.colors.text.subtle} />
          ) : null}
        </View>
        <Pressable onPress={onClose} style={styles.gifCloseButton}>
          <Ionicons
            name="close"
            size={22}
            color={theme.colors.text.subtle}
          />
        </Pressable>
      </View>
      <View style={styles.giphyAttribution}>
        <Text size="xs" mode="subtle">
          Powered by GIPHY
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.gifScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {!isGiphyConfigured ? (
          <View style={styles.gifEmptyState}>
            <Text size="sm" mode="subtle" style={{ textAlign: "center" }}>
              Giphy API key not configured.{"\n"}
              Set EXPO_PUBLIC_GIPHY_API_KEY
            </Text>
          </View>
        ) : null}
        {isGiphyConfigured && gifs.length === 0 && !isLoadingGifs ? (
          <View style={styles.gifEmptyState}>
            <Text size="sm" mode="subtle">
              {gifSearch
                ? `No GIFs found for "${gifSearch}"`
                : "No trending GIFs"}
            </Text>
          </View>
        ) : null}
        {gifs.map((gif) => (
          <Pressable
            key={gif.id}
            onPress={() => onSelectGif(gif.fullUrl)}
            style={[
              styles.gifItem,
              selectedGifUrl === gif.fullUrl && styles.gifItemSelected,
              selectedGifUrl === gif.fullUrl
                ? { borderColor: theme.colors.brand[500] }
                : null,
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
  );
}

const styles = StyleSheet.create((theme) => ({
  gifSection: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  gifDivider: {
    height: 1,
    marginHorizontal: -theme.spacing.md,
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
  gifItemSelected: {},
  gifImage: {
    width: "100%",
    height: "100%",
  },
}));
