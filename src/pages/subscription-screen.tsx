import { EvilIcons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useUserStatus, useConfig } from "@/src/api/read";
import type { TierInfo, ConfigResponse } from "@/src/api/types";
import { useUpgradeLevel, useSetAutoRenewal } from "@/src/api/write/hooks";
import {
  ActivePlanCard,
  PlanCard,
  type Plan,
  type PlanFeature,
} from "@/src/components/molecules/subscription";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { formatCompactNumber } from "@/src/utils/format-number";

import { getTierIndex, TIER_LEVEL_FROM_INDEX } from "@/src/utils/tiers";

const TIER_UI: { id: string; title: string; color: string; icon: string }[] = [
  { id: "free", title: "Free", color: "#6B7280", icon: "person-outline" },
  { id: "subscriber", title: "Subscriber", color: "#F59E0B", icon: "shield-checkmark-outline" },
  { id: "agent", title: "Agent", color: "#EF4444", icon: "diamond-outline" },
];

const UMIRAGE = 1_000_000;

const formatMirageBalance = (umirage: number): number => {
  return Math.floor(umirage / UMIRAGE);
};

const fmt = (n: string | number) => Number(n).toLocaleString();

function captureSubscriptionException(
  error: unknown,
  action: string,
  extra?: Record<string, unknown>
) {
  Sentry.captureException(error, {
    tags: {
      feature: "subscription",
      action,
    },
    extra,
  });
}

function buildShortFeatures(tier: TierInfo, isFree: boolean): PlanFeature[] {
  const features: PlanFeature[] = [];

  if (isFree) {
    features.push({ text: "PoW for transactions" });
  } else {
    features.push({ text: "Instant posting (no PoW)" });
  }

  features.push({ text: `Up to ${fmt(tier.max_content_length)} characters` });
  features.push({ text: `Follow up to ${fmt(tier.max_followed_topics)} topics and ${fmt(tier.max_followed_users)} users` });

  if (tier.can_be_agent) {
    features.push({ text: "Eligible to be Agent" });
  }

  if (tier.can_remove_anon) {
    features.push({ text: "Remove Anon- prefix" });
  }

  if (tier.can_have_avatar || tier.can_have_biography) {
    const parts: string[] = [];
    if (tier.can_have_biography) parts.push("biography");
    if (tier.can_have_avatar) parts.push("avatar");
    if (tier.can_have_banner) parts.push("banner");
    features.push({ text: `Profile ${parts.join(", ")}` });
  }

  return features;
}

function buildFullFeatures(tier: TierInfo, isFree: boolean, costLabel: string): PlanFeature[] {
  const features: PlanFeature[] = [];

  if (isFree) {
    features.push({ text: "Free tier. No MIRAGE needed to keep this plan active." });
  } else {
    features.push({ text: `Subscription cost: ${costLabel}.` });
  }

  features.push({ text: `Enable up to ${fmt(tier.max_enabled_agents)} agents.` });
  features.push({ text: `Follow up to ${fmt(tier.max_followed_users)} users.` });
  features.push({ text: `Follow up to ${fmt(tier.max_followed_topics)} topics.` });
  features.push({ text: `Block up to ${fmt(tier.max_blocked_users)} users.` });
  features.push({ text: `Block up to ${fmt(tier.max_blocked_posts)} posts.` });
  features.push({ text: `Block up to ${fmt(tier.max_blocked_topics)} topics.` });
  features.push({ text: `Post content up to ${fmt(tier.max_content_length)} characters.` });
  features.push({ text: `Vote weight: ${tier.vote_weight.toFixed(2)}x.` });

  features.push({
    text: tier.can_be_agent ? "Eligible to be Agent." : "Not eligible to be Agent.",
  });
  features.push({
    text: tier.can_remove_anon ? "Can remove Anon- prefix." : "Cannot remove Anon- prefix.",
  });
  features.push({
    text: tier.can_have_biography ? "Profile biography available." : "Profile biography not available.",
  });
  features.push({
    text: tier.can_have_avatar ? "Profile avatar available." : "Profile avatar not available.",
  });
  features.push({
    text: tier.can_have_banner ? "Profile banner available." : "Profile banner not available.",
  });

  if (isFree) {
    features.push({ text: "Uses proof-of-work (PoW) for posts and votes." });
  } else {
    features.push({ text: "No PoW required for posts or votes while subscribed." });
  }

  return features;
}

