import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Pressable, View } from "react-native";
import Animated, {
 useAnimatedStyle,
 useDerivedValue,
 withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useDailyQuests, usePendingRewards } from "@/src/api/read/hooks";
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

export function QuestsSummaryCard() {
 const { theme, rt } = useUnistyles();
 const router = useRouter();
 const { data, isLoading } = useDailyQuests();
  const { data: pendingData } = usePendingRewards();
 const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
 const questsCardExpanded = usePreferencesStore((s) => s.questsCardExpanded);
 const setQuestsCardExpanded = usePreferencesStore((s) => s.setQuestsCardExpanded);

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
    if (!pendingData) return false;
    return completedCount > 0 && pendingData.pending_rewards.length === 0;
  }, [completedCount, pendingData]);

  const hasRewardsToClaim = completedCount > 0 && !hasClaimed;

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

  if (!isLoggedIn || (isLoading && !data)) return null;
  if (!data?.daily_quests?.length) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background.default,
          borderColor: theme.colors.border.subtle,
        },
        isLightTheme && {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 4,
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
            <Ionicons name="trophy" size={18} color={theme.colors.warning[500]} />
          </View>
          <View style={styles.titleContent}>
            <Text size="md" weight="semibold">
              Daily Quests
            </Text>
            <Text size="xs" mode="subtle">
              {completedCount}/{totalQuests} completed
              {data?.seconds_until_reset && (
                <Text size="xs" mode="subtle">
                  {" "}• {formatTimeShort(data.seconds_until_reset)} left
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
              <Ionicons name="sparkles" size={12} color={theme.colors.success[500]} />
              <Text size="xs" weight="bold" style={{ color: theme.colors.success[500] }}>
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

          <View style={styles.questsList}>
            {data?.daily_quests.slice(0, 3).map((quest) => (
              <View key={quest.id} style={styles.questItem}>
                <Ionicons
                  name={quest.completed ? "checkmark-circle" : "ellipse-outline"}
                  size={16}
                  color={
                    quest.completed
                      ? theme.colors.success[500]
                      : theme.colors.text.subtle
                  }
                />
                <Text
                  size="sm"
                  style={quest.completed ? { flex: 1 } : { flex: 1, opacity: 0.6 }}
                  numberOfLines={1}
                >
                  {quest.title}
                </Text>
                <Text size="xs" mode="subtle">
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
            <Text size="sm" weight="semibold" style={{ color: "#FFFFFF" }}>
               {hasRewardsToClaim ? "Claim Rewards" : hasClaimed ? "Claimed" : "View All Quests"}
            </Text>
           </LinearGradient>
         </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
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
    paddingBottom: theme.spacing.md,
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
