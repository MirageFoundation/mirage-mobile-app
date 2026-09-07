import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/primitives";

export function VideoUnavailableOverlay({ visible, onRetry }: { visible: boolean; onRetry: () => void }) {
  if (!visible) return null;
  return (
    <View style={styles.overlay}>
      <Text style={styles.text} accessibilityRole="alert">Video unavailable</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry video"
        onPress={(event) => { event.stopPropagation(); onRetry(); }}
        style={styles.retry}
      >
        <Text style={styles.text}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 20, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "rgba(0,0,0,0.6)" },
  retry: { minHeight: 44, minWidth: 88, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)" },
  text: { color: "#fff" },
});
