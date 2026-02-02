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
};

export type Plan = {
  id: string;
  title: string;
  cost: string;
  costValue: number;
  shortFeatures: PlanFeature[];
  fullFeatures: PlanFeature[];
  color: string;
  icon: string;
};

type PlanCardProps = {
  plan: Plan;
  isActive: boolean;
  hasInsufficientFunds: boolean;
  isSubscribing?: boolean;
  onSubscribe?: (planId: string) => void;
};

export function PlanCard({
  plan,
  isActive,
  hasInsufficientFunds,
  isSubscribing,
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

  const getButtonConfig = () => {
    if (isActive) {
      return {
        text: "Active Plan",
        disabled: true,
        variant: "ghost" as const,
        mode: "secondary" as const,
        loading: false,
      };
    }
    if (isSubscribing) {
      return {
        text: "Subscribing...",
        disabled: true,
        variant: undefined,
        mode: "brand" as const,
        loading: true,
      };
    }
    if (hasInsufficientFunds) {
      return {
        text: "Insufficient Funds",
        disabled: true,
        variant: undefined,
        mode: "error" as const,
        loading: false,
      };
    }
    return {
      text: "Subscribe",
      disabled: false,
      variant: undefined,
      mode: "brand" as const,
      loading: false,
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

      <View
        style={[
          styles.divider,
          { backgroundColor: theme.colors.border.subtle },
        ]}
      />

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
                color={plan.color}
              />
              <Text size="sm" style={styles.featureText}>
                {feature.text}
              </Text>
            </Box>
          ))}
        </Box>
      </Animated.View>

      <Animated.View style={[styles.featuresContainer, expandedContentStyle]}>
        <Box px="md" pb="sm">
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
                color={plan.color}
              />
              <Text size="sm" style={styles.featureText}>
                {feature.text}
              </Text>
            </Box>
          ))}
        </Box>
      </Animated.View>

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

      <Box px="md" pb="md" pt="sm">
        <Button
          size="md"
          variant={buttonConfig.variant}
          mode={buttonConfig.mode}
          rounded="lg"
          disabled={buttonConfig.disabled}
          loading={buttonConfig.loading}
          onPress={handleSubscribe}
          style={[
            styles.actionButton,
            isActive && {
              backgroundColor: `${plan.color}15`,
              borderColor: plan.color,
              borderWidth: 1,
            },
            hasInsufficientFunds && {
              backgroundColor: `${theme.colors.error[500]}15`,
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
  header: {},
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
