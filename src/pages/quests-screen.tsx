import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useDailyQuests } from "@/src/api/read/hooks";
import { usePendingRewards } from "@/src/api/read/hooks";
import { useClaimReward } from "@/src/api/write/hooks";
import type { DailyQuest } from "@/src/api/read/endpoints/quests";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

const ACTION_ICONS: Record<string, string> = {
  comment: "chatbubble-outline",
  vote: "thumbs-up-outline",
  post: "create-outline",
  follow: "person-add-outline",
  share: "share-outline",
};

const ACTION_COLORS: Record<string, string> = {
  comment: "#3B82F6",
  vote: "#10B981",
  post: "#8B5CF6",
  follow: "#F59E0B",
  share: "#EC4899",
};

const BUTTON_GRADIENT_COLORS: readonly [string, string] = [
  "rgb(102, 126, 234)",
  "rgb(118, 75, 162)",
];

const CONFETTI_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E9",
];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

function ConfettiPiece({ delay, index }: { delay: number; index: number }) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  const startX = Math.random() * SCREEN_WIDTH;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const size = 8 + Math.random() * 8;
  const isCircle = Math.random() > 0.5;

  useEffect(() => {
    const drift = (Math.random() - 0.5) * 100;

    translateY.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT + 100, {
        duration: 3000 + Math.random() * 2000,
        easing: Easing.out(Easing.quad),
      }),
    );

    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(drift, { duration: 500 }),
          withTiming(-drift, { duration: 500 }),
        ),
        -1,
        true,
      ),
    );

    rotate.value = withDelay(
      delay,
      withRepeat(
        withTiming(360, { duration: 1000 + Math.random() * 1000 }),
        -1,
        false,
      ),
    );

    opacity.value = withDelay(delay + 2000, withTiming(0, { duration: 1000 }));

    scale.value = withDelay(
      delay,
      withSequence(
        withSpring(1.2, { damping: 8 }),
        withSpring(1, { damping: 10 }),
      ),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: startX,
          top: 0,
          width: size,
          height: isCircle ? size : size * 0.6,
          backgroundColor: color,
          borderRadius: isCircle ? size / 2 : 2,
        },
        animatedStyle,
      ]}
    />
  );
}

function ConfettiAnimation({ isVisible }: { isVisible: boolean }) {
  if (!isVisible) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      {Array.from({ length: 50 }).map((_, i) => (
        <ConfettiPiece key={i} index={i} delay={i * 30} />
      ))}
    </View>
  );
}

function ClaimSuccessModal({
  visible,
  rewardAmount,
  onClose,
}: {
  visible: boolean;
  rewardAmount: number;
  onClose: () => void;
}) {
  const { theme } = useUnistyles();
  const scaleAnim = useSharedValue(0);
  const opacityAnim = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacityAnim.value = withTiming(1, { duration: 300 });
      scaleAnim.value = withSequence(
        withSpring(1.03, { damping: 15, stiffness: 300 }),
        withSpring(1, { damping: 15 }),
      );
    } else {
      opacityAnim.value = withTiming(0, { duration: 200 });
      scaleAnim.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: opacityAnim.value * 0.7,
  }));

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
    opacity: opacityAnim.value,
  }));

  const handleClose = useCallback(() => {
    triggerHaptic("light");
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#000",
            },
            backdropStyle,
          ]}
        />
        <ConfettiAnimation isVisible={visible} />
        <Animated.View
          style={[
            {
              backgroundColor: theme.colors.background.default,
              borderRadius: 24,
              padding: 32,
              alignItems: "center",
              marginHorizontal: 32,
              borderWidth: 1,
              borderColor: theme.colors.border.subtle,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 10,
            },
            modalStyle,
          ]}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: theme.colors.success[500] + "20",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Ionicons
              name="trophy"
              size={40}
              color={theme.colors.success[500]}
            />
          </View>

          <Text
            size="xl"
            weight="bold"
            style={{ marginBottom: 8, textAlign: "center" }}
          >
            Rewards Claimed!
          </Text>

          <Box
            direction="row"
            alignItems="center"
            gap="xs"
            style={{ marginBottom: 24 }}
          >
            <Ionicons
              name="sparkles"
              size={20}
              color={theme.colors.warning[500]}
            />
            <Text
              size="lg"
              weight="bold"
              style={{ color: theme.colors.warning[500] }}
            >
              +{rewardAmount.toLocaleString()} MRG
            </Text>
          </Box>

          <Text
            size="sm"
            mode="subtle"
            style={{ textAlign: "center", marginBottom: 24 }}
          >
            Your rewards have been added to your balance
          </Text>

          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              {
                paddingHorizontal: 48,
                borderRadius: 12,
                overflow: "hidden",
              },
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <LinearGradient
              colors={[...BUTTON_GRADIENT_COLORS]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 32,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
              }}
            >
              <Text size="md" weight="bold" style={{ color: "#fff" }}>
                Awesome!
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function formatTimeRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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

