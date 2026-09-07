import { triggerHaptic } from "@/src/components/utils/haptics";
import * as Sentry from "@sentry/react-native";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { getTierColor } from "@/src/utils/tiers";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { SubscriptionPeriodPicker } from "@/src/components/molecules/subscription";
import { useUserStatus, useUserStatusByAddress } from "@/src/api/read/hooks/use-user-status";
import { useChainConfig } from "@/src/api/read/hooks/use-parameters";
import { useGiftSubscription } from "@/src/api/write/hooks/use-gift-subscription";
import {
  clampPeriodCount,
  hasInsufficientSubscriptionBalance,
  parseModernTiers,
  projectSubscriptionExpiry,
  subscriptionDurationSeconds,
  totalSubscriptionCost,
  UMIRAGE_PER_MIRAGE,
} from "@/src/domain/subscriptions";
import { useToast } from "@/src/providers/toast-provider";
import {
  generateActionId,
  getActionLabel,
  usePowQueueStore,
} from "@/src/services/pow-queue";
import { formatCompactNumber } from "@/src/utils/format-number";
import { getApiErrorMessage } from "@/src/utils/parse-api-error";
import { createDuplicateActionGuard } from "@/src/utils/duplicate-action-guard";

type GiftSubscriptionSheetProps = {
  recipientAddress: string;
  recipientUsername: string;
  onDismiss?: () => void;
  onSuccess?: () => void;
};

export type GiftSubscriptionSheetRef = {
  present: () => void;
  dismiss: () => void;
};

export const GiftSubscriptionSheet = forwardRef<
  GiftSubscriptionSheetRef,
  GiftSubscriptionSheetProps
