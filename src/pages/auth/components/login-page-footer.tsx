import { Text } from "@/src/components/ui/primitives";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

interface LoginPageFooterProps {
  bottomInset: number;
  onCreateAccount: () => void;
}

export function LoginPageFooter({
  bottomInset,
  onCreateAccount,
}: LoginPageFooterProps) {
  return (
    <View style={[styles.footer, { paddingBottom: bottomInset + 16 }]}>
      <View style={styles.divider} />
      <Pressable onPress={onCreateAccount} style={styles.createAccountButton}>
        <Text style={styles.createAccountText}>Create a new account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: {
    paddingHorizontal: theme.spacing.lg,
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border.subtle,
    width: "100%",
  },
  createAccountButton: {
    paddingTop: theme.spacing.md,
  },
  createAccountText: {
    color: "#60A5FA",
    fontSize: 13,
    fontWeight: "500",
  },
}));
