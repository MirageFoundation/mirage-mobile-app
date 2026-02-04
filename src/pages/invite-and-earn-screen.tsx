import { EvilIcons, Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAuthStore, usePreferencesStore, getShareBaseUrl } from "@/src/stores";

// Referral Link Card Component
const ReferralLinkCard = ({
  label,
  link,
  onCopy,
}: {
  label: string;
  link: string;
  onCopy: (link: string) => void;
}) => {
  const { theme } = useUnistyles();
  const [copied, setCopied] = useState(false);
  const scale = useSharedValue(1);

  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(link);
      triggerHaptic("success");
      setCopied(true);

      // Animate the button
      scale.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withTiming(1, { duration: 100 })
      );

      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000);
      onCopy(link);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, [link, onCopy, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.linkCard}>
      <Text size="sm" weight="medium" mode="subtle" style={styles.linkLabel}>
        {label}
      </Text>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={handleCopy}
          style={({ pressed }) => [
            styles.linkContainer,
            {
              backgroundColor: theme.colors.background.subtle,
              borderColor: copied
                ? theme.colors.success[500]
                : theme.colors.border.subtle,
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text
            size="sm"
            weight="regular"
            numberOfLines={1}
            style={styles.linkText}
          >
            {link}
          </Text>
          <View
            style={[
              styles.copyButton,
              {
                backgroundColor: copied
                  ? theme.colors.success[500]
                  : theme.colors.brand[500],
              },
            ]}
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={16}
              color="#FFFFFF"
            />
          </View>
        </Pressable>
      </Animated.View>
      {copied && (
        <Text size="xs" mode="success" style={styles.copiedText}>
          Link copied to clipboard!
        </Text>
      )}
    </View>
  );
};

// Bullet Point Component
const BulletPoint = ({ children }: { children: React.ReactNode }) => {
  const { theme } = useUnistyles();

  return (
    <View style={styles.bulletContainer}>
      <View
        style={[styles.bullet, { backgroundColor: theme.colors.brand[500] }]}
      />
      <Text size="sm" weight="regular" style={styles.bulletText}>
        {children}
      </Text>
    </View>
  );
};

// Gradient color schemes for different stat types
const STAT_THEMES = {
  pending: {
    gradient: ["#F59E0B", "#D97706", "#B45309"] as const,
    iconBg: "rgba(251, 191, 36, 0.2)",
    icon: "time-outline" as const,
    glow: "#F59E0B",
  },
  paid: {
    gradient: ["#10B981", "#059669", "#047857"] as const,
    iconBg: "rgba(16, 185, 129, 0.2)",
    icon: "checkmark-circle-outline" as const,
    glow: "#10B981",
  },
  referrals: {
    gradient: ["#8B5CF6", "#7C3AED", "#6D28D9"] as const,
    iconBg: "rgba(139, 92, 246, 0.2)",
    icon: "people-outline" as const,
    glow: "#8B5CF6",
  },
};

// Creative Stats Card Component with Gradients
const StatsCard = ({
  type,
  label,
  value,
  unit,
  subtitle,
}: {
  type: "pending" | "paid" | "referrals";
  label: string;
  value: string;
  unit?: string;
  subtitle?: string;
}) => {
  const { theme } = useUnistyles();
  const statTheme = STAT_THEMES[type];

  return (
    <View style={styles.statsCardWrapper}>
      {/* Glow effect */}
      <View
        style={[
          styles.statsCardGlow,
          { backgroundColor: statTheme.glow, opacity: 0.08 },
        ]}
      />
      <View
        style={[
          styles.statsCard,
          {
            backgroundColor: theme.colors.background.default,
            borderColor: `${statTheme.glow}30`,
          },
        ]}
      >
        {/* Header with icon */}
        <View style={styles.statsCardHeader}>
          <Text size="md" weight="medium" mode="subtle">
            {label}
          </Text>
        </View>

        {/* Value */}
        <View style={styles.statsValueContainer}>
          <Text
            size="mega"
            weight="bold"
            style={{ color: statTheme.gradient[0] }}
          >
            {value}
          </Text>
          {unit && (
            <Box
              flex
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Text
                size="sm"
                weight="medium"
                style={{ color: statTheme.gradient[0] }}
              >
                {unit}
              </Text>
              {subtitle && (
                <Text size="sm" mode="subtle">
                  {subtitle}
                </Text>
              )}
            </Box>
          )}
        </View>

        {/* Bottom accent bar */}
        <LinearGradient
          colors={[...statTheme.gradient, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.statsAccentBar}
        />
      </View>
    </View>
  );
};

export function InviteAndEarnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const user = useAuthStore((s) => s.user);
  const shareServer = usePreferencesStore((s) => s.shareServer);

  // Generate referral links based on user ID
  const userId = user?.id || "user123";
  const shareBaseUrl = getShareBaseUrl(shareServer);
  const referralLink1 = `${shareBaseUrl}/r/${userId}`;
  const referralLink2 = `${shareBaseUrl}/invite/${userId}`;

  // Mock stats data
  const stats = {
    pending: "0.00",
    paid: "0.00",
    referrals: 0,
  };

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  const handleCopyLink = useCallback((link: string) => {
    console.log("Copied link:", link);
  }, []);

  return (
    <Box flex background="base">
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <EvilIcons name="close" size={28} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="medium">
          Invite & Earn
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View
            style={[
              styles.heroIconContainer,
              { backgroundColor: `${theme.colors.brand[500]}15` },
            ]}
          >
            <Ionicons name="gift" size={40} color={theme.colors.brand[500]} />
          </View>
          <Text size="xxl" weight="bold" style={styles.heroTitle}>
            Earn MIRAGE by Inviting Friends
          </Text>
          <Text size="sm" mode="subtle" style={styles.heroSubtitle}>
            Share your referral links and earn rewards up to 5 levels deep
          </Text>
        </View>

        {/* Referral Links Section */}
        <View style={styles.section}>
          <Text size="md" weight="semibold" style={styles.sectionTitle}>
            Your Referral Links
          </Text>
          <ReferralLinkCard
            label="Link #1"
            link={referralLink1}
            onCopy={handleCopyLink}
          />
          <ReferralLinkCard
            label="Link #2"
            link={referralLink2}
            onCopy={handleCopyLink}
          />
        </View>

        {/* How It Works Section */}
        <View style={styles.section}>
          <Text size="md" weight="semibold" style={styles.sectionTitle}>
            How It Works
          </Text>
          <View
            style={[
              styles.howItWorksCard,
              {
                backgroundColor: theme.colors.background.subtle,
                borderColor: theme.colors.border.subtle,
              },
            ]}
          >
            <BulletPoint>Share your referral link with friends</BulletPoint>
            <BulletPoint>
              Earn 1 MIRAGE for each day a direct referral posts or comments (L1
              = 1x)
            </BulletPoint>
            <BulletPoint>
              Earn 0.5 MIRAGE for each day their referrals post (L2 = 0.5x)
            </BulletPoint>
            <BulletPoint>
              Earn 0.25, 0.125, 0.0625 for L3, L4, L5 respectively
            </BulletPoint>
            <BulletPoint>Max 10 active days count per referral</BulletPoint>
            <BulletPoint>
              Rewards are reviewed weekly and paid out after approval
            </BulletPoint>
          </View>
        </View>

        {/* Example Section */}
        <View style={styles.section}>
          <Text size="md" weight="semibold" style={styles.sectionTitle}>
            Example
          </Text>
          <View
            style={[
              styles.exampleCard,
              {
                backgroundColor: `${theme.colors.brand[500]}08`,
                borderColor: `${theme.colors.brand[500]}30`,
              },
            ]}
          >
            <Ionicons
              name="calculator-outline"
              size={24}
              color={theme.colors.brand[500]}
              style={styles.exampleIcon}
            />
            <Text size="sm" weight="regular" style={styles.exampleText}>
              You invite Alice and Bob. Alice is active for 5 days and invites
              Carol, who is active for 3 days.
            </Text>
            <View style={styles.exampleCalc}>
              <Text size="sm" weight="medium" mode="brand">
                You earn: (5 × 1) + (5 × 1) + (3 × 0.5) = 11.5 MIRAGE
              </Text>
            </View>
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.section}>
          <Text size="md" weight="semibold" style={styles.sectionTitle}>
            Your Rewards
          </Text>
          <View style={styles.statsRow}>
            <StatsCard
              type="pending"
              label="Pending"
              value={stats.pending}
              unit="MIRAGE"
            />
            <StatsCard
              type="paid"
              label="Paid"
              value={stats.paid}
              unit="MIRAGE"
            />
          </View>
          <StatsCard
            type="referrals"
            label="Referrals"
            value={String(stats.referrals)}
            unit="USERS"
            subtitle="across all levels"
          />
          <Text size="sm" weight="thin" mode="subtle" style={styles.emptyText}>
            No referrals yet. Share your link to get started!
          </Text>
        </View>

        {/* Important Note Section */}
        <View style={styles.section}>
          <View
            style={[
              styles.warningCard,
              {
                backgroundColor: `${theme.colors.warning[500]}10`,
                borderColor: `${theme.colors.warning[500]}40`,
              },
            ]}
          >
            <View style={styles.warningHeader}>
              <Ionicons
                name="warning"
                size={20}
                color={theme.colors.warning[500]}
              />
              <Text size="md" weight="semibold" mode="warning">
                Important Note
              </Text>
            </View>
            <Text size="sm" weight="regular" style={styles.warningText}>
              Creating fake accounts (sockpuppets) to game the referral system
              is strictly prohibited. All referred accounts are reviewed for
              authenticity. If sockpuppet activity is detected, your account
              will be suspended and all pending rewards will be forfeited. Only
              invite real people who will genuinely participate in Mirage.
            </Text>
          </View>
        </View>
      </ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: theme.spacing.lg,
  },
  heroIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  heroTitle: {
    textAlign: "center",
    marginBottom: theme.spacing.xs,
  },
  heroSubtitle: {
    textAlign: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    marginBottom: theme.spacing.sm,
  },
  linkCard: {
    marginBottom: theme.spacing.sm,
  },
  linkLabel: {
    marginBottom: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  linkText: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  copyButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  copiedText: {
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  howItWorksCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  bulletContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    marginRight: theme.spacing.sm,
  },
  bulletText: {
    flex: 1,
  },
  exampleCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  exampleIcon: {
    marginBottom: theme.spacing.sm,
  },
  exampleText: {
    marginBottom: theme.spacing.sm,
  },
  exampleCalc: {
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(66, 133, 244, 0.2)",
  },
  statsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  statsCardWrapper: {
    flex: 1,
    position: "relative",
  },
  statsCardGlow: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: -4,
    borderRadius: theme.radius.xl,
    transform: [{ scale: 1.02 }],
  },
  statsCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  statsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  statsIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  statsValueContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing.xs,
  },

  statsAccentBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  emptyState: {
    alignItems: "center",
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    marginTop: theme.spacing.sm,
  },
  emptyText: {
    marginTop: theme.spacing.xs,
    textAlign: "left",
  },
  warningCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  warningText: {
    lineHeight: 18,
  },
}));
