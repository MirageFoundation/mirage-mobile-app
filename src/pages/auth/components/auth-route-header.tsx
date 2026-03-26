import { EvilIcons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type AuthRouteHeaderProps = {
  topInset: number;
  onClose: () => void;
  serverLabel?: string;
  onServerPress?: () => void;
};

export function AuthRouteHeader({
  topInset,
  onClose,
  serverLabel,
  onServerPress,
}: AuthRouteHeaderProps) {
  const { theme } = useUnistyles();

  return (
    <View style={[styles.header, { paddingTop: topInset }]}> 
      <Pressable onPress={onClose} style={styles.closeButton}>
        <EvilIcons name="close" size={36} color={theme.colors.text.default} />
      </Pressable>
      {serverLabel && onServerPress ? (
        <Pressable onPress={onServerPress}>
          <Text size="lg" weight="semibold" style={styles.serverText}>
            {serverLabel}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.serverPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  serverText: {
    color: "#60A5FA",
    textDecorationLine: "underline",
    marginRight: 8,
  },
  serverPlaceholder: {
    width: 44,
    height: 44,
  },
}));
