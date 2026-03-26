import { ActivityIndicator, Image as RNImage, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

type CommentComposeAttachmentPreviewProps = {
  uri: string | null;
  isMediaLoading: boolean;
  editable: boolean;
  onRemove: () => void;
  onLoadStart: () => void;
  onLoad: () => void;
  onError: () => void;
};

const PREVIEW_WIDTH = 180;
const PREVIEW_HEIGHT = 140;

export function CommentComposeAttachmentPreview({
  uri,
  isMediaLoading,
  editable,
  onRemove,
  onLoadStart,
  onLoad,
  onError,
}: CommentComposeAttachmentPreviewProps) {
  if (!uri) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.previewContainer}
    >
      <View style={styles.previewWrapper}>
        <RNImage
          source={{ uri }}
          style={styles.previewImage}
          resizeMode="cover"
          onLoadStart={onLoadStart}
          onLoad={onLoad}
          onError={onError}
        />
        {isMediaLoading ? (
          <View style={styles.previewLoadingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : null}
        {editable ? (
          <Pressable onPress={onRemove} style={styles.removeButton}>
            <Feather name="x" size={14} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  previewContainer: {
    marginBottom: theme.spacing.sm,
  },
  previewWrapper: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    position: "relative",
    backgroundColor: theme.colors.background.subtle,
  },
  previewImage: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  },
  previewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
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
}));
