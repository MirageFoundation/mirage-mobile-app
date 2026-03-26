import { Pressable, View } from "react-native";
import {
  Feather,
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { triggerHaptic } from "@/src/components/utils/haptics";
import type { InputMode } from "../comment-compose-utils";

type CommentComposeToolbarProps = {
  inputMode: InputMode;
  editExpired: boolean;
  paddingBottom: number;
  onModeChange: (mode: InputMode) => void;
  onPickImage: () => void;
  onOpenStickerPicker: () => void;
  onSpoilerPress: () => void;
};

export function CommentComposeToolbar({
  inputMode,
  editExpired,
  paddingBottom,
  onModeChange,
  onPickImage,
  onOpenStickerPicker,
  onSpoilerPress,
}: CommentComposeToolbarProps) {
  const { theme } = useUnistyles();

  return (
    <View
      style={[
        styles.toolbar,
        {
          paddingBottom,
          borderTopColor: theme.colors.border.subtle,
        },
      ]}
    >
      <View
        style={[styles.toolbarLeft, editExpired && { opacity: 0.4 }]}
        pointerEvents={editExpired ? "none" : "auto"}
      >
        <Pressable
          onPress={() => onModeChange("keyboard")}
          style={[
            styles.toolbarButton,
            inputMode === "keyboard" && {
              backgroundColor: theme.colors.background.hover,
            },
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
        <Pressable
          onPress={() => onModeChange("link")}
          style={[
            styles.toolbarButton,
            inputMode === "link" && {
              backgroundColor: theme.colors.background.hover,
            },
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
        <Pressable
          onPress={() => onModeChange("gif")}
          style={[
            styles.toolbarButton,
            inputMode === "gif" && {
              backgroundColor: theme.colors.background.hover,
            },
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
        <Pressable onPress={onPickImage} style={styles.toolbarButton}>
          <Ionicons
            name="image-outline"
            size={18}
            color={theme.colors.text.subtle}
          />
        </Pressable>
        <Pressable
          onPress={() => {
            triggerHaptic("selection");
            onOpenStickerPicker();
          }}
          style={styles.toolbarButton}
        >
          <MaterialCommunityIcons
            name="sticker-emoji"
            size={18}
            color={theme.colors.text.subtle}
          />
        </Pressable>
        <Pressable onPress={onSpoilerPress} style={styles.toolbarButton}>
          <Feather
            name="eye-off"
            size={16}
            color={theme.colors.text.subtle}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
  },
  toolbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  toolbarButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
}));