function QuestsSkeleton() {
  const { theme } = useUnistyles();

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: theme.spacing.lg,
        paddingHorizontal: theme.spacing.md,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Box
        rounded="lg"
        p="lg"
        mb="lg"
        style={{
          backgroundColor: theme.colors.background.default,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        }}
      >
        <Box alignItems="center" gap="md">
          <SkeletonBox width={120} height={16} />
          <SkeletonBox width={180} height={48} borderRadius={theme.radius.md} />
          <SkeletonBox width={200} height={14} />
        </Box>
      </Box>

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
          <Box direction="row" alignItems="center" gap="sm" mb="md">
            <SkeletonBox
              width={36}
              height={36}
              borderRadius={theme.radius.md}
            />
            <Box flex gap="xs">
              <SkeletonBox width={120} height={18} />
              <SkeletonBox width={180} height={14} />
            </Box>
          </Box>
          <SkeletonBox width="100%" height={8} borderRadius={4} />
          <Box direction="row" justifyContent="space-between" mt="sm">
            <SkeletonBox width={60} height={14} />
            <SkeletonBox width={80} height={14} />
          </Box>
        </Box>
      ))}
    </ScrollView>
  );
}

function CountdownTimer({
  secondsRemaining,
  onTick,
}: {
  secondsRemaining: number;
  onTick: (seconds: number) => void;
}) {
  const { theme } = useUnistyles();
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [pulseAnim]);

  useEffect(() => {
    const interval = setInterval(() => {
      onTick(Math.max(0, secondsRemaining - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining, onTick]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const progress = 1 - secondsRemaining / (24 * 60 * 60);

  return (
    <Box
      rounded="lg"
      p="lg"
      mb="lg"
      style={[
        styles.timerCard,
        {
          backgroundColor: theme.colors.background.default,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        },
      ]}
    >
      <Box
        style={[
          styles.timerGlow,
          { backgroundColor: theme.colors.primary[500] },
        ]}
      />
      <Box
        style={[
          styles.timerGlowLeft,
          { backgroundColor: theme.colors.primary[500] },
        ]}
      />
      <Box
        style={[
          styles.timerGlowRight,
          { backgroundColor: theme.colors.primary[500] },
        ]}
      />
      <Box alignItems="center" gap="sm">
        <Text size="sm" weight="semibold" mode="subtle">
          TIME REMAINING
        </Text>
        <Animated.View style={pulseStyle}>
          <Text
            size="mega"
            weight="bold"
            style={{ color: theme.colors.primary[500], letterSpacing: 2 }}
          >
            {formatTimeRemaining(secondsRemaining)}
          </Text>
        </Animated.View>
        <Box
          style={[
            styles.progressBarContainer,
            { backgroundColor: "rgba(255,255,255,0.1)" },
          ]}
        >
          <Box
            style={[
              styles.progressBarFill,
              {
                backgroundColor: theme.colors.primary[500],
                width: `${progress * 100}%`,
              },
            ]}
          />
        </Box>
        <Text size="sm" mode="subtle">
          Complete quests before timer resets
        </Text>
      </Box>
    </Box>
  );
}

function QuestRequirements({ quest }: { quest: DailyQuest }) {
  const { theme } = useUnistyles();
  const requirements: string[] = [];

  if (quest.min_content_length && quest.min_content_length > 0) {
    requirements.push(`Minimum ${quest.min_content_length} characters`);
  }

  if (quest.unique_target === true) {
    requirements.push("Must be different targets");
  }

  if (quest.count_vote_changes === false) {
    requirements.push("New votes only (changes don't count)");
  }

  if (quest.time_spacing_minutes && quest.time_spacing_minutes > 0) {
    requirements.push(`${quest.time_spacing_minutes} min between actions`);
  }

  if (quest.unique_topics_min && quest.unique_topics_min > 0) {
    requirements.push(`At least ${quest.unique_topics_min} different topics`);
  }

  if (requirements.length === 0) return null;

  return (
    <Box mt="sm" gap="xs">
      {requirements.map((req, index) => (
        <Box key={index} direction="row" alignItems="center" gap="xs">
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.text.subtle,
            }}
          />
          <Text size="sm" mode="subtle">
            {req}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

function QuestCard({
  quest,
  rewardMultiplier,
}: {
  quest: DailyQuest;
  rewardMultiplier: number;
}) {
  const { theme } = useUnistyles();
  const progressAnim = useSharedValue(0);
  const checkmarkScale = useSharedValue(quest.completed ? 1 : 0);

  const iconName = ACTION_ICONS[quest.action_type] || "star-outline";
  const accentColor =
    ACTION_COLORS[quest.action_type] || theme.colors.primary[500];
  const progress = quest.target > 0 ? quest.progress / quest.target : 0;
  const baseReward = quest.rewards[0]?.amount ?? 0;
  const rewardAmount = Math.floor(baseReward * rewardMultiplier);

  useEffect(() => {
    progressAnim.value = withSpring(progress, { damping: 15, stiffness: 100 });
  }, [progress, progressAnim]);

  useEffect(() => {
    checkmarkScale.value = withSpring(quest.completed ? 1 : 0, {
      damping: 12,
      stiffness: 200,
    });
  }, [quest.completed, checkmarkScale]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%`,
  }));

  const checkmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkmarkScale.value }],
    opacity: checkmarkScale.value,
  }));

  return (
    <Box
      rounded="lg"
      p="md"
      mb="md"
      style={[
        styles.questCard,
        {
          backgroundColor: quest.completed
            ? theme.colors.success[500] + "10"
            : theme.colors.background.default,
          borderWidth: quest.completed ? 2 : 1,
          borderColor: quest.completed
            ? theme.colors.success[500] + "40"
            : theme.colors.border.subtle,
        },
      ]}
    >
      <Box direction="row" alignItems="center" gap="sm">
        <Box
          style={[
            styles.questIconContainer,
            { backgroundColor: accentColor + "20" },
          ]}
        >
          <Ionicons name={iconName as any} size={18} color={accentColor} />
          {quest.completed && (
            <Animated.View style={[styles.checkmarkBadge, checkmarkStyle]}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={theme.colors.success[500]}
              />
            </Animated.View>
          )}
        </Box>

        <Box flex>
          <Box
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Text
              size="md"
              weight="semibold"
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {quest.title}
            </Text>
            <Box
              direction="row"
              alignItems="center"
              gap="xs"
              style={[
                styles.rewardBadge,
                { backgroundColor: theme.colors.warning[500] + "20" },
              ]}
            >
              <Ionicons
                name="sparkles"
                size={12}
                color={theme.colors.warning[500]}
              />
              <Text
                size="sm"
                weight="bold"
                style={{ color: theme.colors.warning[500] }}
              >
                +{rewardAmount}
              </Text>
            </Box>
          </Box>
          <Text
            size="sm"
            mode="subtle"
            numberOfLines={2}
            style={{ marginTop: 2 }}
          >
            {quest.description}
          </Text>
        </Box>
      </Box>

      <QuestRequirements quest={quest} />

      <Box mt="md">
        <Box
          style={[
            styles.questProgressContainer,
            { backgroundColor: "rgba(255,255,255,0.1)" },
          ]}
        >
          <Animated.View
            style={[
              styles.questProgressFill,
              {
                backgroundColor: quest.completed
                  ? theme.colors.success[500]
                  : accentColor,
              },
              progressStyle,
            ]}
          />
        </Box>
        <Box
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          mt="xs"
        >
          <Text size="sm" mode="subtle">
            {quest.progress} / {quest.target}
          </Text>
          <Text
            size="sm"
            weight="semibold"
            style={{
              color: quest.completed
                ? theme.colors.success[500]
                : theme.colors.text.subtle,
            }}
          >
            {quest.completed ? "Completed!" : `${Math.round(progress * 100)}%`}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function RewardMultiplierBadge({ multiplier }: { multiplier: number }) {
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

function ClaimAllButton({
  completedQuests,
  totalQuests,
  totalReward,
  onClaim,
  isClaiming,
  hasClaimed,
  powStatus,
}: {
  completedQuests: DailyQuest[];
  totalQuests: number;
  totalReward: number;
  onClaim: () => void;
  isClaiming: boolean;
  hasClaimed: boolean;
  powStatus: string | null;
}) {
  const canClaim = completedQuests.length > 0 && !hasClaimed;

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
        style={[styles.gradientButton, isClaiming && styles.claimingGradient]}
      >
        {isClaiming ? (
          <>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text size="lg" weight="bold" style={{ color: "#fff" }}>
                Claiming
              </Text>
              {powStatus && (
                <Text
                  size="xs"
                  weight="medium"
                  style={{ color: "#fff", opacity: 0.8 }}
                >
                  {powStatus}
                </Text>
              )}
            </View>
            <ActivityIndicator
              size="small"
              color="#fff"
              style={{ position: "absolute", right: 16 }}
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

function EmptyState() {
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

export function QuestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const { data, isLoading, error, refetch } = useDailyQuests();
  const { data: pendingData, refetch: refetchPending } = usePendingRewards();
 const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isClaiming, setIsClaiming] = useState(false);
 const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [powStatus, setPowStatus] = useState<string | null>(null);

  const claimMutation = useClaimReward({
    onSuccess: (response) => {
      setIsClaiming(false);
      setPowStatus(null);
      triggerHaptic("success");
      setShowSuccessModal(true);
      refetch();
      refetchPending();
    },
    onError: (error) => {
      setIsClaiming(false);
      setPowStatus(null);
      triggerHaptic("error");
      Alert.alert(
        "Claim Failed",
        error.message || "Failed to claim rewards. Please try again.",
        [{ text: "OK" }],
      );
    },
    onPoWProgress: (progress) => {
      const elapsed = Math.round(progress.elapsedMs / 1000);
      const hashRate =
        progress.elapsedMs > 0
          ? Math.round(progress.attempts / (progress.elapsedMs / 1000))
          : 0;
      setPowStatus(`POW: ${elapsed}s • ${hashRate.toLocaleString()} H/s`);
    },
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchPending();
    }, [refetch, refetchPending]),
  );

  useEffect(() => {
    if (data?.seconds_until_reset) {
      setTimeRemaining(data.seconds_until_reset);
    }
  }, [data?.seconds_until_reset]);

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  const handleTimeTick = useCallback((seconds: number) => {
    setTimeRemaining(seconds);
  }, []);

  const completedQuests = useMemo(() => {
    if (!data?.daily_quests) return [];
    return data.daily_quests.filter((q) => q.completed);
  }, [data?.daily_quests]);

  const totalReward = useMemo(() => {
    const multiplier = data?.reward_multiplier ?? 1;
    return completedQuests.reduce((sum, quest) => {
      return Math.floor(sum + (quest.rewards[0]?.amount ?? 0) * multiplier);
    }, 0);
  }, [completedQuests, data?.reward_multiplier]);

  const hasClaimed = useMemo(() => {
    if (!pendingData) return false;
    return (
      completedQuests.length > 0 && pendingData.pending_rewards.length === 0
    );
  }, [completedQuests.length, pendingData]);

  const handleClaimAll = useCallback(() => {
    if (completedQuests.length === 0) return;
    setIsClaiming(true);
    setPowStatus("Preparing...");
    claimMutation.mutate({ questId: "all" });
  }, [completedQuests, claimMutation]);

  const handleCloseSuccessModal = useCallback(() => {
    setShowSuccessModal(false);
  }, []);

  const totalCount = data?.daily_quests?.length ?? 0;

  if (error) {
    console.error("[QuestsScreen] Failed to fetch quests:", error);
  }

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
          Daily Quests
        </Text>
        <View style={styles.placeholder} />
      </View>

      {isLoading ? (
        <QuestsSkeleton />
      ) : !data?.daily_quests?.length ? (
        <EmptyState />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Box px="md">
            <Box
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              mb="md"
            >
              <Box>
                <Text size="xs" weight="semibold" mode="subtle">
                  PROGRESS
                </Text>
                <Text size="xl" weight="bold">
                  {completedQuests.length} / {totalCount}
                </Text>
              </Box>
              {data.reward_multiplier > 1 && (
                <RewardMultiplierBadge multiplier={data.reward_multiplier} />
              )}
            </Box>

            <CountdownTimer
              secondsRemaining={timeRemaining}
              onTick={handleTimeTick}
            />

            <Text
              size="xs"
              weight="semibold"
              mode="subtle"
              style={styles.sectionTitle}
            >
              TODAY'S QUESTS
            </Text>

            {data.daily_quests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                rewardMultiplier={data.reward_multiplier}
              />
            ))}

            {data.suspended && (
              <Box
                p="md"
                rounded="lg"
                mt="md"
                style={{
                  backgroundColor: theme.colors.error[500] + "10",
                  borderWidth: 1,
                  borderColor: theme.colors.error[500] + "30",
                }}
              >
                <Box direction="row" alignItems="center" gap="sm">
                  <Ionicons
                    name="warning"
                    size={20}
                    color={theme.colors.error[500]}
                  />
                  <Text
                    size="sm"
                    weight="medium"
                    style={{ color: theme.colors.error[500] }}
                  >
                    Quest rewards are currently suspended
                  </Text>
                </Box>
              </Box>
            )}
          </Box>
        </ScrollView>
      )}

      {!isLoading && data?.daily_quests?.length && !data.suspended && (
        <View
          style={[
            styles.claimButtonContainer,
            {
              paddingBottom: insets.bottom + 16,
              backgroundColor: theme.colors.background.default,
            },
          ]}
        >
          <Box px="md">
            <ClaimAllButton
              completedQuests={completedQuests}
              totalQuests={totalCount}
              totalReward={totalReward}
              onClaim={handleClaimAll}
              isClaiming={isClaiming}
              hasClaimed={hasClaimed}
              powStatus={powStatus}
            />
          </Box>
        </View>
      )}

      <ClaimSuccessModal
        visible={showSuccessModal}
        rewardAmount={totalReward || 1250}
        onClose={handleCloseSuccessModal}
      />
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
    marginBottom: theme.spacing.md,
  },
  timerCard: {
    overflow: "hidden",
  },
  timerGlow: {
    position: "absolute",
    top: -50,
    left: "25%",
    width: "50%",
    height: 100,
    borderRadius: 50,
    opacity: 0.1,
  },
  timerGlowLeft: {
    position: "absolute",
    bottom: -30,
    left: -80,
    width: 120,
    height: 120,
    borderRadius: 35,
    opacity: 0.08,
  },
  timerGlowRight: {
    position: "absolute",
    bottom: -30,
    right: -50,
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.08,
  },
  progressBarContainer: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: theme.spacing.sm,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  questCard: {
    overflow: "hidden",
  },
  questIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmarkBadge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    backgroundColor: "white",
    borderRadius: 8,
  },
  rewardBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
  },
  questProgressContainer: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  questProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  claimButtonContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: theme.spacing.md,
  },
  claimAllButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  gradientButton: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  claimingGradient: {
    paddingVertical: 11,
  },
}));
