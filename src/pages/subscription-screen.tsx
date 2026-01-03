import { EvilIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  ActivePlanCard,
  PlanCard,
  PLANS,
} from "@/src/components/molecules/subscription";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

// Mock user data - in real app, this would come from auth store or API
const MOCK_USER_DATA = {
  currentPlan: "free", // "free" | "trusted" | "established" | "distinguished"
  balance: 12,
  reserve: 5,
};

export function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  // In a real app, these would come from stores/API
  const { currentPlan, balance, reserve } = MOCK_USER_DATA;

  // Get current plan details
  const currentPlanData = PLANS.find((p) => p.id === currentPlan);
  const currentPlanTitle = currentPlanData?.title || "Free";

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  const handleSubscribe = useCallback((planId: string) => {
    // In a real app, this would trigger the subscription flow
    console.log("Subscribe to plan:", planId);
    triggerHaptic("medium");
    // TODO: Implement subscription logic
  }, []);

  // Check if user has sufficient funds for a plan
  const hasInsufficientFunds = useCallback(
    (planCostValue: number) => {
      if (planCostValue === 0) return false; // Free plan
      return balance < planCostValue;
    },
    [balance]
  );

  return (
    <Box flex background="subtle">
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
          Subscription
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Active Plan Card */}
        <Box px="md" mb="lg">
          <ActivePlanCard
            planTitle={currentPlanTitle}
            balance={balance}
            reserve={reserve}
          />
        </Box>

        {/* Plans Section Header */}
        <Box px="md" mb="sm">
          <Text size="xs" weight="semibold" mode="subtle" style={styles.sectionTitle}>
            AVAILABLE PLANS
          </Text>
        </Box>

        {/* Plan Cards */}
        <Box px="md" gap="md">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isActive={plan.id === currentPlan}
              hasInsufficientFunds={hasInsufficientFunds(plan.costValue)}
              onSubscribe={handleSubscribe}
            />
          ))}
        </Box>

        {/* Footer Disclaimer */}
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
              Subscriptions are billed every day in MIRAGE tokens. Tokens are
              burned on payment. If renewal fails due to insufficient balance,
              you will be downgraded to Free.
            </Text>
          </Box>
        </Box>
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

