import { Divider, Text } from "@/src/components/ui/primitives";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function UsernamePageFooter({
  bottomInset,
  onLogin,
}: {
  bottomInset: number;
  onLogin: () => void;
}) {
  return (
    <View style={[styles.footer, { paddingBottom: bottomInset + 16 }]}>
      <Divider size="extraThin" />
      <Pressable onPress={onLogin} style={styles.loginLink}>
        <Text style={styles.loginText}>Log into existing account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  loginLink: {
    alignItems: "center",
    paddingVertical: theme.spacing.md,
  },
  loginText: {
    color: "#60A5FA",
    fontSize: 13,
    fontWeight: "500",
  },
}));
