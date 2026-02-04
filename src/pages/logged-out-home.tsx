import { useRouter } from "expo-router";
import { Image, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Box, Text } from "@/src/components/ui/primitives";
import { useAppStats } from "@/src/api/read/hooks/use-stats";
import { LinearGradient } from "expo-linear-gradient";
import {
  HEADER_HEIGHT,
  TAB_BAR_HEIGHT,
} from "@/src/providers/scroll-animation-context";

export function LoggedOutHome() {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: stats } = useAppStats();

  const totalUsers = stats?.total_users;
  const activeToday = stats?.dau_today;
  const postsToday = stats?.total_posts;

  return (
    <Box flex background="base">
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <Image
            source={
              isDark
                ? require("@/assets/images/app-dark-icon.png")
                : require("@/assets/images/app-icon.png")
            }
            style={styles.appIcon}
            resizeMode="contain"
          />
          <Text size="xxl" weight="bold">
            Mirage
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + HEADER_HEIGHT + 24,
          paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24,
          paddingHorizontal: theme.spacing.lg,
          flexGrow: 1,
          justifyContent: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.title}>
            Welcome to Mirage <Text style={styles.betaBadge}>BETA</Text>
          </Text>

          <Text style={[styles.subtitle, { color: theme.colors.brand[500] }]}>
            Currently in Private Beta — Invite Only
          </Text>

          <Text style={styles.description}>
            Mirage is a fully decentralized social network built on its own
            blockchain, designed to be 100% censorship resistant. Your posts,
            votes, and identity live on-chain — no central authority can silence
            you.
          </Text>

          <Pressable
            onPress={() => Linking.openURL("https://mirage.foundation")}
          >
            <Text
              style={[styles.learnMore, { color: theme.colors.text.default }]}
            >
              Learn more about our mission
            </Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.statsContainer,
            { backgroundColor: theme.colors.background.subtle },
          ]}
        >
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {totalUsers != null ? totalUsers.toLocaleString() : "-"}
            </Text>
            <Text style={styles.statLabel}>USERS</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {activeToday != null ? activeToday.toLocaleString() : "-"}
            </Text>
            <Text style={styles.statLabel}>ACTIVE (24H)</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {postsToday != null ? postsToday.toLocaleString() : "-"}
            </Text>
            <Text style={styles.statLabel}>POSTS (24H)</Text>
          </View>
        </View>

        <View style={styles.ctaSection}>
          <Text style={styles.ctaText}>
            Have an invite code? Join the community today.
          </Text>

         <View style={styles.buttonRow}>
            <Pressable
              style={styles.createButton}
              onPress={() => router.push("/(auth)/username")}
            >
              <LinearGradient
                colors={["rgb(102, 126, 234)", "rgb(118, 75, 162)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.createButtonGradient}
              >
                <Text style={styles.createButtonText}>Create Account</Text>
              </LinearGradient>
            </Pressable>

            <Pressable
              style={[
                styles.signInButton,
                {
                  backgroundColor: theme.colors.background.subtle,
                  borderColor: theme.colors.border.subtle,
                },
              ]}
              onPress={() => router.push("/(auth)/login")}
            >
              <Text style={styles.signInButtonText}>Sign In</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  statusBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background.default,
    zIndex: 101,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background.default,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border.subtle,
    zIndex: 100,
  },
  headerContent: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  appIcon: {
    width: 22,
    height: 22,
    marginRight: 6,
  },
  content: {
    alignItems: "center",
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 28,
    lineHeight: 38,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  betaBadge: {
    fontSize: 14,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    color: theme.colors.text.subtle,
    marginBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  learnMore: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    lineHeight: 34,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: theme.colors.text.subtle,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  ctaSection: {
    alignItems: "center",
  },
  ctaText: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.text.subtle,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  buttonRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    width: "100%",
  },
createButton: {
 flex: 1,
},
createButtonGradient: {
  height: 54,
 alignItems: "center",
  justifyContent: "center",
  borderRadius: theme.radius.lg,
},
 createButtonText: {
   color: "#FFFFFF",
   fontSize: 16,
   lineHeight: 22,
   fontWeight: "600",
 },
 signInButton: {
   flex: 1,
    height: 54,
   borderRadius: theme.radius.lg,
   alignItems: "center",
    justifyContent: "center",
   borderWidth: 1,
 },
  signInButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
}));