>(({ recipientAddress, recipientUsername, onDismiss, onSuccess }, ref) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [isPresented, setIsPresented] = useState(false);

  const [periodCount, setPeriodCount] = useState(1);
  const { data: userStatus, isPending: isBalanceLoading } = useUserStatus({
    enabled: isPresented,
  });
  const { data: recipientStatus } = useUserStatusByAddress(
    isPresented ? recipientAddress : null,
  );
  const { data: chainConfig } = useChainConfig({ enabled: isPresented });
  const giftSubMutation = useGiftSubscription();
  const giftAsyncRef = useRef(giftSubMutation.mutateAsync);
  const sendGuardRef = useRef(createDuplicateActionGuard());
  useEffect(() => {
    giftAsyncRef.current = giftSubMutation.mutateAsync;
  }, [giftSubMutation.mutateAsync]);
  const enqueue = usePowQueueStore((state) => state.enqueue);

  const balanceKnown = userStatus != null;
  const balance = userStatus?.balance ?? 0;
  const balanceMirage = balance / 1_000_000;

  const selectedPeriodCount = clampPeriodCount(periodCount);
  const periodFee = useMemo(() => {
    const tiers = parseModernTiers(chainConfig?.tiers);
    return tiers ? Number(tiers[1].period_fee) || 0 : 0;
  }, [chainConfig]);
  const totalCost = totalSubscriptionCost(periodFee, selectedPeriodCount);
  const periodFeeMirage = periodFee / UMIRAGE_PER_MIRAGE;
  const totalCostMirage = totalCost / UMIRAGE_PER_MIRAGE;
  const insufficientBalance = balanceKnown && hasInsufficientSubscriptionBalance({
    balance,
    periodFee,
    periodCount: selectedPeriodCount,
  });
  const canSend = periodFee > 0 && !insufficientBalance;

  const expiry = useMemo(() => {
    const durationSeconds = subscriptionDurationSeconds(
      chainConfig?.subscription_period ?? 0,
      selectedPeriodCount,
    );
    if (!durationSeconds) return null;
    const recipientExpiry = recipientStatus?.subscription_expiry;
    const hasExactExpiry = typeof recipientExpiry === "number" && recipientExpiry > 0;
    const expirySeconds = projectSubscriptionExpiry({
      nowSeconds: Math.floor(Date.now() / 1000),
      currentExpiry: hasExactExpiry ? recipientExpiry : 0,
      durationSeconds,
    });
    return {
      exact: hasExactExpiry,
      label: new Date(expirySeconds * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  }, [chainConfig?.subscription_period, recipientStatus?.subscription_expiry, selectedPeriodCount]);

  const present = useCallback(() => {
    setIsPresented(true);
    bottomSheetRef.current?.present();
  }, []);

  const dismiss = useCallback(() => {
    bottomSheetRef.current?.dismiss();
  }, []);

  useImperativeHandle(ref, () => ({ present, dismiss }));

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setIsPresented(false);
        onDismiss?.();
      }
    },
    [onDismiss],
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  // C-3: gifts go through the shared PoW queue like votes/comments — the
  // sheet dismisses immediately and the queue toast owns progress and the
  // success/failure overlay. No blocking modal transaction.
  const handleConfirm = useCallback(() => {
    if (!canSend || !recipientAddress || !sendGuardRef.current.tryAcquire()) return;
    triggerHaptic("medium");
    dismiss();

    enqueue({
      id: generateActionId(),
      type: "gift_subscription",
      label: getActionLabel("gift_subscription"),
      execute: () =>
        giftAsyncRef.current({
          recipient: recipientAddress,
          periodCount: selectedPeriodCount,
        }),
      onSuccess: () => {
        sendGuardRef.current.release();
        triggerHaptic("success");
        onSuccess?.();
      },
      onError: (err) => {
        sendGuardRef.current.release();
        triggerHaptic("error");
        Sentry.captureException(err, { tags: { feature: "gift-subscription" } });
        toast.error(
          `Subscription wasn't gifted to @${recipientUsername}`,
          getApiErrorMessage(err),
        );
      },
      onRollback: () => {
        sendGuardRef.current.release();
      },
    });
  }, [canSend, recipientAddress, recipientUsername, selectedPeriodCount, enqueue, toast, dismiss, onSuccess]);

  const footerHeight = Platform.OS === "ios" ? insets.bottom : insets.bottom + 30;

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      enablePanDownToClose
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: theme.colors.background.default }}
      handleIndicatorStyle={{ backgroundColor: theme.colors.border.default }}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.header}>
          <Text size="lg" weight="bold">
            Gift Subscription
          </Text>
          <Pressable onPress={dismiss} style={styles.closeButton}>
            <EvilIcons name="close" size={24} color={theme.colors.text.default} />
          </Pressable>
        </View>

        <View style={styles.balanceRow}>
          <Text size="md" mode="subtle">Balance: </Text>
          {balanceKnown ? (
            <Text size="md" weight="bold">
              {formatCompactNumber(balanceMirage)} MIRAGE
            </Text>
          ) : isBalanceLoading ? (
            <ActivityIndicator size="small" color={theme.colors.text.subtle} />
          ) : (
            <Text size="md" weight="bold" mode="subtle">
              — MIRAGE
            </Text>
          )}
        </View>

        <SubscriptionPeriodPicker value={selectedPeriodCount} onChange={setPeriodCount} />
        <Text size="xs" mode="subtle" style={{ marginBottom: theme.spacing.md }}>
          {formatCompactNumber(periodFeeMirage)} MIRAGE per period · {selectedPeriodCount} selected
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: `${getTierColor(1)}08`,
              borderColor: `${getTierColor(1)}30`,
            },
          ]}
        >
          <View style={[styles.cardIcon, { backgroundColor: `${getTierColor(1)}20` }]}>
            <Ionicons name="diamond" size={28} color={getTierColor(1)} />
          </View>
          <Text size="md" weight="medium" style={styles.cardTitle}>
            Gift subscription to @{recipientUsername}?
          </Text>
          <Text size="xxl" weight="bold" style={{ color: getTierColor(1) }}>
            {formatCompactNumber(totalCostMirage)} MIRAGE
          </Text>
          {expiry ? (
            <Text size="sm" mode="subtle">
              {expiry.exact ? `Until ${expiry.label}` : `Estimated until ${expiry.label}`}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={handleConfirm}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.confirmButton,
            {
              backgroundColor: canSend
                ? theme.colors.brand[500]
                : theme.colors.background.subtle,
            },
            pressed && { opacity: 0.8 },
            !canSend && { opacity: 0.5 },
          ]}
        >
          <Text
            size="md"
            weight="bold"
            style={{ color: canSend ? "#fff" : theme.colors.text.subtle }}
          >
            {insufficientBalance ? "Insufficient Balance" : "Confirm Gift"}
          </Text>
        </Pressable>

        <View style={{ height: footerHeight }} />
      </BottomSheetView>
    </BottomSheetModal>
  );
});

GiftSubscriptionSheet.displayName = "GiftSubscriptionSheet";

const styles = StyleSheet.create((theme) => ({
  content: {
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: theme.spacing.sm,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  card: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.xs,
  },
  cardTitle: {
    textAlign: "center",
  },
  confirmButton: {
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.sm,
  },
}));
