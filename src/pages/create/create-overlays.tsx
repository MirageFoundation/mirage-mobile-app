import { ActivityIndicator, View } from "react-native";
import { BlurView } from "expo-blur";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

import { styles } from "./create-screen-styles";

type CreateShareProcessingOverlayProps = {
  visible: boolean;
};

export function CreateShareProcessingOverlay({ visible }: CreateShareProcessingOverlayProps) {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  if (!visible) return null;

  return (
    <View style={styles.shareLinkOverlay}>
      <BlurView
        intensity={50}
        tint={isDark ? "dark" : "light"}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
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
        <ActivityIndicator size="large" color={isDark ? "#fff" : theme.colors.brand[500]} />
        <Text size="lg" weight="bold" style={styles.shareLinkOverlayTitle}>
          Extracting Content
        </Text>
        <Text size="sm" style={styles.shareLinkOverlayText}>
          Fetching media from shared link...
        </Text>
      </View>
    </View>
  );
}

type CreatePreparingOverlayProps = {
  visible: boolean;
};

export function CreatePreparingOverlay({ visible }: CreatePreparingOverlayProps) {
  if (!visible) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
}