function computeMonthlyFee(tier: TierInfo, config: ConfigResponse): number {
  const periodFeeUmirage = Number(tier.period_fee);
  if (periodFeeUmirage === 0) return 0;
  return Math.round(periodFeeUmirage / UMIRAGE);
}

function buildPlansFromConfig(config: ConfigResponse): Plan[] {
  return config.tiers.map((tier, index) => {
    const ui = TIER_UI[index] ?? TIER_UI[0];
    const isFree = Number(tier.period_fee) === 0;
    const monthlyFee = computeMonthlyFee(tier, config);
    const costLabel = isFree ? "Free" : `${formatCompactNumber(monthlyFee)} MIRAGE/month`;

    return {
      id: ui.id,
      title: ui.title,
      color: ui.color,
      icon: ui.icon,
      cost: costLabel,
      costValue: monthlyFee,
      shortFeatures: buildShortFeatures(tier, isFree),
      fullFeatures: buildFullFeatures(tier, isFree, costLabel),
    };
  });
}

function SkeletonBox({
  width,
  height,
  style,
  borderRadius,
}: {
  width: number | `${number}%`;
  height: number;
  style?: object;
  borderRadius?: number;
}) {
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
}

function SubscriptionSkeleton() {
  const { theme } = useUnistyles();

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: theme.spacing.lg, paddingHorizontal: theme.spacing.md }}
      showsVerticalScrollIndicator={false}
    >
      <Box
        rounded="lg"
        p="md"
        mb="lg"
        style={{
          backgroundColor: theme.colors.background.default,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        }}
      >
        <Box direction="row" alignItems="center" gap="sm" mb="md">
          <SkeletonBox width={48} height={48} borderRadius={theme.radius.md} />
          <Box flex gap="xs">
            <SkeletonBox width={80} height={12} />
            <SkeletonBox width={120} height={20} />
          </Box>
        </Box>
        <SkeletonBox width="100%" height={1} style={{ marginBottom: 12 }} />
        <Box direction="row" gap="md">
          <Box flex gap="xs">
            <SkeletonBox width={50} height={12} />
            <SkeletonBox width={80} height={20} />
          </Box>
          <Box flex gap="xs">
            <SkeletonBox width={50} height={12} />
            <SkeletonBox width={80} height={20} />
          </Box>
        </Box>
      </Box>

      <SkeletonBox width={120} height={12} style={{ marginBottom: 12 }} />

      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          rounded="lg"
          p="md"
          mb="md"
          style={{
            backgroundColor: theme.colors.background.default,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
          }}
        >
          <Box direction="row" alignItems="center" gap="sm" mb="sm">
            <SkeletonBox width={44} height={44} borderRadius={theme.radius.md} />
            <Box flex gap="xs">
              <SkeletonBox width={100} height={16} />
              <SkeletonBox width={80} height={12} />
            </Box>
          </Box>
          <SkeletonBox width="100%" height={1} style={{ marginBottom: 10 }} />
          <Box gap="sm" mb="sm">
            <SkeletonBox width="90%" height={14} />
            <SkeletonBox width="75%" height={14} />
            <SkeletonBox width="85%" height={14} />
          </Box>
          <SkeletonBox width="100%" height={40} borderRadius={theme.radius.lg} />
        </Box>
      ))}
    </ScrollView>
  );
}

