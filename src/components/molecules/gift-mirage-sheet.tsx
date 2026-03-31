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
import { formatCompactNumber } from "@/src/utils/format-number";
import axios from "axios";

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

    const { data: userStatus } = useUserStatus();
    const sendTokensMutation = useSendTokens();

    const [amountText, setAmountText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
      const showSub = Keyboard.addListener(
        Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
        () => setKeyboardVisible(true),
      );
      const hideSub = Keyboard.addListener(
        Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
        () => setKeyboardVisible(false),
      );
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, []);

    const balance = userStatus?.balance ?? 0;
    const balanceMirage = balance / 1_000_000;

    const parsedAmount = useMemo(() => {
      const n = Number(amountText);
      if (Number.isNaN(n) || n <= 0) return 0;
      return n;
    }, [amountText]);

    const insufficientBalance = parsedAmount > 0 && parsedAmount > balanceMirage;
    const canSend = parsedAmount > 0 && !insufficientBalance && !isSending;

    const present = useCallback(() => {
      setAmountText("");
      setIsSending(false);
      sendTokensMutation.reset();
      bottomSheetRef.current?.present();
    }, [sendTokensMutation]);

    const dismiss = useCallback(() => {
      bottomSheetRef.current?.dismiss();
    }, []);

    useImperativeHandle(ref, () => ({ present, dismiss }));

    const handleSheetChanges = useCallback(
      (index: number) => {
        if (index === -1) onDismiss?.();
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
        />
      ),
      [],
    );

    const handleSend = useCallback(async () => {
      if (!canSend || !recipientAddress) return;
      Keyboard.dismiss();
      setIsSending(true);
      triggerHaptic("medium");

      try {
        const umirage = Math.floor(parsedAmount * 1_000_000);
        await sendTokensMutation.mutateAsync({
          recipient: recipientAddress,
          amount: umirage,
        });
        triggerHaptic("success");
        toast.success(`${parsedAmount} MIRAGE sent!`);
        dismiss();
        onSuccess?.();
      } catch (err) {
        triggerHaptic("error");
        Sentry.captureException(err, { tags: { feature: "gift-mirage" } });
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
    }, [canSend, recipientAddress, parsedAmount, sendTokensMutation, toast, dismiss, onSuccess]);

    const footerHeight = keyboardVisible ? 8 : (Platform.OS === "ios" ? insets.bottom : insets.bottom + 30);

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
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
            <Text size="md" weight="bold">
              {formatCompactNumber(balanceMirage)} MIRAGE
            </Text>
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
            {isSending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text
                size="md"
                weight="bold"
                style={{ color: canSend ? "#fff" : theme.colors.text.subtle }}
              >
                Send
              </Text>
            )}
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
}));
