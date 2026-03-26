import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useRewardSummary } from "@/src/api/read/hooks";
import { useNodeConfig } from "@/src/api/read/hooks/use-parameters";
import { useClaimReward } from "@/src/api/write/hooks";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

import {
  ClaimAllButton,
  ClaimSuccessModal,
  CountdownTimer,
  EmptyState,
  FlashQuestCard,
  QuestsSkeleton,
  QuestCard,
  RewardMultiplierBadge,
} from "./quests/quest-components";

export function QuestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();

  const { data: nodeConfig } = useNodeConfig();
  const questsEnabled = nodeConfig?.quests_enabled ?? true;
  const payoutsEnabled = nodeConfig?.quest_payouts_enabled ?? true;

  const { data, isLoading, error, refetch } = useRewardSummary();
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [claimedRewardAmount, setClaimedRewardAmount] = useState(0);
  const [claimedInviteCodes, setClaimedInviteCodes] = useState(0);

  const claimMutation = useClaimReward({
    onSuccess: (response) => {
      setIsClaiming(false);
      triggerHaptic("success");
      const inviteRewards = response.rewards?.filter((reward) => reward.type === "invite_code") ?? [];
      const invites = inviteRewards.reduce((sum, reward) => sum + reward.amount, 0);
      setClaimedInviteCodes(invites);
      setShowSuccessModal(true);
      refetch();
    },
    onError: (claimError) => {
      setIsClaiming(false);
      triggerHaptic("error");
      Alert.alert(
        "Claim Failed",
        claimError.message || "Failed to claim rewards. Please try again.",
        [{ text: "OK" }],
      );
    },
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
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
    return data.daily_quests.filter((quest) => quest.completed);
  }, [data?.daily_quests]);

  const totalReward = useMemo(() => {
    return Math.floor((data?.total_mirage_after_multiplier ?? 0) / 1_000_000);
  }, [data?.total_mirage_after_multiplier]);

  const allQuestsCompleted = useMemo(() => {
    if (!data?.daily_quests?.length) return false;
    return data.daily_quests.every((quest) => quest.completed);
  }, [data?.daily_quests]);

  const hasClaimed = useMemo(() => {
    if (!data) return false;
    return allQuestsCompleted && data.pending_rewards.length === 0;
  }, [allQuestsCompleted, data]);

  const handleClaimAll = useCallback(() => {
    if ((data?.pending_rewards?.length ?? 0) === 0) return;
    setIsClaiming(true);
    setClaimedRewardAmount(totalReward);
    claimMutation.mutate({ questId: "all" });
  }, [claimMutation, data?.pending_rewards, totalReward]);

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
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
        >
          <EvilIcons name="close" size={28} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="medium">
          Daily Quests
        </Text>
        <View style={styles.placeholder} />
      </View>

      {!questsEnabled ? (
        <Box flex center p="lg">
          <Ionicons
            name="trophy-outline"
            size={48}
            color={theme.colors.text.subtle}
            style={{ marginBottom: 12 }}
          />
          <Text
            size="lg"
            weight="semibold"
            style={{ textAlign: "center", marginBottom: 8 }}
          >
            Quests Unavailable
          </Text>
          <Text size="md" mode="subtle" style={{ textAlign: "center" }}>
            Quests are not enabled on this server.
          </Text>
        </Box>
      ) : isLoading ? (
        <QuestsSkeleton />
      ) : data?.suspended && data?.suspension ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Box px="md">
            <Box
              alignItems="center"
              p="lg"
              rounded="lg"
              style={styles.suspendedCard}
            >
              <View style={styles.suspendedIconWrap}>
                <Ionicons name="warning" size={40} color="#EF4444" />
              </View>
              <Text
                size="xl"
                weight="bold"
                style={styles.suspendedTitle}
              >
                Your quest rewards have been suspended
              </Text>
              <Text size="md" style={styles.suspendedReason}>
                {data.suspension.reason}
              </Text>
              <View style={[styles.suspendedUntilCard, { borderRadius: theme.radius.md }]}> 
                <Ionicons name="time-outline" size={20} color="#F87171" />
                <View style={{ flex: 1 }}>
                  <Text size="xs" weight="semibold" style={styles.suspendedLabel}>
                    SUSPENDED UNTIL
                  </Text>
                  <Text size="md" weight="semibold" style={{ color: "#EF4444" }}>
                    {new Date(data.suspension.suspended_until * 1000).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}{" "}
                    at{" "}
                    {new Date(data.suspension.suspended_until * 1000).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              </View>
            </Box>
          </Box>
        </ScrollView>
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
              {data.reward_multiplier > 1 ? (
                <RewardMultiplierBadge multiplier={data.reward_multiplier} />
              ) : null}
            </Box>

            <CountdownTimer
              secondsRemaining={timeRemaining}
              onTick={handleTimeTick}
            />

            {data.flash_quest ? (
              <>
                <Text
                  size="xs"
                  weight="semibold"
                  mode="subtle"
                  style={styles.sectionTitle}
                >
                  FLASH QUEST
                </Text>
                <FlashQuestCard
                  quest={data.flash_quest}
                  rewardMultiplier={data.reward_multiplier}
                />
              </>
            ) : null}

            <Text
              size="xs"
              weight="semibold"
              mode="subtle"
              style={styles.sectionTitle}
            >
              TODAY’S QUESTS
            </Text>

            {data.daily_quests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                rewardMultiplier={data.reward_multiplier}
              />
            ))}
          </Box>
        </ScrollView>
      )}

      {questsEnabled &&
      !isLoading &&
      (data?.daily_quests?.length ?? 0) > 0 &&
      !data?.suspended ? (
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
              payoutsEnabled={payoutsEnabled}
              hasRewardsToClaim={(data?.pending_rewards?.length ?? 0) > 0}
            />
          </Box>
        </View>
      ) : null}

      <ClaimSuccessModal
        visible={showSuccessModal}
        rewardAmount={claimedRewardAmount}
        inviteCodes={claimedInviteCodes}
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
  suspendedCard: {
    backgroundColor: "#EF444410",
    borderWidth: 1,
    borderColor: "#EF444425",
  },
  suspendedIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#EF444420",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  suspendedTitle: {
    color: "#EF4444",
    textAlign: "center",
    marginBottom: 8,
  },
  suspendedReason: {
    color: "#F87171",
    textAlign: "center",
    marginBottom: 20,
  },
  suspendedUntilCard: {
    backgroundColor: "#EF444415",
    borderWidth: 1,
    borderColor: "#EF444430",
    padding: 16,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  suspendedLabel: {
    color: "#F8717180",
    marginBottom: 2,
  },
  claimButtonContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: theme.spacing.md,
  },
}));