export function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const { data: userStatus, isLoading: isLoadingStatus, error: statusError } = useUserStatus();
  const { data: config, isLoading: isLoadingConfig, error: configError } = useConfig();
  const upgradeMutation = useUpgradeLevel();
  const autoRenewalMutation = useSetAutoRenewal();
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [optimisticLevel, setOptimisticLevel] = useState<number | null>(null);
  const [optimisticAutoRenew, setOptimisticAutoRenew] = useState<boolean | null>(null);
  const [autoRenewProcessing, setAutoRenewProcessing] = useState(false);

  useEffect(() => {
    if (!statusError) {
      return;
    }

    console.error("[SubscriptionScreen] Failed to fetch user status:", statusError);
    captureSubscriptionException(statusError, "fetch-user-status");
  }, [statusError]);

  useEffect(() => {
    if (!configError) {
      return;
    }

    console.error("[SubscriptionScreen] Failed to fetch config/tiers:", configError);
    captureSubscriptionException(configError, "fetch-config");
  }, [configError]);

  const plans: Plan[] = useMemo(() => {
    if (!config?.tiers?.length) return [];
    return buildPlansFromConfig(config);
  }, [config]);

  const serverLevel = userStatus?.user_level ?? 0;
  const userLevel = optimisticLevel ?? serverLevel;
  const currentPlanId = TIER_UI[getTierIndex(userLevel)]?.id ?? "free";

  const activePlanIndex = plans.findIndex((p) => p.id === currentPlanId);

  const tierIdx = optimisticLevel !== null ? getTierIndex(optimisticLevel) : -1;
  const optimisticCost = tierIdx >= 0 && config?.tiers?.[tierIdx]
    ? Number(config.tiers[tierIdx].period_fee)
    : 0;
  const balance = userStatus
    ? formatMirageBalance(userStatus.balance - optimisticCost)
    : 0;
  const reserve = userStatus ? formatMirageBalance(userStatus.reserve_funds) : 0;

  const currentPlanData = plans.find((p) => p.id === currentPlanId);
  const currentPlanTitle = currentPlanData?.title || TIER_UI[getTierIndex(userLevel)]?.title || "Free";

  const effectiveAutoRenew = optimisticAutoRenew ?? userStatus?.auto_renew;

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  const handleSubscribe = useCallback(
    (planId: string) => {
      const planIndex = plans.findIndex((p) => p.id === planId);
      if (planIndex < 0) return;

      const targetPlan = plans[planIndex];

      triggerHaptic("medium");
      setSubscribingPlanId(planId);
      Sentry.addBreadcrumb({
        category: "subscription",
        message: "Subscription action started",
        level: "info",
        data: {
          planId,
          planIndex,
          isDowngradeToFree: planIndex === 0,
          effectiveAutoRenew,
          targetCost: targetPlan?.cost,
        },
      });

      if (planIndex === 0) {
        if (!effectiveAutoRenew) return;
        setAutoRenewProcessing(true);
        autoRenewalMutation.mutate(false, {
          onSuccess: () => {
            setSubscribingPlanId(null);
            setAutoRenewProcessing(false);
            setOptimisticAutoRenew(false);
            triggerHaptic("success");
          },
          onError: (error) => {
            setSubscribingPlanId(null);
            setAutoRenewProcessing(false);
            console.error("[SubscriptionScreen] Failed to cancel auto-renew:", error);
            captureSubscriptionException(error, "cancel-auto-renew", {
              planId,
              planIndex,
            });
            triggerHaptic("error");
            Alert.alert(
              "Downgrade Failed",
              error?.message || "Something went wrong. Please try again."
            );
          },
        });
        return;
      }

      const targetLevel = TIER_LEVEL_FROM_INDEX[planIndex];
      if (targetLevel === undefined) return;

      setOptimisticLevel(targetLevel);

      upgradeMutation.mutate(targetLevel as 1 | 10, {
        onSuccess: () => {
          setSubscribingPlanId(null);
          triggerHaptic("success");
        },
        onError: (error) => {
          setSubscribingPlanId(null);
          setOptimisticLevel(null);
          console.error("[SubscriptionScreen] Failed to subscribe:", error);
          captureSubscriptionException(error, "upgrade-plan", {
            planId,
            planIndex,
            targetCost: targetPlan?.cost,
          });
          triggerHaptic("error");
          Alert.alert(
            "Subscription Failed",
            error?.message || "Something went wrong. Please try again."
          );
        },
      });
    },
    [plans, upgradeMutation, autoRenewalMutation, effectiveAutoRenew]
  );

  useEffect(() => {
    if (optimisticLevel !== null && userStatus?.user_level === optimisticLevel) {
      setOptimisticLevel(null);
    }
  }, [userStatus?.user_level, optimisticLevel]);

  const handleToggleAutoRenew = useCallback(() => {
    const newValue = !effectiveAutoRenew;
    triggerHaptic("medium");
    setAutoRenewProcessing(true);
    Sentry.addBreadcrumb({
      category: "subscription",
      message: "Auto-renew toggled",
      level: "info",
      data: {
        currentValue: effectiveAutoRenew,
        nextValue: newValue,
      },
    });
    autoRenewalMutation.mutate(newValue, {
      onSuccess: () => {
        setAutoRenewProcessing(false);
        setOptimisticAutoRenew(newValue);
        triggerHaptic("success");
      },
      onError: (error) => {
        setAutoRenewProcessing(false);
        console.error("[SubscriptionScreen] Failed to update auto-renew:", error);
        captureSubscriptionException(error, "toggle-auto-renew", {
          currentValue: effectiveAutoRenew,
          nextValue: newValue,
        });
        triggerHaptic("error");
        Alert.alert(
          "Failed",
          error?.message || "Something went wrong. Please try again."
        );
      },
    });
  }, [autoRenewalMutation, effectiveAutoRenew]);

  const hasInsufficientFunds = useCallback(
    (planCostValue: number) => {
      if (planCostValue === 0) return false;
      return balance < planCostValue;
    },
    [balance]
  );

  const isLoading = isLoadingStatus || isLoadingConfig;

  return (
    <Box flex background="subtle">
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
          Perks
        </Text>
        <View style={styles.placeholder} />
      </View>

      {isLoading ? (
        <SubscriptionSkeleton />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Box px="md" mb="lg">
            <ActivePlanCard
              planTitle={currentPlanTitle}
              balance={balance}
              reserve={reserve}
              autoRenew={effectiveAutoRenew}
              subscriptionExpiry={userStatus?.subscription_expiry}
              autoRenewLoading={autoRenewProcessing}
              onToggleAutoRenew={handleToggleAutoRenew}
            />
          </Box>

          <Box px="md" mb="sm">
            <Text size="xs" weight="semibold" mode="subtle" style={styles.sectionTitle}>
              AVAILABLE TIERS
            </Text>
          </Box>

          <Box px="md" gap="md">
            {plans.map((plan, index) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isActive={plan.id === currentPlanId}
                isLowerPlan={activePlanIndex > 0 && index < activePlanIndex}
                isDowngradeDisabled={index === 0 && !effectiveAutoRenew}
                hasInsufficientFunds={hasInsufficientFunds(plan.costValue)}
                isSubscribing={subscribingPlanId === plan.id}
                onSubscribe={handleSubscribe}
              />
            ))}
          </Box>

          <Box px="md" mt="lg">
            <Box
              p="md"
              rounded="lg"
              style={[
                styles.disclaimerBox,
                { backgroundColor: theme.colors.background.default },
              ]}
            >
              <Text size="sm" mode="subtle" style={styles.disclaimerText}>
                Perks are billed every subscription period in MIRAGE tokens.
                Tokens are burned on payment. If renewal fails due to insufficient
                balance, you will be downgraded to Free.
              </Text>
            </Box>
          </Box>
        </ScrollView>
      )}
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
  content: {
    paddingTop: theme.spacing.lg,
  },
  sectionTitle: {
    letterSpacing: 0.5,
  },
  disclaimerBox: {
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  disclaimerText: {
    lineHeight: 20,
    textAlign: "center",
  },
}));
