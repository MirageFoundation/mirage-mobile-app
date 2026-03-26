import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

type CreateStickerPreviewProps = {
  stickers: string[];
  editExpired: boolean;
  backgroundColor: string;
  onRemoveSticker: (url: string) => void;
};

export function CreateStickerPreview({
  stickers,
  editExpired,
  backgroundColor,
  onRemoveSticker,
}: CreateStickerPreviewProps) {
  if (stickers.length === 0) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.previewContainer}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {stickers.map((url) => (
          <View
            key={url}
            style={[
              styles.previewCard,
              { height: 140, width: 140, backgroundColor },
            ]}
          >
            <Image source={{ uri: url }} style={styles.previewImage} contentFit="contain" />
            {!editExpired ? (
              <Pressable
                onPress={() => onRemoveSticker(url)}
                style={styles.removeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.removeButtonInner}>
                  <Feather name="x" size={18} color="#fff" />
                </View>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create(() => ({
  previewContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  scrollContent: {
    gap: 8,
    paddingHorizontal: 16,
  },
  previewCard: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  removeButton: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  removeButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
}));
