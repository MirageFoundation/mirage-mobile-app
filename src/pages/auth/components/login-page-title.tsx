import { Text } from "@/src/components/ui/primitives";
import { Image, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function LoginPageTitle({ isDark }: { isDark: boolean }) {
  return (
    <View style={styles.titleSection}>
      <Image
        source={
          isDark
            ? require("@/assets/images/app-dark-icon.png")
            : require("@/assets/images/app-icon.png")
        }
        style={styles.appIcon}
        resizeMode="contain"
      />
      <Text style={styles.titleText}>Login to Mirage</Text>
      <Text style={styles.subtitleText}>
        Sign in to your existing Mirage account with your 12-word recovery
        phrase:
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  titleSection: {
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  appIcon: {
    width: 44,
    height: 50,
    marginBottom: theme.spacing.md,
  },
  titleText: {
    textAlign: "center",
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30,
  },
  subtitleText: {
    textAlign: "center",
    marginVertical: theme.spacing.md,
    fontSize: theme.typography.size.md,
    color: theme.colors.neutral[600],
  },
}));
