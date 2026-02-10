import { EvilIcons } from "@expo/vector-icons";
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
import { useUpgradeLevel } from "@/src/api/write/hooks";
import type { SubscriptionLevel } from "@/src/api/write/endpoints/tokens";
import {
  ActivePlanCard,
  PlanCard,
  type Plan,
  type PlanFeature,
} from "@/src/components/molecules/subscription";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { formatCompactNumber } from "@/src/utils/format-number";

const TIER_UI: { id: string; title: string; color: string; icon: string }[] = [
  { id: "free", title: "Free", color: "#6B7280", icon: "person-outline" },
  { id: "trusted", title: "Trusted", color: "#3B82F6", icon: "shield-checkmark-outline" },
  { id: "established", title: "Established", color: "#8B5CF6", icon: "star-outline" },
  { id: "distinguished", title: "Distinguished", color: "#F59E0B", icon: "diamond-outline" },
];

const UMIRAGE = 1_000_000;

const formatMirageBalance = (umirage: number): number => {
  return Math.floor(umirage / UMIRAGE);
};

const fmt = (n: string | number) => Number(n).toLocaleString();

function buildShortFeatures(tier: TierInfo, isFree: boolean): PlanFeature[] {
  const features: PlanFeature[] = [];

  if (isFree) {
    features.push({ text: "PoW for transactions" });
  } else {
    features.push({ text: "Instant posting (no PoW)" });
  }

  features.push({ text: `Up to ${fmt(tier.max_content_length)} characters` });
  features.push({ text: `Follow up to ${fmt(tier.max_followed_topics)} topics and ${fmt(tier.max_followed_users)} users` });

  if (tier.eligible_for_mod) {
    features.push({ text: "Eligible for moderator" });
  }

  if (tier.can_change_name) {
    features.push({ text: "Change username" });
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

  features.push({ text: `Follow up to ${fmt(tier.max_followed_mods)} moderators.` });
  features.push({ text: `Follow up to ${fmt(tier.max_followed_users)} users.` });
  features.push({ text: `Follow up to ${fmt(tier.max_followed_topics)} topics.` });
  features.push({ text: `Block up to ${fmt(tier.max_blocked_users)} users.` });
  features.push({ text: `Block up to ${fmt(tier.max_blocked_posts)} posts.` });

  const qualityPosts = Number(tier.max_quality_posts);
  if (qualityPosts > 0) {
    features.push({ text: `Mark up to ${fmt(qualityPosts)} posts as high quality.` });
  } else {
    features.push({ text: "Cannot mark posts as high quality." });
  }

  features.push({ text: `Post titles up to ${fmt(tier.max_title_length)} characters.` });
  features.push({ text: `Post content up to ${fmt(tier.max_content_length)} characters.` });
  features.push({ text: `Edit posts for up to ${fmt(tier.editing_time_mins)} minutes after publishing.` });
  features.push({ text: `Posts are archived after approximately ${fmt(tier.archive_duration_days)} days.` });
  features.push({ text: `Vote weight: ${tier.vote_weight.toFixed(2)}x.` });

  features.push({
    text: tier.eligible_for_mod ? "Eligible to be moderator." : "Ineligible to be moderator.",
  });
  features.push({
    text: tier.can_change_name ? "Can change username." : "Cannot change username.",
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

  const awardLabels = ["Cannot give awards.", "Can give basic awards.", "Can give more awards.", "Can give all award types."];
  features.push({ text: awardLabels[tier.award_permissions] ?? awardLabels[0] });

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

      {[0, 1, 2, 3].map((i) => (
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
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);

  if (statusError) {
    console.error("[SubscriptionScreen] Failed to fetch user status:", statusError);
  }
  if (configError) {
    console.error("[SubscriptionScreen] Failed to fetch config/tiers:", configError);
  }

  const balance = userStatus ? formatMirageBalance(userStatus.balance) : 0;
  const reserve = userStatus ? formatMirageBalance(userStatus.reserve_funds) : 0;
  const userLevel = userStatus?.user_level ?? 0;
  const currentPlanId = TIER_UI[userLevel]?.id ?? "free";

  const plans: Plan[] = useMemo(() => {
    if (!config?.tiers?.length) return [];
    return buildPlansFromConfig(config);
  }, [config]);

  const currentPlanData = plans.find((p) => p.id === currentPlanId);
  const currentPlanTitle = currentPlanData?.title || TIER_UI[userLevel]?.title || "Free";

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  const handleSubscribe = useCallback(
    (planId: string) => {
      const planIndex = plans.findIndex((p) => p.id === planId);
      if (planIndex <= 0) return;

      triggerHaptic("medium");

      Alert.alert(
        "Confirm Subscription",
        `Subscribe to ${plans[planIndex].title} for ${plans[planIndex].cost}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Subscribe",
            onPress: () => {
              setSubscribingPlanId(planId);
              upgradeMutation.mutate(planIndex as SubscriptionLevel, {
                onSuccess: () => {
                  setSubscribingPlanId(null);
                  triggerHaptic("success");
                  Alert.alert(
                    "Subscription Active",
                    `You are now subscribed to ${plans[planIndex].title}.`
                  );
                },
                onError: (error) => {
                  setSubscribingPlanId(null);
                  console.error("[SubscriptionScreen] Failed to subscribe:", error);
                  triggerHaptic("error");
                  Alert.alert(
                    "Subscription Failed",
                    error?.message || "Something went wrong. Please try again."
                  );
                },
              });
            },
          },
        ]
      );
    },
    [plans, upgradeMutation]
  );

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
          Subscription
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
            />
          </Box>

          <Box px="md" mb="sm">
            <Text size="xs" weight="semibold" mode="subtle" style={styles.sectionTitle}>
              AVAILABLE PLANS
            </Text>
          </Box>

          <Box px="md" gap="md">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isActive={plan.id === currentPlanId}
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
                Subscriptions are billed every subscription period in MIRAGE tokens.
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
