import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  useSharedValue,
  withRepeat,
  interpolate,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useRewardSummary } from "@/src/api/read/hooks";
import { useNodeConfig } from "@/src/api/read/hooks/use-parameters";
import type { FlashQuest } from "@/src/api/read/endpoints/rewards";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { usePreferencesStore } from "@/src/stores";
import { useAuthStore } from "@/src/stores";

function formatTimeShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function SkeletonBox({
  width,
  height,
  borderRadius,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
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

function QuestsSummarySkeleton() {
  const { theme, rt } = useUnistyles();
  const isLightTheme = rt.themeName !== "dark";

  return (
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background.default,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <SkeletonBox width={36} height={36} borderRadius={10} />
            <View style={styles.titleContent}>
              <SkeletonBox width={100} height={16} />
              <SkeletonBox width={140} height={12} style={{ marginTop: 4 }} />
            </View>
          </View>
          <SkeletonBox width={20} height={20} borderRadius={10} />
        </View>
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: theme.colors.border.subtle,
          marginTop: theme.spacing.sm,
        }}
      />
    </>
  );
}

function FlashQuestSummaryCountdown({
  secondsRemaining: initial,
}: {
  secondsRemaining: number;
}) {
  const [seconds, setSeconds] = useState(initial);

  useEffect(() => {
    setSeconds(initial);
  }, [initial]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s: number) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${secs}s`;
}

function FlashQuestSummaryItem({ quest }: { quest: FlashQuest }) {
  const { theme } = useUnistyles();
  const accentColor = "#F59E0B";
  const progress = quest.target > 0 ? quest.progress / quest.target : 0;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: accentColor + "30",
        borderRadius: theme.radius.md,
        padding: theme.spacing.sm,
        backgroundColor: accentColor + "08",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="flash" size={13} color={accentColor} />
          <Text size="xs" weight="bold" style={{ color: accentColor, letterSpacing: 0.5 }}>
            FLASH
          </Text>
        </View>
        {!quest.completed && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Ionicons name="timer-outline" size={12} color={quest.seconds_remaining < 1800 ? theme.colors.error[500] : accentColor} />
            <Text
              size="xs"
              weight="semibold"
              style={{
                color: quest.seconds_remaining < 1800 ? theme.colors.error[500] : accentColor,
                fontVariant: ["tabular-nums"],
              }}
            >
              <FlashQuestSummaryCountdown secondsRemaining={quest.seconds_remaining} />
            </Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
        <Ionicons
          name={quest.completed ? "checkmark-circle" : "ellipse-outline"}
          size={16}
          color={quest.completed ? theme.colors.success[500] : accentColor}
        />
        <Text
          size="md"
          style={quest.completed ? { flex: 1 } : { flex: 1, opacity: 0.8 }}
          numberOfLines={1}
        >
          {quest.title}
        </Text>
        <Text size="sm" style={{ color: accentColor }}>
          {quest.progress}/{quest.target}
        </Text>
      </View>
      <View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: accentColor + "15",
          overflow: "hidden",
          marginTop: 6,
        }}
      >
        <View
          style={{
            height: "100%",
            borderRadius: 2,
            backgroundColor: quest.completed ? theme.colors.success[500] : accentColor,
            width: `${progress * 100}%`,
          }}
        />
      </View>
    </View>
  );
}

export function QuestsSummaryCard() {
  const { theme, rt } = useUnistyles();
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const { data: nodeConfig } = useNodeConfig();
  const questsEnabled = nodeConfig?.quests_enabled ?? true;
  const { data, isLoading } = useRewardSummary();
  const questsCardExpanded = usePreferencesStore((s) => s.questsCardExpanded);
  const setQuestsCardExpanded = usePreferencesStore(
    (s) => s.setQuestsCardExpanded,
  );

  const isLightTheme = rt.themeName !== "dark";

  const rotation = useDerivedValue(() => {
    return withTiming(questsCardExpanded ? 0 : 180, { duration: 200 });
  }, [questsCardExpanded]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const completedQuests = useMemo(() => {
    if (!data?.daily_quests) return [];
    return data.daily_quests.filter((q) => q.completed);
  }, [data?.daily_quests]);

  const totalQuests = data?.daily_quests?.length ?? 0;
  const completedCount = completedQuests.length;
  const progress = totalQuests > 0 ? completedCount / totalQuests : 0;
  const allComplete = completedCount === totalQuests && totalQuests > 0;

  const hasClaimed = useMemo(() => {
    if (!data) return false;
    return allComplete && data.pending_rewards.length === 0;
  }, [allComplete, data]);

  const hasRewardsToClaim = (data?.pending_rewards?.length ?? 0) > 0;

  const totalReward = useMemo(() => {
    const multiplier = data?.reward_multiplier ?? 1;
    return completedQuests.reduce((sum, quest) => {
      return Math.floor(sum + (quest.rewards[0]?.amount ?? 0) * multiplier);
    }, 0);
  }, [completedQuests, data?.reward_multiplier]);

  const handleViewQuests = useCallback(() => {
    triggerHaptic("light");
    router.push("/quests");
  }, [router]);

  const handleToggleExpand = useCallback(() => {
    triggerHaptic("light");
    setQuestsCardExpanded(!questsCardExpanded);
  }, [questsCardExpanded, setQuestsCardExpanded]);

  if (!isLoggedIn) return null;
  if (!questsEnabled) return null;
  if (isLoading && !data) return <QuestsSummarySkeleton />;
  if (!data?.daily_quests?.length && !data?.suspended) return null;

  if (data?.suspended && data?.suspension) {
    const suspendedUntil = new Date(data.suspension.suspended_until * 1000);
    const formattedDate = suspendedUntil.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedTime = suspendedUntil.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <>
        <Pressable
          onPress={handleViewQuests}
          style={[
            styles.container,
            {
              backgroundColor: theme.colors.background.default,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: "#EF444420" },
                ]}
              >
                <Ionicons
                  name="warning"
                  size={18}
                  color="#EF4444"
                />
              </View>
              <View style={styles.titleContent}>
                <Text size="md" weight="semibold" style={{ color: "#EF4444" }}>
                  Quests Suspended
                </Text>
                <Text size="sm" style={{ color: "#F87171" }} numberOfLines={2}>
                  {data.suspension.reason}
                </Text>
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.text.subtle}
            />
          </View>
          <View style={{ paddingHorizontal: theme.spacing.md + 2, paddingBottom: theme.spacing.md + 2 }}>
            <View
              style={{
                backgroundColor: "#EF444410",
                borderWidth: 1,
                borderColor: "#EF444425",
                borderRadius: theme.radius.md,
                padding: theme.spacing.sm,
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.sm,
              }}
            >
              <Ionicons name="time-outline" size={16} color="#F87171" />
              <Text size="sm" style={{ color: "#F87171" }}>
                Suspended until {formattedDate} at {formattedTime}
              </Text>
            </View>
          </View>
        </Pressable>
        <View
          style={{
            height: 1,
            backgroundColor: theme.colors.border.subtle,
          }}
        />
      </>
    );
  }

  return (
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background.default,
          },
        ]}
      >
        <Pressable onPress={handleToggleExpand} style={styles.header}>
          <View style={styles.titleRow}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: theme.colors.warning[500] + "20" },
              ]}
            >
              <Ionicons
                name="trophy"
                size={18}
                color={theme.colors.warning[500]}
              />
            </View>
            <View style={styles.titleContent}>
              <Text size="md" weight="semibold">
                Daily Quests
              </Text>
              <Text size="sm" mode="subtle">
                {completedCount}/{totalQuests} completed
                {data?.seconds_until_reset && (
                  <Text size="sm" mode="subtle">
                    {" "}
                    • {formatTimeShort(data.seconds_until_reset)} left
                  </Text>
                )}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {hasRewardsToClaim && (
              <View
                style={[
                  styles.rewardBadge,
                  { backgroundColor: theme.colors.success[500] + "20" },
                ]}
              >
                <Ionicons
                  name="sparkles"
                  size={12}
                  color={theme.colors.success[500]}
                />
                <Text
                  size="xs"
                  weight="bold"
                  style={{ color: theme.colors.success[500] }}
                >
                  +{totalReward.toLocaleString()}
                </Text>
              </View>
            )}
            <Animated.View style={chevronStyle}>
              <Ionicons
                name="chevron-up"
                size={20}
                color={theme.colors.text.subtle}
              />
            </Animated.View>
          </View>
        </Pressable>

        {questsCardExpanded && (
          <View style={styles.content}>
            <View
              style={[
                styles.progressContainer,
                { backgroundColor: theme.colors.background.subtle },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: allComplete
                      ? theme.colors.success[500]
                      : theme.colors.warning[500],
                    width: `${progress * 100}%`,
                  },
                ]}
              />
            </View>

            {data?.flash_quest && (
              <FlashQuestSummaryItem quest={data.flash_quest} />
            )}

            <View style={styles.questsList}>
              {data?.daily_quests.map((quest) => (
                <View key={quest.id} style={styles.questItem}>
                  <Ionicons
                    name={
                      quest.completed ? "checkmark-circle" : "ellipse-outline"
                    }
                    size={16}
                    color={
                      quest.completed
                        ? theme.colors.success[500]
                        : theme.colors.text.subtle
                    }
                  />
                  <Text
                    size="md"
                    style={
                      quest.completed ? { flex: 1 } : { flex: 1, opacity: 0.6 }
                    }
                    numberOfLines={1}
                  >
                    {quest.title}
                  </Text>
                  <Text size="sm" mode="subtle">
                    {quest.progress}/{quest.target}
                  </Text>
                </View>
              ))}
            </View>

            <Pressable
              onPress={handleViewQuests}
              disabled={hasClaimed}
              style={({ pressed }) => [
                styles.gradientButtonContainer,
                pressed && !hasClaimed && { opacity: 0.9 },
                hasClaimed && { opacity: 0.5 },
              ]}
            >
              <LinearGradient
                colors={["rgb(102, 126, 234)", "rgb(118, 75, 162)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientButton}
              >
                <Text size="md" weight="bold" style={{ color: "#FFFFFF" }}>
                  {hasRewardsToClaim
                    ? "Claim Rewards"
                    : hasClaimed
                      ? "Claimed"
                      : "View All Quests"}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: theme.colors.border.subtle,
          // marginTop: theme.spacing.sm,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md + 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  titleContent: {
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  rewardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md + 2,
    gap: theme.spacing.md,
  },
  progressContainer: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  questsList: {
    gap: theme.spacing.sm,
  },
  questItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  gradientButtonContainer: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  gradientButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
  },
}));
