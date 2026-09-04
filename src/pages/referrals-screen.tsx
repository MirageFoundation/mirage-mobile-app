import { EvilIcons, Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "@/src/navigation/guarded-router";
import { useFocusEffect } from "expo-router/react-navigation";
import { useCallback, useState, useMemo, useEffect } from "react";
import {
  FlatList,
  Pressable,
  View,
  Share,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  useAuthStore,
  usePreferencesStore,
  getShareBaseUrl,
} from "@/src/stores";
import {
  buildSignupShareUrl,
  copySignupShareUrl,
  shareSignupShareUrl,
} from "@/src/utils/signup-share-url";
import { useReferralSummary } from "@/src/api/read/hooks";
import { useUserStatus } from "@/src/api/read/hooks/use-user-status";
import { useNodeConfig } from "@/src/api/read/hooks/use-parameters";
import { referralPrecheckOptIn } from "@/src/api/write";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { useToast } from "@/src/providers/toast-provider";
import type { ReferralSummaryItem } from "@/src/api/types";
import {
  createReferralListModel,
  getReferralRowKey,
} from "@/src/pages/referrals/referral-list-model";
import {
  ReferralListHeader,
  type ReferralPeriod,
} from "@/src/pages/referrals/referral-list-header";

const REFERRAL_PAGINATION_SUPPORTED = false;

function getPeriodParams(period: ReferralPeriod) {
  if (period === "7d") return { period: "7d" as const };
  if (period === "30d") return { period: "30d" as const };
  const now = new Date();
  if (period === "this_month") {
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return { period: "month" as const, month };
  }
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  return { period: "month" as const, month };
}

const SkeletonBox = ({
  width,
  height,
  borderRadius,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
}) => {
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
};

const ReferralItem = ({ item }: { item: ReferralSummaryItem }) => {
  const { theme } = useUnistyles();
  const isRealUser = item.total_actions >= 10;
  const referredDate = new Date(item.referred_at * 1000);
  const dateStr = `${referredDate.getMonth() + 1}/${referredDate.getDate()}/${referredDate.getFullYear()}`;

  return (
    <View
      accessible
      accessibilityLabel={`${item.username || item.address}, joined ${dateStr}, ${item.posts} posts, ${item.votes} votes, ${isRealUser ? "active" : "inactive"}`}
      style={[
        styles.referralItem,
        {
          backgroundColor: theme.colors.background.default,
          borderColor: theme.colors.border.subtle,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text size="md" weight="semibold">
            {item.username || item.address.slice(0, 12) + "..."}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: isRealUser ? theme.colors.success[500] + "20" : theme.colors.background.subtle }]}>
            <View style={[styles.statusDot, { backgroundColor: isRealUser ? theme.colors.success[500] : theme.colors.text.subtle }]} />
            <Text size="xs" weight="medium" style={{ color: isRealUser ? theme.colors.success[500] : theme.colors.text.subtle }}>
              {isRealUser ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>
        <Text size="sm" mode="subtle">
          Joined {dateStr}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ alignItems: "center" }}>
          <Text size="sm" weight="semibold">{item.posts}</Text>
          <Text size="xs" mode="subtle">Posts</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text size="sm" weight="semibold">{item.votes}</Text>
          <Text size="xs" mode="subtle">Votes</Text>
        </View>
      </View>
    </View>
  );
};

