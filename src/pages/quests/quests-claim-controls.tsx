import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import type { DailyQuest } from "@/src/api/read/endpoints/rewards";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { styles } from "./quests-styles";
import { BUTTON_GRADIENT_COLORS } from "./quests-ui-constants";

export function RewardMultiplierBadge({ multiplier }: { multiplier: number }) {
  const { theme } = useUnistyles();
  const bounceAnim = useSharedValue(1);

  useEffect(() => {
    bounceAnim.value = withRepeat(
      withSequence(
        withSpring(1.1, { damping: 8 }),
        withSpring(1, { damping: 8 }),
      ),
      -1,
      true,
    );
  }, [bounceAnim]);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounceAnim.value }],
  }));

  return (
    <Animated.View style={bounceStyle}>
      <Box
        direction="row"
        alignItems="center"
        gap="xs"
        px="sm"
        py="xs"
        rounded="full"
        style={{
          backgroundColor: theme.colors.warning[500] + "20",
          borderWidth: 1,
          borderColor: theme.colors.warning[500] + "40",
        }}
      >
        <Ionicons name="flame" size={12} color={theme.colors.warning[500]} />
        <Text
          size="sm"
          weight="bold"
          style={{ color: theme.colors.warning[500] }}
        >
          {multiplier.toFixed(2)}x Rewards
        </Text>
      </Box>
    </Animated.View>
  );
}

export function ClaimAllButton({
  completedQuests,
  totalQuests,
  totalReward,
  onClaim,
  isClaiming,
  hasClaimed,
  payoutsEnabled = true,
  hasRewardsToClaim = false,
}: {
  completedQuests: DailyQuest[];
  totalQuests: number;
  totalReward: number;
  onClaim: () => void;
  isClaiming: boolean;
  hasClaimed: boolean;
  payoutsEnabled?: boolean;
  hasRewardsToClaim?: boolean;
}) {
  const canClaim = hasRewardsToClaim && !hasClaimed && payoutsEnabled;

  const handlePress = useCallback(() => {
    if (canClaim && !isClaiming) {
      triggerHaptic("medium");
      onClaim();
    }
  }, [canClaim, isClaiming, onClaim]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={!canClaim || isClaiming}
      style={({ pressed }) => [
        styles.claimAllButton,
        { opacity: pressed && canClaim ? 0.9 : canClaim ? 1 : 0.5 },
      ]}
    >
      <LinearGradient
        colors={[...BUTTON_GRADIENT_COLORS]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientButton}
      >
        {isClaiming ? (
          <>
            <Text size="lg" weight="bold" style={{ color: "#fff" }}>
              Claiming
            </Text>
            <ActivityIndicator
              size="small"
              color="#fff"
              style={{ marginLeft: 8 }}
            />
          </>
        ) : hasClaimed ? (
          <Text size="lg" weight="bold" style={{ color: "#fff" }}>
            Claimed
          </Text>
        ) : (
          <Text size="lg" weight="bold" style={{ color: "#fff" }}>
            Claim Rewards
          </Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function EmptyState() {
  const { theme } = useUnistyles();

  return (
    <Box flex alignItems="center" justifyContent="center" p="lg">
      <Box
        style={[
          styles.emptyIconContainer,
          { backgroundColor: theme.colors.background.subtle },
        ]}
      >
        <Ionicons
          name="trophy-outline"
          size={48}
          color={theme.colors.text.subtle}
        />
      </Box>
      <Text size="lg" weight="semibold" style={{ marginTop: 16 }}>
        No Quests Available
      </Text>
      <Text
        size="sm"
        mode="subtle"
        style={{ marginTop: 8, textAlign: "center" }}
      >
        Check back later for new daily quests!
      </Text>
    </Box>
  );
}

