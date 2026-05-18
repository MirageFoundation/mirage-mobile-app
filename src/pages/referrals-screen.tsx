import { EvilIcons, Ionicons, Feather } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "@/src/navigation/guarded-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState, useMemo, useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  View,
  Share,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  useAuthStore,
  usePreferencesStore,
  getShareBaseUrl,
} from "@/src/stores";
import { useReferralSummary } from "@/src/api/read/hooks";
import { useUserStatus } from "@/src/api/read/hooks/use-user-status";
import { useNodeConfig } from "@/src/api/read/hooks/use-parameters";
import { referralPrecheckOptIn } from "@/src/api/write";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { useToast } from "@/src/providers/toast-provider";
import type { ReferralSummaryItem } from "@/src/api/types";

type ReferralPeriod = "7d" | "30d" | "this_month" | "last_month";

const PERIOD_LABELS: Record<ReferralPeriod, string> = {
  "7d": "7 Days",
  "30d": "30 Days",
  this_month: "This Month",
  last_month: "Last Month",
};

function getPeriodParams(period: ReferralPeriod) {
  if (period === "7d") return { period: "7d" as const };
  if (period === "30d") return { period: "30d" as const };
  const now = new Date();
  if (period === "this_month") {
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return { period: "month" as const, month };
  }
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  return { period: "month" as const, month };
}

const SkeletonBox = ({
  width,
  height,
  borderRadius,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
}) => {
  const { theme } = useUnistyles();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: borderRadius ?? theme.radius.sm,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

const ReferralItem = ({ item }: { item: ReferralSummaryItem }) => {
  const { theme } = useUnistyles();
  const isRealUser = item.total_actions >= 10;
  const referredDate = new Date(item.referred_at * 1000);
  const dateStr = `${referredDate.getMonth() + 1}/${referredDate.getDate()}/${referredDate.getFullYear()}`;

  return (
    <View
      style={[
        styles.referralItem,
        {
          backgroundColor: theme.colors.background.default,
          borderColor: theme.colors.border.subtle,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text size="md" weight="semibold">
            {item.username || item.address.slice(0, 12) + "..."}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: isRealUser ? theme.colors.success[500] + "20" : theme.colors.background.subtle }]}>
            <View style={[styles.statusDot, { backgroundColor: isRealUser ? theme.colors.success[500] : theme.colors.text.subtle }]} />
            <Text size="xs" weight="medium" style={{ color: isRealUser ? theme.colors.success[500] : theme.colors.text.subtle }}>
              {isRealUser ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>
        <Text size="sm" mode="subtle">
          Joined {dateStr}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ alignItems: "center" }}>
          <Text size="sm" weight="semibold">{item.posts}</Text>
          <Text size="xs" mode="subtle">Posts</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text size="sm" weight="semibold">{item.votes}</Text>
          <Text size="xs" mode="subtle">Votes</Text>
        </View>
      </View>
    </View>
  );
};

