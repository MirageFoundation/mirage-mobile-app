import { Text } from "@/src/components/ui/primitives";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function LoginErrorMessage({ message }: { message: string | null }) {
  const { theme } = useUnistyles();

  if (!message) {
    return null;
  }

  return (
    <View style={styles.errorContainer}>
      <Ionicons
        name="alert-circle"
        size={18}
        color={theme.colors.error[500]}
      />
      <Text
        size="sm"
        style={{ color: theme.colors.error[500], marginLeft: 8 }}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
}));
