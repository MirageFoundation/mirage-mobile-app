import { triggerHaptic } from "@/src/components/utils/haptics";
import { EvilIcons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { useAwardConfigs } from "@/src/api/read/hooks/use-award-configs";
import { useUserStatus } from "@/src/api/read/hooks/use-user-status";
import { useGiveAward } from "@/src/api/write/hooks/use-award";
import { useToast } from "@/src/providers/toast-provider";
import { useAuthStore } from "@/src/stores";
import { AWARD_TYPES, formatAwardCost, getFriendlyAwardError } from "@/src/data/awards";
import { formatCompactNumber } from "@/src/utils/format-number";
import type { AwardConfig } from "@/src/api/types";
import axios from "axios";

type AwardPickerSheetProps = {
  targetId: string;
  targetType: "post" | "comment";
  isOwnContent?: boolean;
  onDismiss?: () => void;
  onSuccess?: () => void;
};

export type AwardPickerSheetRef = {
  present: () => void;
  dismiss: () => void;
};

const AwardOption = ({
  config,
  isSelected,
  isAdmin,
  onPress,
}: {
  config: AwardConfig;
  isSelected: boolean;
  isAdmin: boolean;
  onPress: () => void;
}) => {
  const { theme } = useUnistyles();
  const info = AWARD_TYPES[config.name];
  if (!info) return null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.awardOption,
        {
          backgroundColor: isSelected
            ? `${theme.colors.brand[500]}15`
            : theme.colors.background.subtle,
          borderColor: isSelected
            ? theme.colors.brand[500]
            : theme.colors.border.subtle,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.awardOptionLeft}>
        <Text size="xxl">{info.icon}</Text>
        <View style={styles.awardOptionText}>
          <Text size="md" weight="medium">
            {info.label}
          </Text>
          <Text size="sm" mode="subtle">
            {isAdmin ? "Free" : formatAwardCost(config.cost)}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.radio,
          {
            borderColor: isSelected
              ? theme.colors.brand[500]
              : theme.colors.border.default,
          },
        ]}
      >
        {isSelected && (
          <View
            style={[
              styles.radioInner,
              { backgroundColor: theme.colors.brand[500] },
            ]}
          />
        )}
      </View>
    </Pressable>
  );
};

export const AwardPickerSheet = forwardRef<
  AwardPickerSheetRef,
  AwardPickerSheetProps
>(
  (
    {
      targetId,
      targetType,
      isOwnContent = false,
      onDismiss,
      onSuccess,
    },
    ref,
  ) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const toast = useToast();
    const userLevel = useAuthStore((s) => s.userLevel);
    const isAdmin = userLevel >= 100;

    const { data: awardConfigs } = useAwardConfigs();
    const { data: userStatus } = useUserStatus();
    const giveAwardMutation = useGiveAward();

    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);

    const present = useCallback(() => {
      setSelectedType(null);
      setIsSending(false);
      giveAwardMutation.reset();
      bottomSheetRef.current?.present();
    }, [giveAwardMutation]);

    const dismiss = useCallback(() => {
      bottomSheetRef.current?.dismiss();
    }, []);

    useImperativeHandle(ref, () => ({
      present,
      dismiss,
    }));

    const handleSheetChanges = useCallback(
      (index: number) => {
        if (index === -1) {
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
        />
      ),
      [],
    );

    const selectedConfig = awardConfigs?.find((c) => c.name === selectedType);
    const balance = userStatus?.balance ?? 0;
    const hasInsufficientBalance =
      !isAdmin && selectedConfig ? balance < selectedConfig.cost : false;

    const handleSendAward = useCallback(async () => {
      if (!selectedType || !targetId || isSending) return;
      setIsSending(true);
      triggerHaptic("medium");

      try {
        await giveAwardMutation.mutateAsync({
          target: targetId,
          award_type: selectedType,
        });
        triggerHaptic("success");
        const info = AWARD_TYPES[selectedType];
        toast.success(`${info?.label ?? "Award"} given!`);
        dismiss();
        onSuccess?.();
      } catch (err) {
        triggerHaptic("error");
        let errorMessage = err instanceof Error ? err.message : "Unknown error";
        if (axios.isAxiosError(err)) {
          const data = err.response?.data;
          if (typeof data === "string" && data.trim()) {
            errorMessage = data;
          } else if (data && typeof data === "object") {
            const msg =
              (data as any).error ??
              (data as any).message ??
              (data as any).raw_log;
            if (msg) errorMessage = String(msg);
          }
        }
        toast.error(getFriendlyAwardError(errorMessage));
      } finally {
        setIsSending(false);
      }
    }, [selectedType, targetId, giveAwardMutation, toast, dismiss, onSuccess]);

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
              Give Award
            </Text>
            <Pressable onPress={dismiss} style={styles.closeButton}>
              <EvilIcons
                name="close"
                size={24}
                color={theme.colors.text.default}
              />
            </Pressable>
          </View>

          <View style={styles.balanceRow}>
            <Text size="md" mode="subtle">
              Balance:{" "}
            </Text>
            <Text size="md" weight="bold">
              {formatCompactNumber(balance / 1_000_000)} MIRAGE
            </Text>
          </View>

          <View style={styles.optionsList}>
            {(awardConfigs ?? []).map((config) => (
              <AwardOption
                key={config.name}
                config={config}
                isSelected={selectedType === config.name}
                isAdmin={isAdmin}
                onPress={() => {
                  triggerHaptic("selection");
                  setSelectedType(config.name);
                }}
              />
            ))}
          </View>

          <Pressable
            onPress={handleSendAward}
            disabled={
              !selectedType ||
              isSending ||
              hasInsufficientBalance
            }
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor:
                  !selectedType || hasInsufficientBalance
                    ? theme.colors.background.subtle
                    : theme.colors.brand[500],
              },
              pressed && { opacity: 0.8 },
              (!selectedType || hasInsufficientBalance) && { opacity: 0.5 },
            ]}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text
                size="md"
                weight="bold"
                style={{
                  color:
                    !selectedType || hasInsufficientBalance
                      ? theme.colors.text.subtle
                      : "#fff",
                }}
              >
                {hasInsufficientBalance
                  ? "Insufficient Balance"
                  : "Send Award"}
              </Text>
            )}
          </Pressable>

          <View style={{ height: footerHeight }} />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

AwardPickerSheet.displayName = "AwardPickerSheet";

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
    marginBottom: theme.spacing.md,
  },
  optionsList: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  awardOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
  },
  awardOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  awardOptionText: {
    gap: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sendButton: {
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.sm,
  },
}));
