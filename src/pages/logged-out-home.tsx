import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Image,
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Box, Text } from "@/src/components/ui/primitives";
import { useWelcomeStats } from "@/src/api/read/hooks/use-stats";
import { useNodeConfig } from "@/src/api/read/hooks/use-parameters";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useToast } from "@/src/providers/toast-provider";
import { apiClient } from "@/src/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { usePreferencesStore, type ApiServer } from "@/src/stores";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  HEADER_HEIGHT,
  TAB_BAR_HEIGHT,
} from "@/src/providers/scroll-animation-context";

const SERVERS: ApiServer[] = ["mirage.talk", "mirage.vote"];

export function LoggedOutHome() {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: stats } = useWelcomeStats();
  const { data: nodeConfig, refetch: refetchNodeConfig } = useNodeConfig();
  const apiServer = usePreferencesStore((s) => s.apiServer);
  const setApiServer = usePreferencesStore((s) => s.setApiServer);

  const [showRegPopup, setShowRegPopup] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const totalUsers = stats?.registered_users;
  const activeToday = stats?.active_24h;
  const postsToday = stats?.posts_24h;

  const otherServer = SERVERS.find((s) => s !== apiServer) ?? "mirage.vote";

  const handleCreateAccount = useCallback(async () => {
    triggerHaptic("selection");

    if (nodeConfig && !nodeConfig.registration_enabled) {
      setShowRegPopup(true);
      return;
    }

    router.push("/(auth)/username");
  }, [nodeConfig, router]);

  const handleSwitchNode = useCallback(async () => {
    triggerHaptic("selection");
    setIsSwitching(true);

    try {
      const newServer = otherServer;
      console.log("[LoggedOutHome] Switching server to:", newServer);
      apiClient.setBaseUrl(`https://${newServer}`);
      queryClient.clear();
      await queryClient.invalidateQueries();

      const result = await refetchNodeConfig();

      setApiServer(newServer);
      setShowRegPopup(false);
      toast.success(`Switched to ${newServer}`);

      if (result.data?.registration_enabled) {
        router.push("/(auth)/username");
      }
    } finally {
      setIsSwitching(false);
    }
  }, [otherServer, setApiServer, queryClient, refetchNodeConfig, router]);

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

        <View style={styles.statsCardOuter}>
          <LinearGradient
            colors={
              isDark
                ? ["rgba(102,126,234,0.35)", "rgba(118,75,162,0.35)"]
                : ["rgba(102,126,234,0.12)", "rgba(118,75,162,0.12)"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statsGradientBorder}
          >
            <View
              style={[
                styles.statsCard,
                {
                  backgroundColor: isDark
                    ? "rgba(15,15,25,0.92)"
                    : "rgba(255,255,255,0.95)",
                },
              ]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? [
                        "rgba(102,126,234,0.06)",
                        "transparent",
                        "rgba(118,75,162,0.06)",
                      ]
                    : [
                        "rgba(102,126,234,0.04)",
                        "transparent",
                        "rgba(118,75,162,0.04)",
                      ]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statsInnerGlow}
              />

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text
                    style={[
                      styles.statNumber,
                      { color: isDark ? "#A5B4FC" : "rgb(79,70,229)" },
                    ]}
                  >
                    {totalUsers != null ? totalUsers.toLocaleString() : "-"}
                  </Text>
                  <Text style={styles.statLabel}>USERS</Text>
                </View>

                <View
                  style={[
                    styles.statDivider,
                    {
                      backgroundColor: isDark
                        ? "rgba(139,92,246,0.20)"
                        : "rgba(102,126,234,0.15)",
                    },
                  ]}
                />

                <View style={styles.statItem}>
                  <Text
                    style={[
                      styles.statNumber,
                      { color: isDark ? "#6EE7B7" : "#059669" },
                    ]}
                  >
                    {activeToday != null ? activeToday.toLocaleString() : "-"}
                  </Text>
                  <Text style={styles.statLabel}>ACTIVE (24H)</Text>
                </View>

                <View
                  style={[
                    styles.statDivider,
                    {
                      backgroundColor: isDark
                        ? "rgba(139,92,246,0.20)"
                        : "rgba(102,126,234,0.15)",
                    },
                  ]}
                />

                <View style={styles.statItem}>
                  <Text
                    style={[
                      styles.statNumber,
                      { color: isDark ? "#FCD34D" : "#D97706" },
                    ]}
                  >
                    {postsToday != null ? postsToday.toLocaleString() : "-"}
                  </Text>
                  <Text style={styles.statLabel}>POSTS (24H)</Text>
                </View>
              </View>

              <LinearGradient
                colors={["rgb(102,126,234)", "rgb(118,75,162)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.statsAccentBar}
              />
            </View>
          </LinearGradient>
        </View>

        <View style={styles.ctaSection}>
          <Text style={styles.ctaText}>
            Have an invite code? Join the community today.
          </Text>

          <View style={styles.buttonRow}>
            <Pressable
              style={styles.createButton}
              onPress={handleCreateAccount}
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

      <Modal
        visible={showRegPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRegPopup(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowRegPopup(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.background.default },
            ]}
          >
            <View style={styles.modalIconContainer}>
              <Ionicons
                name="alert-circle-outline"
                size={48}
                color={theme.colors.warning[500]}
              />
            </View>
            <Text
              size="lg"
              weight="bold"
              style={{ textAlign: "center", marginBottom: 10 }}
            >
              Registration Unavailable
            </Text>
            <Text
              size="md"
              style={{
                textAlign: "center",
                color: theme.colors.text.subtle,
                marginBottom: 20,
              }}
            >
              Account creation is not available on{" "}
              <Text size="md" weight="semibold">
                {apiServer}
              </Text>
              . Switch to{" "}
              <Text size="md" weight="semibold">
                {otherServer}
              </Text>{" "}
              to create an account.
            </Text>
            <Pressable
              onPress={handleSwitchNode}
              disabled={isSwitching}
              style={[styles.switchButton, { opacity: isSwitching ? 0.7 : 1 }]}
            >
              <LinearGradient
                colors={["rgb(102, 126, 234)", "rgb(118, 75, 162)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.switchButtonGradient}
              >
                {isSwitching ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}
                  >
                    Switch to {otherServer}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => setShowRegPopup(false)}
              disabled={isSwitching}
              style={{ paddingTop: 12, opacity: isSwitching ? 0.3 : 1 }}
            >
              <Text size="md" style={{ color: theme.colors.text.subtle }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
  statsCardOuter: {
    marginBottom: theme.spacing.xl,
    borderRadius: 20,
    shadowColor: "rgb(102,126,234)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  statsGradientBorder: {
    borderRadius: 20,
    padding: 1.5,
  },
  statsInnerGlow: {
    ...({
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 18.5,
    } as const),
  },
  statsHeading: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.text.subtle,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  statsCard: {
    borderRadius: 18.5,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    overflow: "hidden",
    position: "relative",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 40,
    borderRadius: 1,
  },
  statNumber: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: theme.colors.text.subtle,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  statsAccentBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 18.5,
    borderBottomRightRadius: 18.5,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    borderRadius: 20,
    padding: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalIconContainer: {
    marginBottom: 12,
  },
  switchButton: {
    width: "100%",
    marginBottom: 4,
  },
  switchButtonGradient: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
  },
  cancelButton: {
    width: "100%",
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.background.subtle,
    marginTop: 8,
  },
}));
