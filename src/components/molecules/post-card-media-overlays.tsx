import { Text } from "@/src/components/ui/primitives";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type MediaOfflineOverlayProps = {
  visible: boolean;
};

export function MediaOfflineOverlay({ visible }: MediaOfflineOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.processingOverlay}>
      <Ionicons name="cloud-offline-outline" size={32} color="#fff" />
      <Text size="sm" weight="semibold" style={{ color: "#fff", marginTop: 8 }}>
        No internet connection
      </Text>
      <Text size="xs" style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
        Check your network and try again
      </Text>
    </View>
  );
}

type MediaProcessingOverlayProps = {
  visible: boolean;
  isRedgifsVideo: boolean;
};

export function MediaProcessingOverlay({ visible, isRedgifsVideo }: MediaProcessingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.processingOverlay}>
      <ActivityIndicator size="large" color="#fff" />
      <Text size="sm" weight="semibold" style={{ color: "#fff", marginTop: 8 }}>
        {isRedgifsVideo ? "Loading video..." : "Video is still processing."}
      </Text>
      <Text size="xs" style={{ color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
        {isRedgifsVideo ? "Retrying..." : "It may take a few moments."}
      </Text>
    </View>
  );
}

type MediaBlurRevealOverlayProps = {
  visible: boolean;
  onRevealContent?: () => void;
};

export function MediaBlurRevealOverlay({ visible, onRevealContent }: MediaBlurRevealOverlayProps) {
  if (!visible) return null;

  return (
    <Pressable onPress={onRevealContent} style={styles.blurOverlay}>
      {Platform.OS === "ios" ? (
        <BlurView intensity={80} tint="dark" style={styles.blurViewFill}>
          <View style={styles.revealTextContainer}>
            <Ionicons name="eye-outline" size={24} color="#fff" />
            <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
              Tap to reveal
            </Text>
          </View>
        </BlurView>
      ) : (
        <View style={styles.androidBlurOverlay}>
          <Ionicons name="eye-outline" size={24} color="#fff" />
          <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
            Tap to reveal
          </Text>
        </View>
      )}
    </Pressable>
  );
}

type MediaTypeBadgeProps = {
  type: "image" | "gif" | "video" | string;
};

export function MediaTypeBadge({ type }: MediaTypeBadgeProps) {
  if (type === "video") {
    return (
      <View style={styles.videoBadge}>
        <Text size="xs" weight="bold" style={{ color: "#fff" }}>
          VIDEO
        </Text>
      </View>
    );
  }

  if (type === "gif") {
    return (
      <View style={styles.gifBadge}>
        <Text size="xs" weight="bold" style={{ color: "#fff" }}>
          GIF
        </Text>
      </View>
    );
  }

  if (type === "image") {
    return (
      <View style={styles.imageBadge}>
        <Text size="xs" weight="bold" style={{ color: "#fff" }}>
          IMG
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create((theme) => ({
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  blurViewFill: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  revealTextContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  androidBlurOverlay: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 5, 5, 0.97)",
    gap: 8,
  },
  gifBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    zIndex: 20,
  },
  videoBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    zIndex: 20,
  },
  imageBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    zIndex: 20,
  },
}));
