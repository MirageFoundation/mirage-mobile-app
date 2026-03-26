import { Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

type CreateImagePreviewProps = {
  mediaUris: string[];
  editExpired: boolean;
  onRemoveImage: (uri: string) => void;
};

export function CreateImagePreview({
  mediaUris,
  editExpired,
  onRemoveImage,
}: CreateImagePreviewProps) {
  if (mediaUris.length === 0) {
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
        {mediaUris.map((uri) => (
          <View key={uri} style={[styles.previewCard, { height: 200, width: 200 }]}>
            <Image
              source={{ uri }}
              style={styles.previewImage}
              contentFit="cover"
            />
            <View style={styles.mediaTypeBadge}>
              <Feather name="image" size={12} color="#fff" />
            </View>
            {!editExpired ? (
              <Pressable
                onPress={() => onRemoveImage(uri)}
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
    backgroundColor: "#000",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  mediaTypeBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 20,
  },
  removeButton: {
    position: "absolute",
    top: 12,
    right: 12,
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