export function ReferralsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: userStatus, refetch: refetchUserStatus } = useUserStatus();
  const { data: nodeConfig } = useNodeConfig();
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const username = useAuthStore((s) => s.user?.username);
  const shareServer = usePreferencesStore((s) => s.apiServer);

  const inviteCodeRequired = nodeConfig?.registration_invite_code_required ?? false;
  const precheckEnabled = userStatus?.referral_precheck_enabled ?? false;
  const [toggleLoading, setToggleLoading] = useState(false);
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const effectiveEnabled = optimisticEnabled ?? precheckEnabled;
  // The precheck opt-in only exists on nodes that require invite codes (the
  // toggle is only rendered there). On open-registration nodes the referral
  // link works without it, so it must not gate copy/share (BUG-028: the copy
  // button was permanently disabled with a hint pointing at a toggle that
  // was never rendered).
  const linkEnabled = !inviteCodeRequired || effectiveEnabled;
  const [linkCopied, setLinkCopied] = useState(false);

  const [referralPeriod, setReferralPeriod] = useState<ReferralPeriod>("7d");
  const periodParams = useMemo(() => getPeriodParams(referralPeriod), [referralPeriod]);
  const {
    data: referralData,
    isError: referralsError,
    isLoading: referralsLoading,
    refetch: refetchReferrals,
  } = useReferralSummary({
    address: walletAddress ?? undefined,
    ...periodParams,
  });
  const referralListModel = createReferralListModel({
    isLoading: referralsLoading,
    isError: referralsError,
    itemCount: referralData?.referrals.length ?? 0,
    total: referralData?.total,
    hasMore: referralData?.has_more ?? false,
    supportsPagination: REFERRAL_PAGINATION_SUPPORTED,
    isFetchingNextPage: false,
  });

  useEffect(() => {
    setOptimisticEnabled(null);
  }, [precheckEnabled]);

  useFocusEffect(
    useCallback(() => {
      refetchUserStatus();
      refetchReferrals();
    }, [refetchUserStatus, refetchReferrals])
  );

  const referralUrl = useMemo(
    () => buildSignupShareUrl(getShareBaseUrl(shareServer), { ref: username }),
    [username, shareServer],
  );

  const handleTogglePrecheck = useCallback(async (value: boolean) => {
    setToggleLoading(true);
    setOptimisticEnabled(value);
    triggerHaptic("selection");
    try {
      await referralPrecheckOptIn({ enabled: value });
      if (walletAddress) {
        queryClient.invalidateQueries({ queryKey: queryKeys.userStatus(walletAddress) });
      }
    } catch (error) {
      console.error("[ReferralsScreen] opt-in failed:", error);
      setOptimisticEnabled(null);
      toast.error("Failed to update referral setting");
    } finally {
      setToggleLoading(false);
    }
  }, [walletAddress, queryClient, toast]);

  useEffect(() => {
    if (linkCopied) {
      const timeout = setTimeout(() => setLinkCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [linkCopied]);

  const handleCopyReferralLink = useCallback(async () => {
    try {
      const result = await copySignupShareUrl(
        referralUrl,
        linkEnabled,
        Clipboard.setStringAsync,
      );
      if (result === "skipped") return;
      triggerHaptic("success");
      setLinkCopied(true);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { feature: "referral", operation: "copy-link" },
      });
      triggerHaptic("error");
      toast.error("Couldn't copy the link. Please try again.");
    }
  }, [referralUrl, linkEnabled, toast]);

  const handleShareReferralLink = useCallback(async () => {
    const result = await shareSignupShareUrl(referralUrl, linkEnabled, async (payload) => {
      triggerHaptic("light");
      await Share.share(payload);
    });
    if (result === "dismissed") {
      Sentry.addBreadcrumb({
        category: "referral",
        message: "Share link failed",
        level: "warning",
      });
    }
  }, [referralUrl, linkEnabled]);

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

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
          accessibilityRole="button"
          accessibilityLabel="Close referrals"
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <EvilIcons name="close" size={28} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="medium">
          Referrals
        </Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={referralData?.referrals ?? []}
        keyExtractor={getReferralRowKey}
        renderItem={({ item }) => <ReferralItem item={item} />}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={(
          <ReferralListHeader
            inviteCodeRequired={inviteCodeRequired}
            effectiveEnabled={effectiveEnabled}
            linkEnabled={linkEnabled}
            toggleLoading={toggleLoading}
            referralUrl={referralUrl}
            hasUsername={!!username}
            linkCopied={linkCopied}
            totalLabel={referralListModel.header.totalLabel}
            referralPeriod={referralPeriod}
            onTogglePrecheck={handleTogglePrecheck}
            onCopyReferralLink={handleCopyReferralLink}
            onShareReferralLink={handleShareReferralLink}
            onSelectPeriod={setReferralPeriod}
          />
        )}
        ListEmptyComponent={(
          referralListModel.emptyState === "loading" ? (
            <View style={styles.loadingState}>
              <SkeletonBox width="100%" height={64} borderRadius={12} />
              <SkeletonBox width="100%" height={64} borderRadius={12} />
            </View>
          ) : referralListModel.emptyState === "error" ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={40} color={theme.colors.text.subtle} style={{ marginBottom: 8 }} />
              <Text size="sm" mode="subtle">Unable to load referrals</Text>
              <Pressable
                onPress={() => refetchReferrals()}
                accessibilityRole="button"
                style={styles.retryButton}
              >
                <Text size="sm" weight="semibold" style={{ color: theme.colors.brand[500] }}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={theme.colors.text.subtle} style={{ marginBottom: 8 }} />
              <Text size="sm" mode="subtle">No referrals yet</Text>
            </View>
          )
        )}
        ListFooterComponent={(
          referralListModel.footer.kind === "summary" ? (
            <Text size="sm" mode="subtle" style={styles.paginationSummary}>
              Showing {referralListModel.footer.visibleCount} of {referralListModel.footer.total}
            </Text>
          ) : referralListModel.footer.kind === "loading" ? (
            <View style={styles.paginationLoading}>
              <Text size="sm" mode="subtle">Loading more referrals...</Text>
            </View>
          ) : null
        )}
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
  listContent: {
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  referralItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  itemSeparator: {
    height: theme.spacing.sm,
  },
  loadingState: {
    gap: 10,
    paddingVertical: theme.spacing.sm,
  },
  emptyState: {
    paddingVertical: theme.spacing.xl,
    alignItems: "center",
  },
  retryButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  paginationSummary: {
    textAlign: "center",
    paddingVertical: theme.spacing.sm,
  },
  paginationLoading: {
    alignItems: "center",
    paddingVertical: theme.spacing.md,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
}));
