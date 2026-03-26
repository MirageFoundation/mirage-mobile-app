import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import { Text } from "@/src/components/ui/primitives";

export function AnnotateHeader({
  canSubmit,
  insetsTop,
  onBack,
  onSubmit,
  subtleBackground,
  subtleTextColor,
  textColor,
}: {
  canSubmit: boolean;
  insetsTop: number;
  onBack: () => void;
  onSubmit: () => void;
  subtleBackground: string;
  subtleTextColor: string;
  textColor: string;
}) {
  return (
    <View style={[styles.header, { paddingTop: insetsTop, borderBottomColor: subtleBackground }]}> 
      <View style={[styles.headerTitleAbsolute, { paddingTop: insetsTop, paddingBottom: 12 }]} pointerEvents="none">
        <Text size="lg" weight="bold">
          Annotate Post
        </Text>
      </View>
      <Pressable onPress={onBack} style={styles.headerButton}>
        <Ionicons name="close" size={28} color={textColor} />
      </Pressable>
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={onSubmit}
        disabled={!canSubmit}
        style={[
          styles.postButton,
          { backgroundColor: canSubmit ? "#EF4444" : subtleBackground },
        ]}
      >
        <Text size="sm" weight="bold" style={{ color: canSubmit ? "#FFFFFF" : subtleTextColor }}>
          Submit
        </Text>
      </Pressable>
    </View>
  );
}

const styles = {
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerTitleAbsolute: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  postButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
};
