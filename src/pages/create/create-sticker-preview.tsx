import { Feather } from "@expo/vector-icons";
import { Image, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { useCreateComposeState } from "./create-compose-state";
import { styles } from "./create-screen-styles";

type CreateStickerPreviewProps = {
  editExpired: boolean;
};

export function CreateStickerPreview({
  editExpired,
}: CreateStickerPreviewProps) {
  const { theme } = useUnistyles();
  const selectedStickers = useCreateComposeState((state) => state.selectedStickers);
  const removeSticker = useCreateComposeState((state) => state.removeSticker);

  if (selectedStickers.length === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.videoPreviewContainer}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {selectedStickers.map((url) => (
          <View
            key={url}
            style={[
              styles.videoPlayerWrapper,
              { height: 140, width: 140, backgroundColor: theme.colors.background.subtle },
            ]}
          >
            <Image
              source={{ uri: url }}
              style={[styles.videoPlayer, { resizeMode: "contain" }]}
            />
            {!editExpired && (
              <Pressable
                onPress={() => removeSticker(url)}
                style={[styles.videoRemoveButton, { top: 4, right: 4 }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={styles.removeButtonInner}>
                  <Feather name="x" size={18} color="#fff" />
                </View>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}
