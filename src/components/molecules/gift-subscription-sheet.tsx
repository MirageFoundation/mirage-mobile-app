import { triggerHaptic } from "@/src/components/utils/haptics";
import * as Sentry from "@sentry/react-native";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { getTierColor } from "@/src/utils/tiers";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { useUserStatus } from "@/src/api/read/hooks/use-user-status";
import { useChainConfig } from "@/src/api/read/hooks/use-parameters";
import { useGiftSubscription } from "@/src/api/write/hooks/use-gift-subscription";
import { useToast } from "@/src/providers/toast-provider";
import { formatCompactNumber } from "@/src/utils/format-number";
import axios from "axios";

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

  const { data: userStatus } = useUserStatus();
  const { data: chainConfig } = useChainConfig({ enabled: isPresented });
  const giftSubMutation = useGiftSubscription();

  const [isSending, setIsSending] = useState(false);

  const balance = userStatus?.balance ?? 0;
  const balanceMirage = balance / 1_000_000;

  const periodFee = useMemo(() => {
    const tiers = chainConfig?.tiers;
    if (!tiers || tiers.length < 2) return 0;
    return Number(tiers[1].period_fee) || 0;
  }, [chainConfig]);

  const periodFeeMirage = periodFee / 1_000_000;
  const insufficientBalance = periodFee > 0 && balance < periodFee;
  const canSend = periodFee > 0 && !insufficientBalance && !isSending;

  const expiryDate = useMemo(() => {
    const periodSeconds = chainConfig?.subscription_period ?? 0;
    if (!periodSeconds) return "";
    const expiry = new Date(Date.now() + periodSeconds * 1000);
    return expiry.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [chainConfig]);

  const present = useCallback(() => {
    setIsPresented(true);
    setIsSending(false);
    giftSubMutation.reset();
    bottomSheetRef.current?.present();
  }, [giftSubMutation]);

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
        pressBehavior={isSending ? "none" : "close"}
      />
    ),
    [isSending],
  );

  const handleConfirm = useCallback(async () => {
    if (!canSend || !recipientAddress) return;
    setIsSending(true);
    triggerHaptic("medium");

    try {
      await giftSubMutation.mutateAsync({
        recipient: recipientAddress,
        level: 1,
      });
      triggerHaptic("success");
      toast.success(`Subscription gifted to @${recipientUsername}!`);
      dismiss();
      onSuccess?.();
    } catch (err) {
      triggerHaptic("error");
      Sentry.captureException(err, { tags: { feature: "gift-subscription" } });
      let errorMessage = err instanceof Error ? err.message : "Unknown error";
      if (axios.isAxiosError(err)) {
        const data = err.response?.data;
        if (typeof data === "string" && data.trim()) {
          errorMessage = data;
        } else if (data && typeof data === "object") {
          const msg = (data as any).error ?? (data as any).message;
          if (msg) errorMessage = String(msg);
        }
      }
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
    }
  }, [canSend, recipientAddress, recipientUsername, giftSubMutation, toast, dismiss, onSuccess]);

  const footerHeight = Platform.OS === "ios" ? insets.bottom : insets.bottom + 30;

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      enablePanDownToClose={!isSending}
      enableHandlePanningGesture={!isSending}
      enableContentPanningGesture={!isSending}
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
          <Pressable
            onPress={dismiss}
            disabled={isSending}
            style={[styles.closeButton, isSending && { opacity: 0.5 }]}
          >
            <EvilIcons name="close" size={24} color={theme.colors.text.default} />
          </Pressable>
        </View>

        <View style={styles.balanceRow}>
          <Text size="md" mode="subtle">Balance: </Text>
          <Text size="md" weight="bold">
            {formatCompactNumber(balanceMirage)} MIRAGE
          </Text>
        </View>

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
            {formatCompactNumber(periodFeeMirage)} MIRAGE
          </Text>
          {expiryDate ? (
            <Text size="sm" mode="subtle">
              Until {expiryDate}
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
          {isSending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text
              size="md"
              weight="bold"
              style={{ color: canSend ? "#fff" : theme.colors.text.subtle }}
            >
              {insufficientBalance ? "Insufficient Balance" : "Confirm Gift"}
            </Text>
          )}
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
