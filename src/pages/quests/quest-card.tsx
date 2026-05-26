import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import type { DailyQuest } from "@/src/api/read/endpoints/rewards";
import { Box, Text } from "@/src/components/ui/primitives";
import { styles } from "./quests-styles";
import { ACTION_COLORS, ACTION_ICONS } from "./quests-ui-constants";

function QuestRequirements({ quest }: { quest: DailyQuest }) {
  const { theme } = useUnistyles();
  const requirements: string[] = [];
  const hasVoteProgress =
    quest.target_upvotes != null &&
    quest.upvotes != null &&
    quest.target_downvotes != null &&
    quest.downvotes != null;

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

  if (requirements.length === 0 && !hasVoteProgress) return null;

  return (
    <Box mt="sm" gap="xs">
      {hasVoteProgress && (
        <Box direction="row" gap="sm" mt="xs">
          <Box flex direction="row" alignItems="center" gap="xs">
            <Ionicons name="arrow-up" size={14} color="#10B981" />
            <Box
              flex
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: "rgba(255,255,255,0.1)",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  borderRadius: 3,
                  backgroundColor: "#10B981",
                  width: `${quest.target_upvotes! > 0 ? (quest.upvotes! / quest.target_upvotes!) * 100 : 0}%`,
                }}
              />
            </Box>
            <Text size="xs" mode="subtle">
              {quest.upvotes}/{quest.target_upvotes}
            </Text>
          </Box>
          <Box flex direction="row" alignItems="center" gap="xs">
            <Ionicons name="arrow-down" size={14} color="#8B5CF6" />
            <Box
              flex
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: "rgba(255,255,255,0.1)",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  borderRadius: 3,
                  backgroundColor: "#8B5CF6",
                  width: `${quest.target_downvotes! > 0 ? (quest.downvotes! / quest.target_downvotes!) * 100 : 0}%`,
                }}
              />
            </Box>
            <Text size="xs" mode="subtle">
              {quest.downvotes}/{quest.target_downvotes}
            </Text>
          </Box>
        </Box>
      )}
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

export function QuestCard({
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
  const primaryReward = quest.rewards[0];
  const baseReward = primaryReward?.amount ?? 0;
  const isInviteCode = primaryReward?.type === "invite_code";
  const shouldApplyMultiplier = primaryReward?.apply_multiplier !== false;
  const rewardAmount = shouldApplyMultiplier
    ? Math.floor(baseReward * rewardMultiplier)
    : baseReward;

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
                {isInviteCode ? `+${baseReward} Invite` : `+${rewardAmount}`}
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

