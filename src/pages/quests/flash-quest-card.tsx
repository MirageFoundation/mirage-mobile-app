import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import type { FlashQuest } from "@/src/api/read/endpoints/rewards";
import { Box, Text } from "@/src/components/ui/primitives";

function FlashQuestCountdown({
  secondsRemaining: initial,
}: {
  secondsRemaining: number;
}) {
  const { theme } = useUnistyles();
  const [seconds, setSeconds] = useState(initial);

  useEffect(() => {
    setSeconds(initial);
  }, [initial]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const isUrgent = seconds < 1800;
  const color = isUrgent ? theme.colors.error[500] : "#F59E0B";

  return (
    <Box direction="row" alignItems="center" gap="xs">
      <Ionicons name="timer-outline" size={14} color={color} />
      <Text size="sm" weight="bold" style={{ color, fontVariant: ["tabular-nums"] }}>
        {hours > 0 && `${hours}h `}{mins.toString().padStart(2, "0")}m {secs.toString().padStart(2, "0")}s
      </Text>
    </Box>
  );
}

export function FlashQuestCard({ quest, rewardMultiplier }: { quest: FlashQuest; rewardMultiplier: number }) {
  const { theme } = useUnistyles();
  const progressAnim = useSharedValue(0);
  const shimmer = useSharedValue(0);

  const progress = quest.target > 0 ? quest.progress / quest.target : 0;
  const primaryReward = quest.rewards[0];
  const baseReward = primaryReward?.amount ?? 0;
  const shouldApplyMultiplier = primaryReward?.apply_multiplier !== false;
  const rewardAmount = shouldApplyMultiplier
    ? Math.floor(baseReward * rewardMultiplier)
    : baseReward;
  const accentColor = "#F59E0B";

  useEffect(() => {
    progressAnim.value = withSpring(progress, { damping: 15, stiffness: 100 });
  }, [progress, progressAnim]);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [shimmer]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%`,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(245, 158, 11, ${interpolate(shimmer.value, [0, 1], [0.3, 0.7])})`,
  }));

  const requirements: string[] = [];
  if (quest.unique_target) requirements.push("Must be different targets");
  if (quest.count_vote_changes === false) requirements.push("New votes only");
  if (quest.time_spacing_minutes && quest.time_spacing_minutes > 0)
    requirements.push(`${quest.time_spacing_minutes} min between actions`);
  if (quest.unique_topics_min && quest.unique_topics_min > 0)
    requirements.push(`At least ${quest.unique_topics_min} different topics`);
  if (quest.min_content_length && quest.min_content_length > 0)
    requirements.push(`Minimum ${quest.min_content_length} characters`);

  return (
    <Animated.View
      style={[
        {
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.md,
          overflow: "hidden",
          borderWidth: 2,
          backgroundColor: quest.completed
            ? theme.colors.success[500] + "10"
            : accentColor + "08",
        },
        borderStyle,
      ]}
    >
      <LinearGradient
        colors={[accentColor + "15", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      <Box direction="row" alignItems="center" justifyContent="space-between" mb="sm">
        <Box direction="row" alignItems="center" gap="xs" px="sm" py="xs" rounded="full"
          style={{ backgroundColor: accentColor + "20" }}
        >
          <Ionicons name="flash" size={14} color={accentColor} />
          <Text size="xs" weight="bold" style={{ color: accentColor, letterSpacing: 1 }}>
            FLASH QUEST
          </Text>
        </Box>
        {!quest.completed && (
          <FlashQuestCountdown secondsRemaining={quest.seconds_remaining} />
        )}
      </Box>

      <Box direction="row" alignItems="center" gap="sm">
        <Box
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: accentColor + "20",
          }}
        >
          <Ionicons name="flash" size={18} color={accentColor} />
          {quest.completed && (
            <View style={{ position: "absolute", bottom: -3, right: -3, backgroundColor: "white", borderRadius: 8 }}>
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.success[500]} />
            </View>
          )}
        </Box>
        <Box flex>
          <Box direction="row" alignItems="center" justifyContent="space-between">
            <Text size="md" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
              {quest.title}
            </Text>
            <Box direction="row" alignItems="center" gap="xs"
              style={{
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 3,
                borderRadius: 20,
                backgroundColor: theme.colors.warning[500] + "20",
              }}
            >
              <Ionicons name="sparkles" size={12} color={theme.colors.warning[500]} />
              <Text size="sm" weight="bold" style={{ color: theme.colors.warning[500] }}>
                +{rewardAmount}
              </Text>
            </Box>
          </Box>
          <Text size="sm" mode="subtle" numberOfLines={2} style={{ marginTop: 2 }}>
            {quest.description}
          </Text>
        </Box>
      </Box>

      {requirements.length > 0 && (
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
      )}

      <Box mt="md">
        <Box
          style={{
            width: "100%",
            height: 6,
            borderRadius: 3,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.1)",
          }}
        >
          <Animated.View
            style={[
              {
                height: "100%",
                borderRadius: 3,
                backgroundColor: quest.completed
                  ? theme.colors.success[500]
                  : accentColor,
              },
              progressStyle,
            ]}
          />
        </Box>
        <Box direction="row" justifyContent="space-between" alignItems="center" mt="xs">
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
    </Animated.View>
  );
}

