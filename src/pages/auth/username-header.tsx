import { EvilIcons } from "@expo/vector-icons";
import { Platform, Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import type { ApiServer } from "@/src/stores";
import { styles } from "./username-styles";

type UsernameHeaderProps = {
  activeServer: ApiServer;
  insetsTop: number;
  onClose: () => void;
  onOpenServerModal: () => void;
};

export function UsernameHeader({
  activeServer,
  insetsTop,
  onClose,
  onOpenServerModal,
}: UsernameHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <View
      style={[
        styles.header,
        { paddingTop: Platform.OS === "ios" ? 20 : insetsTop },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close sign up"
        onPress={onClose}
        style={styles.closeButton}
        hitSlop={8}
      >
        <EvilIcons name="close" size={36} color={theme.colors.text.default} />
      </Pressable>
      <Pressable onPress={onOpenServerModal}>
        <Text
          size="lg"
          weight="semibold"
          style={{
            color: "#60A5FA",
            textDecorationLine: "underline",
            marginRight: 8,
          }}
        >
          {activeServer}
        </Text>
      </Pressable>
    </View>
  );
}
