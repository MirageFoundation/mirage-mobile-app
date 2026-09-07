import { EvilIcons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useAccountStatus, useUserStatus, useConfig } from "@/src/api/read";
import { useUpgradeLevel, useSetAutoRenewal } from "@/src/api/write/hooks";
import {
  AccountStatusNotices,
  ActivePlanCard,
  PlanCard,
  SubscriptionPeriodPicker,
} from "@/src/components/molecules/subscription";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  clampPeriodCount,
  hasInsufficientSubscriptionBalance,
  parseModernTiers,
  parseUserLevel,
  projectSubscriptionExpiry,
  subscriptionDurationSeconds,
  UMIRAGE_PER_MIRAGE,
} from "@/src/domain/subscriptions";
import { formatCompactNumber } from "@/src/utils/format-number";
import { getErrorMessage } from "@/src/utils/error-messages";

import { SubscriptionSkeleton } from "./subscription/subscription-skeleton";
import { buildPurchasablePlans, currentPlanIdFromKind } from "./subscription/subscription-plans";

function captureSubscriptionException(
  error: unknown,
  action: string,
  extra?: Record<string, unknown>,
) {
  Sentry.captureException(error, {
    tags: { feature: "subscription", action },
    extra,
  });
}

function formatMirageBalance(umirage: number): number {
  return Math.floor(umirage / UMIRAGE_PER_MIRAGE);
}

