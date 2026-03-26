import { ActivityIndicator, View } from "react-native";
import { BlurView } from "expo-blur";

import { Text } from "@/src/components/ui/primitives";

type CreateProcessingOverlaysProps = {
  isProcessingShareLink: boolean;
  isPreparingVideo: boolean;
  isDark: boolean;
  brandColor: string;
};

export function CreateProcessingOverlays({
  isProcessingShareLink,
  isPreparingVideo,
  isDark,
  brandColor,
}: CreateProcessingOverlaysProps) {
  return (
    <>
      {isProcessingShareLink ? (
        <View style={styles.shareLinkOverlay}>
          <BlurView
            intensity={50}
            tint={isDark ? "dark" : "light"}
            style={styles.absoluteFill}
          />
          <View
            style={[
              styles.shareLinkOverlayContent,
              {
                backgroundColor: isDark
                  ? "rgba(25, 25, 25, 0.98)"
                  : "rgba(255, 255, 255, 0.98)",
              },
            ]}
          >
            <ActivityIndicator size="large" color={isDark ? "#fff" : brandColor} />
            <Text size="lg" weight="bold" style={styles.shareLinkOverlayTitle}>
              Extracting Content
            </Text>
            <Text size="sm" style={styles.shareLinkOverlayText}>
              Fetching media from shared link...
            </Text>
          </View>
        </View>
      ) : null}

      {isPreparingVideo ? (
        <View style={styles.preparingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : null}
    </>
  );
}

const styles = {
  absoluteFill: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shareLinkOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  shareLinkOverlayContent: {
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: "center" as const,
    maxWidth: 280,
  },
  shareLinkOverlayTitle: {
    marginTop: 16,
    textAlign: "center" as const,
  },
  shareLinkOverlayText: {
    marginTop: 6,
    textAlign: "center" as const,
  },
  preparingOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
};