export function ReferralsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: userStatus, refetch: refetchUserStatus } = useUserStatus();
  const { data: nodeConfig } = useNodeConfig();
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const username = useAuthStore((s) => s.user?.username);
  const shareServer = usePreferencesStore((s) => s.apiServer);

  const inviteCodeRequired = nodeConfig?.registration_invite_code_required ?? false;
  const precheckEnabled = userStatus?.referral_precheck_enabled ?? false;
  const [toggleLoading, setToggleLoading] = useState(false);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const effectiveEnabled = optimisticEnabled ?? precheckEnabled;
  const [linkCopied, setLinkCopied] = useState(false);

  const [referralPeriod, setReferralPeriod] = useState<ReferralPeriod>("7d");
  const periodParams = useMemo(() => getPeriodParams(referralPeriod), [referralPeriod]);
  const { data: referralData, isLoading: referralsLoading, refetch: refetchReferrals } = useReferralSummary({
    address: walletAddress ?? undefined,
    ...periodParams,
  });

  useEffect(() => {
    setOptimisticEnabled(null);
  }, [precheckEnabled]);

  useFocusEffect(
    useCallback(() => {
      refetchUserStatus();
      refetchReferrals();
    }, [refetchUserStatus, refetchReferrals])
  );

  const referralUrl = useMemo(() => {
    if (!username) return null;
    const base = getShareBaseUrl(shareServer);
    return `${base}/signup?ref=${username}`;
  }, [username, shareServer]);

  const handleTogglePrecheck = useCallback(async (value: boolean) => {
    setToggleLoading(true);
    setOptimisticEnabled(value);
    triggerHaptic("selection");
    try {
      await referralPrecheckOptIn({ enabled: value });
      if (walletAddress) {
        queryClient.invalidateQueries({ queryKey: queryKeys.userStatus(walletAddress) });
      }
    } catch (error) {
      console.error("[ReferralsScreen] opt-in failed:", error);
      setOptimisticEnabled(null);
      toast.error("Failed to update referral setting");
    } finally {
      setToggleLoading(false);
    }
  }, [walletAddress, queryClient, toast]);

  useEffect(() => {
    if (linkCopied) {
      const timeout = setTimeout(() => setLinkCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [linkCopied]);

  const handleCopyReferralLink = useCallback(async () => {
    if (!referralUrl || !effectiveEnabled) return;
    try {
      await Clipboard.setStringAsync(referralUrl);
      triggerHaptic("success");
      setLinkCopied(true);
    } catch (error) {
      Sentry.addBreadcrumb({ category: "referral", message: "Copy link failed", data: { error: String(error) }, level: "warning" });
    }
  }, [referralUrl, effectiveEnabled]);

  const handleShareReferralLink = useCallback(async () => {
    if (!referralUrl || !effectiveEnabled) return;
    try {
      triggerHaptic("light");
      await Share.share({ message: referralUrl, title: "Join Mirage" });
    } catch (error) {
      Sentry.addBreadcrumb({ category: "referral", message: "Share link failed", data: { error: String(error) }, level: "warning" });
    }
  }, [referralUrl, effectiveEnabled]);

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  return (
    <Box flex background="base">
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
          Referrals
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
        <View style={styles.heroSection}>
          <LinearGradient
            colors={[theme.colors.brand[500] + "20", "transparent"]}
            style={styles.heroGradient}
          />
          <View
            style={[
              styles.heroIconContainer,
              { backgroundColor: theme.colors.brand[500] + "15" },
            ]}
          >
            <Ionicons name="link" size={40} color={theme.colors.brand[500]} />
          </View>
          <Text size="xxl" weight="bold" style={styles.heroTitle}>
            Referral Links
          </Text>
          <Text size="md" mode="subtle" style={styles.heroSubtitle}>
            Lets people sign up via your personal link instead of sharing invite codes directly. Anyone with the link can use your codes, so leave this off if you want to hand them out manually.
          </Text>
        </View>

        {inviteCodeRequired && (
          <View style={[styles.toggleCard, { backgroundColor: theme.colors.background.default, borderColor: theme.colors.border.subtle }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text size="md" weight="semibold">Referral Link</Text>
            </View>
            <Switch
              value={effectiveEnabled}
              onValueChange={handleTogglePrecheck}
              disabled={toggleLoading}
              trackColor={{ false: theme.colors.background.emphasis, true: "rgb(30,67,150)" }}
              thumbColor="#FFFFFF"
            />
          </View>
        )}

        {referralUrl && (
          <View style={[styles.shareBoxCard, { backgroundColor: theme.colors.background.default, borderColor: theme.colors.border.subtle }]}>
            <Text size="sm" mode="subtle" style={{ marginBottom: 8 }}>Your referral link</Text>
            <View style={[styles.shareUrlRow, { backgroundColor: theme.colors.background.subtle, borderWidth: 1, borderColor: linkCopied ? "#10B981" : "transparent" }]}>
              <Text
                size="sm"
                weight="medium"
                numberOfLines={1}
                style={{ flex: 1, opacity: effectiveEnabled ? 1 : 0.4 }}
              >
                {referralUrl}
              </Text>
              <Pressable
                onPress={handleCopyReferralLink}
                disabled={!effectiveEnabled}
                style={({ pressed }) => [styles.shareCopyBtn, pressed && { opacity: 0.7 }, !effectiveEnabled && { opacity: 0.3 }]}
              >
                <Ionicons name={linkCopied ? "checkmark" : "copy-outline"} size={18} color={linkCopied ? "#10B981" : theme.colors.brand[500]} />
              </Pressable>
            </View>
            <Pressable
              onPress={handleShareReferralLink}
              disabled={!effectiveEnabled}
              style={({ pressed }) => [
                styles.shareNativeBtn,
                { backgroundColor: theme.colors.brand[500] },
                pressed && { opacity: 0.7 },
                !effectiveEnabled && { opacity: 0.4 },
              ]}
            >
              <Feather name="share" size={16} color="#FFFFFF" />
              <Text size="sm" weight="medium" style={{ color: "#FFFFFF", marginLeft: 6 }}>Share</Text>
            </Pressable>
            {!effectiveEnabled && (
              <Text size="xs" mode="subtle" style={{ textAlign: "center", marginTop: 8 }}>
                Enable the toggle above to share your referral link
              </Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text size="md" weight="semibold">Your Referrals</Text>
            {referralData && (
              <Text size="sm" mode="subtle">{referralData.total} total</Text>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(Object.keys(PERIOD_LABELS) as ReferralPeriod[]).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setReferralPeriod(p)}
                  style={[
                    styles.periodTab,
                    {
                      backgroundColor: referralPeriod === p ? theme.colors.brand[500] : theme.colors.background.subtle,
                    },
                  ]}
                >
                  <Text
                    size="sm"
                    weight={referralPeriod === p ? "semibold" : "regular"}
                    style={{ color: referralPeriod === p ? "#FFFFFF" : theme.colors.text.default }}
                  >
                    {PERIOD_LABELS[p]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {referralsLoading ? (
            <View style={{ gap: 10, paddingVertical: 8 }}>
              <SkeletonBox width="100%" height={64} borderRadius={12} />
              <SkeletonBox width="100%" height={64} borderRadius={12} />
            </View>
          ) : referralData && referralData.referrals.length > 0 ? (
            <View style={{ gap: 8 }}>
              {referralData.referrals.map((item) => (
                <ReferralItem key={item.address} item={item} />
              ))}
              {referralData.has_more && (
                <Text size="sm" mode="subtle" style={{ textAlign: "center", paddingVertical: 8 }}>
                  Showing {referralData.referrals.length} of {referralData.total}
                </Text>
              )}
            </View>
          ) : (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <Ionicons name="people-outline" size={40} color={theme.colors.text.subtle} style={{ marginBottom: 8 }} />
              <Text size="sm" mode="subtle">No referrals yet</Text>
            </View>
          )}
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
    marginBottom: theme.spacing.md,
    position: "relative",
    overflow: "hidden",
    borderRadius: theme.radius.xl,
  },
  heroGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginBottom: theme.spacing.md,
  },
  shareBoxCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  shareUrlRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  shareCopyBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  shareNativeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  periodTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  referralItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
}));
