import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { memo } from "react";
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type SensitiveContentOverlayProps = {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export const SensitiveContentOverlay = memo(function SensitiveContentOverlay({
  onPress,
  style,
}: SensitiveContentOverlayProps) {
  return (
    <Pressable onPress={onPress} style={[styles.overlay, style]}>
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
        <View style={styles.androidOverlay}>
          <Ionicons name="eye-outline" size={24} color="#fff" />
          <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
            Tap to reveal
          </Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create(() => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backfaceVisibility: "hidden",
  },
  blurViewFill: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shouldRasterizeIOS: true,
  },
  revealTextContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  androidOverlay: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5, 5, 5, 0.97)",
    gap: 8,
    renderToHardwareTextureAndroid: true,
  },
}));
