import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useDailyQuests } from "@/src/api/read/hooks";
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
        <Text size="xs" mode="subtle">
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

function QuestCard({ quest }: { quest: DailyQuest }) {
  const { theme } = useUnistyles();
  const progressAnim = useSharedValue(0);
  const checkmarkScale = useSharedValue(quest.completed ? 1 : 0);

  const iconName = ACTION_ICONS[quest.action_type] || "star-outline";
  const accentColor =
    ACTION_COLORS[quest.action_type] || theme.colors.primary[500];
  const progress = quest.target > 0 ? quest.progress / quest.target : 0;
  const rewardAmount = quest.rewards[0]?.amount ?? 0;

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
          backgroundColor: theme.colors.background.default,
          borderWidth: 1,
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
  totalReward,
  onClaim,
  isClaiming,
  hasClaimed,
}: {
  completedQuests: DailyQuest[];
  totalReward: number;
  onClaim: () => void;
  isClaiming: boolean;
  hasClaimed: boolean;
}) {
  const handlePress = useCallback(() => {
    if (!isClaiming) {
      triggerHaptic("medium");
      onClaim();
    }
  }, [isClaiming, onClaim]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={isClaiming}
      style={({ pressed }) => [
        styles.claimAllButton,
        { opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <LinearGradient
        colors={[...BUTTON_GRADIENT_COLORS]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientButton}
      >
        {isClaiming ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text size="lg" weight="bold" style={{ color: "#fff" }}>
            Complete Quests
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
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);

  const claimMutation = useClaimReward({
    onSuccess: (response) => {
      setHasClaimed(true);
      setIsClaiming(false);
      triggerHaptic("success");
      Alert.alert(
        "Rewards Claimed!",
        response.message || "Your rewards have been added to your balance.",
        [{ text: "OK" }],
      );
      refetch();
    },
    onError: (error) => {
      setIsClaiming(false);
      triggerHaptic("error");
      Alert.alert(
        "Claim Failed",
        error.message || "Failed to claim rewards. Please try again.",
        [{ text: "OK" }],
      );
    },
  });

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
    return completedQuests.reduce((sum, quest) => {
      return sum + (quest.rewards[0]?.amount ?? 0);
    }, 0);
  }, [completedQuests]);

  const handleClaimAll = useCallback(() => {
    if (completedQuests.length === 0) return;
    setIsClaiming(true);
    claimMutation.mutate({ questId: "all" });
  }, [completedQuests, claimMutation]);

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
              <QuestCard key={quest.id} quest={quest} />
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
              totalReward={totalReward}
              onClaim={handleClaimAll}
              isClaiming={isClaiming}
              hasClaimed={hasClaimed}
            />
          </Box>
        </View>
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
    alignItems: "center",
    justifyContent: "center",
  },
}));
