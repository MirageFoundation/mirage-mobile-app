import { triggerHaptic } from "@/src/components/utils/haptics";
import * as Sentry from "@sentry/react-native";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { useUserStatus } from "@/src/api/read/hooks/use-user-status";
import { useSendTokens } from "@/src/api/write/hooks/use-send-tokens";
import { useToast } from "@/src/providers/toast-provider";
import {
  generateActionId,
  getActionLabel,
  usePowQueueStore,
} from "@/src/services/pow-queue";
import { formatCompactNumber } from "@/src/utils/format-number";
import { getApiErrorMessage } from "@/src/utils/parse-api-error";
import { createDuplicateActionGuard } from "@/src/utils/duplicate-action-guard";

type GiftMirageSheetProps = {
  recipientAddress: string;
  recipientUsername: string;
  onDismiss?: () => void;
  onSuccess?: () => void;
};

export type GiftMirageSheetRef = {
  present: () => void;
  dismiss: () => void;
};

export const GiftMirageSheet = forwardRef<GiftMirageSheetRef, GiftMirageSheetProps>(
  ({ recipientAddress, recipientUsername, onDismiss, onSuccess }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const toast = useToast();
    const amountInputRef = useRef<any>(null);

    const [isPresented, setIsPresented] = useState(false);
    const { data: userStatus, isPending: isBalanceLoading } = useUserStatus({
      enabled: isPresented,
    });

    const [amountText, setAmountText] = useState("");
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    const sendTokensMutation = useSendTokens();
    const sendAsyncRef = useRef(sendTokensMutation.mutateAsync);
    const sendGuardRef = useRef(createDuplicateActionGuard());
    useEffect(() => {
      sendAsyncRef.current = sendTokensMutation.mutateAsync;
    }, [sendTokensMutation.mutateAsync]);
    const enqueue = usePowQueueStore((state) => state.enqueue);

    useEffect(() => {
      const showSub = Keyboard.addListener(
        Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
        () => setKeyboardVisible(true),
      );
      const hideSub = Keyboard.addListener("keyboardDidHide", () =>
        setKeyboardVisible(false),
      );
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, []);

    const balanceKnown = userStatus != null;
    const balanceMirage = (userStatus?.balance ?? 0) / 1_000_000;

    const parsedAmount = useMemo(() => {
      const n = Number(amountText);
      if (Number.isNaN(n) || n <= 0) return 0;
      return n;
    }, [amountText]);

    // Only flag insufficient balance once we actually know the balance;
    // an unknown balance must not block sending (server validates anyway).
    const insufficientBalance =
      balanceKnown && parsedAmount > 0 && parsedAmount > balanceMirage;
    const canSend = parsedAmount > 0 && !insufficientBalance;

    const present = useCallback(() => {
      setIsPresented(true);
      setAmountText("");
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
    const handleSend = useCallback(() => {
      if (!canSend || !recipientAddress || !sendGuardRef.current.tryAcquire()) return;
      const amountMirage = parsedAmount;
      const umirage = Math.floor(amountMirage * 1_000_000);
      triggerHaptic("medium");
      amountInputRef.current?.blur();
      Keyboard.dismiss();
      dismiss();

      enqueue({
        id: generateActionId(),
        type: "send_tokens",
        label: getActionLabel("send_tokens"),
        execute: () =>
          sendAsyncRef.current({
            recipient: recipientAddress,
            amount: umirage,
          }),
        onSuccess: () => {
          sendGuardRef.current.release();
          triggerHaptic("success");
          onSuccess?.();
        },
        onError: (err) => {
          sendGuardRef.current.release();
          triggerHaptic("error");
          Sentry.captureException(err, { tags: { feature: "gift-mirage" } });
          toast.error("Gift wasn't sent", getApiErrorMessage(err));
        },
        onRollback: () => {
          sendGuardRef.current.release();
        },
      });
    }, [canSend, recipientAddress, parsedAmount, enqueue, toast, dismiss, onSuccess]);

    const footerHeight = keyboardVisible ? 8 : (Platform.OS === "ios" ? insets.bottom : insets.bottom + 30);

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustPan"
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.background.default }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border.default }}
      >
        <BottomSheetView style={styles.content}>
          <View style={styles.header}>
            <Text size="lg" weight="bold">
              Gift Mirage
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

          <View
            style={[
              styles.card,
              {
                backgroundColor: `${theme.colors.brand[500]}08`,
                borderColor: `${theme.colors.brand[500]}30`,
              },
            ]}
          >
            <View style={[styles.cardIcon, { backgroundColor: `${theme.colors.brand[500]}20` }]}>
              <Ionicons name="gift" size={28} color={theme.colors.brand[500]} />
            </View>
            <Text size="md" weight="medium" style={styles.cardTitle}>
              Donate mirage to @{recipientUsername}
            </Text>

            <BottomSheetTextInput
              ref={amountInputRef}
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.background.default,
                  borderColor: insufficientBalance
                    ? theme.colors.error[500]
                    : theme.colors.border.subtle,
                  color: theme.colors.text.default,
                },
              ]}
              placeholder="Enter amount (MIRAGE)"
              placeholderTextColor={theme.colors.text.subtle}
              keyboardType="numeric"
              value={amountText}
              onChangeText={setAmountText}
            />

            <View style={styles.errorRow}>
              {insufficientBalance && (
                <Text size="sm" style={{ color: theme.colors.error[500] }}>
                  Insufficient balance
                </Text>
              )}
            </View>
          </View>

          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed }) => [
              styles.sendButton,
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
              Send
            </Text>
          </Pressable>

          <View style={{ height: footerHeight }} />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

GiftMirageSheet.displayName = "GiftMirageSheet";

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
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
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
    marginBottom: theme.spacing.xs,
  },
  input: {
    height: 48,
    width: "100%",
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    paddingHorizontal: theme.spacing.md,
    fontSize: 16,
  },
  errorRow: {
    height: 20,
    justifyContent: "center",
  },
  sendButton: {
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.sm,
  },
  sendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
}));
