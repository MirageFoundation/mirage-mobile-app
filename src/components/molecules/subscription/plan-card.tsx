import { Entypo, Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, Icon, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

export type PlanFeature = {
  text: string;
  isHighlight?: boolean;
};

export type Plan = {
  id: string;
  title: string;
  cost: string;
  costValue: number; // Daily cost in MIRAGE (0 for free)
  shortFeatures: PlanFeature[];
  fullFeatures: PlanFeature[];
  color: string;
  icon: string;
};

type PlanCardProps = {
  plan: Plan;
  isActive: boolean;
  hasInsufficientFunds: boolean;
  onSubscribe?: (planId: string) => void;
};

// Plan data export for use in subscription screen
export const PLANS: Plan[] = [
  {
    id: "free",
    title: "Free",
    cost: "Free",
    costValue: 0,
    color: "#6B7280",
    icon: "person-outline",
    shortFeatures: [
      { text: "PoW for transactions" },
      { text: "Up to 1,000 characters" },
      { text: "Follow up to 50 topics and 25 users" },
      { text: "Basic posting" },
    ],
    fullFeatures: [
      { text: "Free tier. No MIRAGE needed to keep this plan active." },
      { text: "Follow up to 5 moderators." },
      { text: "Follow up to 25 users." },
      { text: "Follow up to 50 topics." },
      { text: "Block up to 10 users." },
      { text: "Block up to 25 posts." },
      { text: "Cannot mark posts as high quality." },
      { text: "Post titles up to 130 characters." },
      { text: "Post content up to 1,000 characters." },
      { text: "Edit posts for up to 10 minutes after publishing." },
      { text: "Posts are archived after approximately 30 days." },
      { text: "Vote weight: 1.00x." },
      { text: "Ineligible to be moderator." },
      { text: "Cannot change username." },
      { text: "Profile biography not available." },
      { text: "Profile avatar not available." },
      { text: "Profile banner not available." },
      { text: "Cannot give awards." },
      { text: "Uses proof-of-work (PoW) for posts and votes." },
    ],
  },
  {
    id: "trusted",
    title: "Trusted",
    cost: "1 MIRAGE/day",
    costValue: 1,
    color: "#3B82F6",
    icon: "shield-checkmark-outline",
    shortFeatures: [
      { text: "Instant posting", isHighlight: true },
      { text: "Up to 2,000 characters" },
      { text: "Follow up to 250 topics and 125 users" },
      { text: "Change username" },
      { text: "Profile biography & avatar" },
      { text: "Give basic awards" },
    ],
    fullFeatures: [
      { text: "Subscription price: 1 MIRAGE every day." },
      { text: "Follow up to 10 moderators." },
      { text: "Follow up to 125 users." },
      { text: "Follow up to 250 topics." },
      { text: "Block up to 125 users." },
      { text: "Block up to 100 posts." },
      { text: "Cannot mark posts as high quality." },
      { text: "Post titles up to 165 characters." },
      { text: "Post content up to 2,000 characters." },
      { text: "Edit posts for up to 60 minutes after publishing." },
      { text: "Posts are archived after approximately 90 days." },
      { text: "Vote weight: 1.15x." },
      { text: "Ineligible to be moderator." },
      { text: "Can change username." },
      { text: "Profile biography available." },
      { text: "Profile avatar available." },
      { text: "Profile banner available." },
      { text: "Can give basic awards." },
      { text: "No PoW required for posts or votes while subscribed." },
    ],
  },
  {
    id: "established",
    title: "Established",
    cost: "2 MIRAGE/day",
    costValue: 2,
    color: "#8B5CF6",
    icon: "star-outline",
    shortFeatures: [
      { text: "Instant posting", isHighlight: true },
      { text: "Up to 5,000 characters" },
      { text: "Follow up to 500 topics and 500 users" },
      { text: "Eligible for moderator", isHighlight: true },
      { text: "Profile banner" },
      { text: "Give more awards" },
    ],
    fullFeatures: [
      { text: "Subscription price: 2 MIRAGE every day." },
      { text: "Follow up to 25 moderators." },
      { text: "Follow up to 500 users." },
      { text: "Follow up to 500 topics." },
      { text: "Block up to 500 users." },
      { text: "Block up to 200 posts." },
      { text: "Mark up to 50 posts as high quality." },
      { text: "Post titles up to 200 characters." },
      { text: "Post content up to 5,000 characters." },
      { text: "Edit posts for up to 360 minutes after publishing." },
      { text: "Posts are archived after approximately 180 days." },
      { text: "Vote weight: 1.30x." },
      { text: "Eligible to be moderator." },
      { text: "Can change username." },
      { text: "Profile biography available." },
      { text: "Profile avatar available." },
      { text: "Profile banner available." },
      { text: "Can give more awards." },
      { text: "No PoW required for posts or votes while subscribed." },
    ],
  },
  {
    id: "distinguished",
    title: "Distinguished",
    cost: "3 MIRAGE/day",
    costValue: 3,
    color: "#F59E0B",
    icon: "diamond-outline",
    shortFeatures: [
      { text: "Instant posting", isHighlight: true },
      { text: "Up to 25,000 characters" },
      { text: "Follow up to 1000 topics and 1000 users" },
      { text: "Maximum vote weight", isHighlight: true },
      { text: "All profile features" },
      { text: "Give all award types" },
    ],
    fullFeatures: [
      { text: "Subscription price: 3 MIRAGE every day." },
      { text: "Follow up to 50 moderators." },
      { text: "Follow up to 1000 users." },
      { text: "Follow up to 1000 topics." },
      { text: "Block up to 1000 users." },
      { text: "Block up to 500 posts." },
      { text: "Mark up to 100 posts as high quality." },
      { text: "Post titles up to 250 characters." },
      { text: "Post content up to 25,000 characters." },
      { text: "Edit posts for up to 720 minutes after publishing." },
      { text: "Posts are archived after approximately 365 days." },
      { text: "Vote weight: 1.45x." },
      { text: "Eligible to be moderator." },
      { text: "Can change username." },
      { text: "Profile biography available." },
      { text: "Profile avatar available." },
      { text: "Profile banner available." },
      { text: "Can give all award types." },
      { text: "No PoW required for posts or votes while subscribed." },
    ],
  },
];

export function PlanCard({
  plan,
  isActive,
  hasInsufficientFunds,
  onSubscribe,
}: PlanCardProps) {
  const { theme } = useUnistyles();
  const [isExpanded, setIsExpanded] = useState(false);
  const expandProgress = useSharedValue(0);

  const handleToggleExpand = useCallback(() => {
    triggerHaptic("light");
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    expandProgress.value = withTiming(newExpanded ? 1 : 0, { duration: 300 });
  }, [isExpanded, expandProgress]);

  const handleSubscribe = useCallback(() => {
    if (!isActive && !hasInsufficientFunds && onSubscribe) {
      triggerHaptic("medium");
      onSubscribe(plan.id);
    }
  }, [isActive, hasInsufficientFunds, onSubscribe, plan.id]);

  // Animated styles for expansion
  const expandedContentStyle = useAnimatedStyle(() => {
    return {
      opacity: expandProgress.value,
      maxHeight: interpolate(
        expandProgress.value,
        [0, 1],
        [0, 600],
        Extrapolation.CLAMP
      ),
    };
  });

  const shortContentStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        expandProgress.value,
        [0, 0.3],
        [1, 0],
        Extrapolation.CLAMP
      ),
      maxHeight: interpolate(
        expandProgress.value,
        [0, 0.3],
        [200, 0],
        Extrapolation.CLAMP
      ),
    };
  });

  const chevronStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          rotate: `${interpolate(expandProgress.value, [0, 1], [0, 180])}deg`,
        },
      ],
    };
  });

  // Button state
  const getButtonConfig = () => {
    if (isActive) {
      return {
        text: "Active Plan",
        disabled: true,
        variant: "ghost" as const,
        mode: "secondary" as const,
      };
    }
    if (hasInsufficientFunds) {
      return {
        text: "Insufficient Funds",
        disabled: true,
        variant: "outline" as const,
        mode: "error" as const,
      };
    }
    return {
      text: "Subscribe",
      disabled: false,
      variant: undefined,
      mode: "primary" as const,
    };
  };

  const buttonConfig = getButtonConfig();

  return (
    <Box
      rounded="lg"
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background.default,
          borderColor: isActive ? plan.color : theme.colors.border.subtle,
          borderWidth: isActive ? 2 : 1,
        },
      ]}
    >
      {/* Header: Title + Cost */}
      <Box
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        p="md"
        style={styles.header}
      >
        <Box direction="row" alignItems="center" gap="sm">
          <Box
            center
            rounded="md"
            style={[
              styles.iconContainer,
              { backgroundColor: `${plan.color}20` },
            ]}
          >
            <Icon
              icon={Ionicons}
              name={plan.icon as any}
              size={24}
              color={plan.color}
            />
          </Box>
          <Box>
            <Text size="lg" weight="bold">
              {plan.title}
            </Text>
            <Text size="sm" style={{ color: plan.color }}>
              {plan.cost}
            </Text>
          </Box>
        </Box>

        {/* Active badge */}
        {isActive && (
          <Box
            px="sm"
            py="xs"
            rounded="full"
            style={{ backgroundColor: `${plan.color}20` }}
          >
            <Text size="xs" weight="semibold" style={{ color: plan.color }}>
              ACTIVE
            </Text>
          </Box>
        )}
      </Box>

      {/* Divider */}
      <View
        style={[
          styles.divider,
          { backgroundColor: theme.colors.border.subtle },
        ]}
      />

      {/* Short Features (visible when not expanded) */}
      <Animated.View style={[styles.featuresContainer, shortContentStyle]}>
        <Box px="md" pb="sm">
          {plan.shortFeatures.map((feature, index) => (
            <Box
              key={index}
              direction="row"
              alignItems="flex-start"
              gap="sm"
              style={styles.featureRow}
            >
              <Icon
                icon={Entypo}
                name="check"
                size={18}
                color={
                  feature.isHighlight ? plan.color : theme.colors.success[500]
                }
              />
              <Text
                size="sm"
                style={[
                  styles.featureText,
                  feature.isHighlight && {
                    color: plan.color,
                    fontWeight: "500",
                  },
                ]}
              >
                {feature.text}
              </Text>
            </Box>
          ))}
        </Box>
      </Animated.View>

      {/* Full Features (visible when expanded) */}
      <Animated.View style={[styles.featuresContainer, expandedContentStyle]}>
        <Box px="md" pb="sm">
          {/* Full features list */}
          {plan.fullFeatures.map((feature, index) => (
            <Box
              key={index}
              direction="row"
              alignItems="flex-start"
              gap="sm"
              style={styles.featureRow}
            >
              <Icon
                icon={Entypo}
                name="check"
                size={18}
                color={theme.colors.success[500]}
              />
              <Text size="sm" style={styles.featureText}>
                {feature.text}
              </Text>
            </Box>
          ))}
        </Box>
      </Animated.View>

      {/* See All Details / Hide Details Button */}
      <Pressable
        onPress={handleToggleExpand}
        style={({ pressed }) => [
          styles.seeDetailsButton,
          { borderTopColor: theme.colors.border.subtle },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Box direction="row" center gap="xs" py="sm">
          <Text size="sm" mode="subtle">
            {isExpanded ? "Hide details" : "See all details"}
          </Text>
          <Animated.View style={chevronStyle}>
            <Icon
              icon={Ionicons}
              name="chevron-down"
              size={16}
              color={theme.colors.text.subtle}
            />
          </Animated.View>
        </Box>
      </Pressable>

      {/* Action Button */}
      <Box px="md" pb="md" pt="sm">
        <Button
          size="md"
          variant={buttonConfig.variant}
          mode={buttonConfig.mode}
          rounded="lg"
          disabled={buttonConfig.disabled}
          onPress={handleSubscribe}
          style={[
            styles.actionButton,
            isActive && {
              backgroundColor: `${plan.color}15`,
              borderColor: plan.color,
              borderWidth: 1,
            },
          ]}
        >
          <Button.Text
            style={[
              isActive && { color: plan.color },
              hasInsufficientFunds && { color: theme.colors.error[500] },
            ]}
          >
            {buttonConfig.text}
          </Button.Text>
        </Button>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    overflow: "hidden",
  },
  header: {
    // Header styles
  },
  iconContainer: {
    width: 44,
    height: 44,
  },
  divider: {
    height: 1,
    marginHorizontal: theme.spacing.md,
  },
  featuresContainer: {
    overflow: "hidden",
  },
  featureRow: {
    paddingVertical: theme.spacing.xs,
  },
  featureText: {
    flex: 1,
    lineHeight: 20,
  },
  seeDetailsButton: {
    borderTopWidth: 1,
    marginHorizontal: theme.spacing.md,
  },
  actionButton: {
    width: "100%",
  },
}));
