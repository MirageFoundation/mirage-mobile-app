import { Text } from "@/src/components/ui/primitives";
import { Image, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function UsernamePageHero({
  isDark,
  inviteCodeRequired,
}: {
  isDark: boolean;
  inviteCodeRequired: boolean;
}) {
  return (
    <>
      <View style={styles.iconContainer}>
        <Image
          source={
            isDark
              ? require("@/assets/images/app-dark-icon.png")
              : require("@/assets/images/app-icon.png")
          }
          style={styles.appIcon}
          resizeMode="contain"
        />
      </View>

      <View style={styles.titleContainer}>
        <Text style={styles.titleText}>Hello Friend,</Text>
        <Text style={styles.titleText}>welcome to Mirage</Text>
      </View>

      <Text style={styles.subtitle}>
        {inviteCodeRequired
          ? "Pick a username and enter your invite code to join"
          : "Pick a username to join"}
      </Text>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  iconContainer: {
    alignItems: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  appIcon: {
    width: 44,
    height: 50,
  },
  titleContainer: {
    alignItems: "center",
    marginTop: theme.spacing.sm,
  },
  titleText: {
    textAlign: "center",
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30,
  },
  subtitle: {
    textAlign: "center",
    marginVertical: theme.spacing.lg,
    fontSize: 16,
    color: theme.colors.neutral[600],
    paddingHorizontal: theme.spacing.lg,
  },
}));