export function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const { data: userStatus, isLoading: isLoadingStatus, error: statusError, refetch: retryStatus } = useUserStatus();
  const { data: config, isLoading: isLoadingConfig, error: configError, refetch: retryConfig } = useConfig();
  const { data: accountStatus, error: accountError, refetch: retryAccount } = useAccountStatus();
  const detailsError = statusError || configError || accountError;
  const syncing = (detailsError as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code === "node_catching_up";
  const upgradeMutation = useUpgradeLevel();
  const autoRenewalMutation = useSetAutoRenewal();
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [periodCount, setPeriodCount] = useState(1);
  const [optimisticAutoRenew, setOptimisticAutoRenew] = useState<boolean | null>(null);
  const [autoRenewProcessing, setAutoRenewProcessing] = useState(false);

  const parsedLevel = parseUserLevel(userStatus?.user_level ?? 0);
  const tiers = useMemo(() => parseModernTiers(config?.tiers), [config?.tiers]);
  const selectedPeriodCount = clampPeriodCount(periodCount);
  const plans = useMemo(
    () => (tiers ? buildPurchasablePlans(tiers, selectedPeriodCount) : []),
    [selectedPeriodCount, tiers],
  );
  const currentPlanId = currentPlanIdFromKind(parsedLevel.kind);
  const activePlanIndex = plans.findIndex((plan) => plan.id === currentPlanId);
  const subscriberFee = tiers ? Number(tiers[1].period_fee) : 0;
  const periodFeeMirage = Math.round(subscriberFee / UMIRAGE_PER_MIRAGE);
  const durationSeconds = subscriptionDurationSeconds(
    config?.subscription_period ?? 0,
    selectedPeriodCount,
  );
  const projectedExpiry = projectSubscriptionExpiry({
    nowSeconds: Math.floor(Date.now() / 1000),
    currentExpiry: userStatus?.subscription_expiry,
    durationSeconds,
  });
  const projectedExpiryLabel = new Date(projectedExpiry * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const balance = userStatus ? formatMirageBalance(userStatus.balance) : 0;
  const reserve = userStatus ? formatMirageBalance(userStatus.reserve_funds) : 0;
  const currentPlanTitle = parsedLevel.name;
  const effectiveAutoRenew = optimisticAutoRenew ?? userStatus?.auto_renew;

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  const handleSubscribe = useCallback(
    (planId: string) => {
      const planIndex = plans.findIndex((plan) => plan.id === planId);
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
          periodCount: selectedPeriodCount,
          isDowngradeToFree: planIndex === 0,
          effectiveAutoRenew,
          targetCost: targetPlan?.cost,
        },
      });

      if (planIndex === 0) {
        if (!effectiveAutoRenew) {
          setSubscribingPlanId(null);
          Alert.alert(
            "Downgrade Already Scheduled",
            "Auto-renew is already off. Your current perks stay active until the subscription expires.",
          );
          return;
        }
        setAutoRenewProcessing(true);
        autoRenewalMutation.mutate(false, {
          onSuccess: () => {
            setSubscribingPlanId(null);
            setAutoRenewProcessing(false);
            setOptimisticAutoRenew(false);
            triggerHaptic("success");
            Alert.alert(
              "Downgrade Scheduled",
              "Auto-renew is now off. Your current perks stay active until the subscription expires.",
            );
          },
          onError: (error) => {
            setSubscribingPlanId(null);
            setAutoRenewProcessing(false);
            captureSubscriptionException(error, "cancel-auto-renew", { planId, planIndex });
            triggerHaptic("error");
            Alert.alert("Downgrade Failed", error?.message || "Something went wrong. Please try again.");
          },
        });
        return;
      }

      upgradeMutation.mutate(selectedPeriodCount, {
        onSuccess: () => {
          setSubscribingPlanId(null);
          triggerHaptic("success");
        },
        onError: (error) => {
          setSubscribingPlanId(null);
          captureSubscriptionException(error, "upgrade-plan", {
            planId,
            planIndex,
            periodCount: selectedPeriodCount,
            targetCost: targetPlan?.cost,
          });
          triggerHaptic("error");
          Alert.alert("Subscription Failed", error?.message || "Something went wrong. Please try again.");
        },
      });
    },
    [autoRenewalMutation, effectiveAutoRenew, plans, selectedPeriodCount, upgradeMutation],
  );

  const handleToggleAutoRenew = useCallback(() => {
    const newValue = !effectiveAutoRenew;
    triggerHaptic("medium");
    setAutoRenewProcessing(true);
    autoRenewalMutation.mutate(newValue, {
      onSuccess: () => {
        setAutoRenewProcessing(false);
        setOptimisticAutoRenew(newValue);
        triggerHaptic("success");
      },
      onError: (error) => {
        setAutoRenewProcessing(false);
        captureSubscriptionException(error, "toggle-auto-renew", {
          currentValue: effectiveAutoRenew,
          nextValue: newValue,
        });
        triggerHaptic("error");
        Alert.alert("Failed", error?.message || "Something went wrong. Please try again.");
      },
    });
  }, [autoRenewalMutation, effectiveAutoRenew]);

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
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
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
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
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
            <Box mt="sm">
              <AccountStatusNotices
                quota={accountStatus?.daily_quota}
                renewal={accountStatus?.renewal_warning}
                effectivePaid={userStatus?.effective_paid}
                userLevel={userStatus?.user_level}
              />
            </Box>
            {detailsError || accountStatus?.incomplete ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Retry subscription details" onPress={() => {
                if (statusError) void retryStatus();
                if (configError) void retryConfig();
                if (accountError || accountStatus?.incomplete) void retryAccount();
              }}>
                <Text size="sm" mode="subtle" style={{ marginTop: 8 }}>
                  {syncing ? getErrorMessage("node_catching_up") : "Some subscription details are unavailable. Last known details may be shown."} Tap to retry.
                </Text>
              </Pressable>
            ) : null}
          </Box>

          <Box px="md" mb="md">
            <SubscriptionPeriodPicker value={selectedPeriodCount} onChange={setPeriodCount} />
            <Text size="xs" mode="subtle">
              {formatCompactNumber(periodFeeMirage)} MIRAGE per period · {selectedPeriodCount} selected · projected expiry {projectedExpiryLabel}
            </Text>
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
                isActive={plan.id === currentPlanId && parsedLevel.kind !== "unknown" && parsedLevel.kind !== "admin"}
                isLowerPlan={activePlanIndex > 0 && index < activePlanIndex}
                isDowngradeDisabled={index === 0 && !effectiveAutoRenew}
                hasInsufficientFunds={hasInsufficientSubscriptionBalance({
                  balance: userStatus?.balance,
                  periodFee: index === 0 ? 0 : subscriberFee,
                  periodCount: selectedPeriodCount,
                })}
                isSubscribing={subscribingPlanId === plan.id}
                onSubscribe={handleSubscribe}
              />
            ))}
          </Box>

          <Box px="md" mt="lg">
            <Box
              p="md"
              rounded="lg"
              style={[styles.disclaimerBox, { backgroundColor: theme.colors.background.default }]}
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
