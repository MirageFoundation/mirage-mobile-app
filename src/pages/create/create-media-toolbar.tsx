import { Pressable, View } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

type CreateMediaToolbarProps = {
  editExpired: boolean;
  hasAttachment: boolean;
  attachmentType: string | null;
  showLinkInput: boolean;
  keyboardPaddingBottom: number;
  backgroundColor: string;
  defaultIconColor: string;
  subtleIconColor: string;
  onLinkPress: () => void;
  onImagePress: () => void;
  onVideoPress: () => void;
  onStickerPress: () => void;
  onSpoilerPress: () => void;
};

export function CreateMediaToolbar({
  editExpired,
  hasAttachment,
  attachmentType,
  showLinkInput,
  keyboardPaddingBottom,
  backgroundColor,
  defaultIconColor,
  subtleIconColor,
  onLinkPress,
  onImagePress,
  onVideoPress,
  onStickerPress,
  onSpoilerPress,
}: CreateMediaToolbarProps) {
  return (
    <View
      style={[
        styles.mediaBar,
        {
          backgroundColor,
          paddingBottom: keyboardPaddingBottom,
        },
      ]}
    >
      <View
        style={[styles.mediaBarContent, editExpired && styles.mediaBarDisabled]}
        pointerEvents={editExpired ? "none" : "auto"}
      >
        <Pressable
          onPress={onLinkPress}
          disabled={editExpired || (hasAttachment && !showLinkInput)}
          style={[
            styles.mediaButton,
            hasAttachment && !showLinkInput && styles.mediaButtonDisabled,
          ]}
        >
          <Feather
            name="link"
            size={22}
            color={
              hasAttachment && !showLinkInput ? subtleIconColor : defaultIconColor
            }
          />
        </Pressable>

        <Pressable
          onPress={onImagePress}
          disabled={hasAttachment && attachmentType !== "image"}
          style={[
            styles.mediaButton,
            hasAttachment && attachmentType !== "image" && styles.mediaButtonDisabled,
          ]}
        >
          <Feather
            name="image"
            size={22}
            color={
              hasAttachment && attachmentType !== "image"
                ? subtleIconColor
                : defaultIconColor
            }
          />
        </Pressable>

        <Pressable
          onPress={onVideoPress}
          disabled={hasAttachment && attachmentType !== "video"}
          style={[
            styles.mediaButton,
            hasAttachment && attachmentType !== "video" && styles.mediaButtonDisabled,
          ]}
        >
          <Feather
            name="video"
            size={22}
            color={
              hasAttachment && attachmentType !== "video"
                ? subtleIconColor
                : defaultIconColor
            }
          />
        </Pressable>

        <Pressable onPress={onStickerPress} style={styles.mediaButton}>
          <MaterialCommunityIcons
            name="sticker-emoji"
            size={22}
            color={defaultIconColor}
          />
        </Pressable>

        <Pressable onPress={onSpoilerPress} style={styles.mediaButton}>
          <Feather name="eye-off" size={22} color={defaultIconColor} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  mediaBar: {
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  mediaBarContent: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  mediaBarDisabled: {
    opacity: 0.4,
  },
  mediaButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaButtonDisabled: {
    opacity: 0.4,
  },
}));
