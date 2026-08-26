import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Platform, Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import type { AttachmentType } from "@/src/domain/content";
import { styles } from "./create-screen-styles";

type CreateMediaToolbarProps = {
  keyboardVisible: boolean;
  editExpired: boolean;
  tabBarHeight: number;
  hasAttachment: boolean;
  attachmentType: AttachmentType;
  onLinkPress: () => void;
  onImagePress: () => void;
  onVideoPress: () => void;
  onStickerPress: () => void;
  onSpoilerPress: () => void;
};

export function CreateMediaToolbar({
  keyboardVisible,
  editExpired,
  tabBarHeight,
  hasAttachment,
  attachmentType,
  onLinkPress,
  onImagePress,
  onVideoPress,
  onStickerPress,
  onSpoilerPress,
}: CreateMediaToolbarProps) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const imageDisabled = hasAttachment && attachmentType !== "image";
  const videoDisabled = hasAttachment && attachmentType !== "video";

  return (
    <Animated.View
      style={[
        styles.mediaBar,
        {
          backgroundColor: theme.colors.background.default,
          paddingBottom: keyboardVisible
            ? Platform.OS === "android"
              ? 0
              : 8
            : Platform.OS === "android"
              ? tabBarHeight + 24
              : insets.bottom + tabBarHeight + 8,
        },
      ]}
    >
      <View
        style={[styles.mediaBarContent, editExpired && { opacity: 0.4 }]}
        pointerEvents={editExpired ? "none" : "auto"}
      >
        <Pressable onPress={onLinkPress} disabled={editExpired} style={styles.mediaButton}>
          <Feather name="link" size={22} color={theme.colors.text.default} />
        </Pressable>

        <Pressable
          onPress={onImagePress}
          disabled={imageDisabled}
          style={[styles.mediaButton, imageDisabled && styles.mediaButtonDisabled]}
        >
          <Feather
            name="image"
            size={22}
            color={imageDisabled ? theme.colors.text.subtle : theme.colors.text.default}
          />
        </Pressable>

        <Pressable
          onPress={onVideoPress}
          disabled={videoDisabled}
          style={[styles.mediaButton, videoDisabled && styles.mediaButtonDisabled]}
        >
          <Feather
            name="video"
            size={22}
            color={videoDisabled ? theme.colors.text.subtle : theme.colors.text.default}
          />
        </Pressable>

        <Pressable onPress={onStickerPress} style={styles.mediaButton}>
          <MaterialCommunityIcons
            name="sticker-emoji"
            size={22}
            color={theme.colors.text.default}
          />
        </Pressable>

        <Pressable onPress={onSpoilerPress} style={styles.mediaButton}>
          <Feather name="eye-off" size={22} color={theme.colors.text.default} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
