import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useToast } from "@/src/providers/toast-provider";
import { ConfirmationPopup } from "@/src/components/molecules/confirmation-popup";
import { AgeVerificationModal } from "@/src/components/molecules/age-verification-modal";
import {
  ContentType,
  isAdultContentEnabled,
  usePreferencesStore,
} from "@/src/stores/preferences-store";

const ADULT_CONTENT_TAGS = ["porn", "violence", "gore", "death"] as const;

const ADULT_CONTENT_DESCRIPTIONS: Record<string, { title: string; message: string; description: string }> = {
  sensitive: {
    title: "Enable Sensitive Content",
    message: "Are you sure you want to see sensitive content?",
    description: "This will show content flagged as sensitive in your feed. Content will be blurred by default and requires a tap to reveal.",
  },
  porn: {
    title: "Enable Pornographic Content",
    message: "Are you sure you want to see pornographic content?",
    description: "This will show sexually explicit material in your feed. Content will be blurred by default and requires a tap to reveal.",
  },
  violence: {
    title: "Enable Violent Content",
    message: "Are you sure you want to see violent content?",
    description: "This will show violent material in your feed. Content will be blurred by default and requires a tap to reveal.",
  },
  gore: {
    title: "Enable Gore Content",
    message: "Are you sure you want to see gore content?",
    description: "This will show graphic gore material in your feed. Content will be blurred by default and requires a tap to reveal.",
  },
  death: {
    title: "Enable Death Content",
    message: "Are you sure you want to see death-related content?",
    description: "This will show death-related material in your feed. Content will be blurred by default and requires a tap to reveal.",
  },
  all: {
    title: "Enable All Adult Content",
    message: "Are you sure you want to see all adult content?",
    description: "This will show all adult material including pornography, violence, gore, and death in your feed. Content will be blurred by default and requires a tap to reveal.",
  },
};

type ContentTypeOption = {
  value: ContentType;
  label: string;
  icon: string;
};

const individualOptions: ContentTypeOption[] = [
  { value: "sensitive", label: "Sensitive", icon: "warning-outline" },
  { value: "porn", label: "Porn", icon: "eye-off-outline" },
  { value: "violence", label: "Violence", icon: "flash-outline" },
  { value: "gore", label: "Gore", icon: "skull-outline" },
  { value: "death", label: "Death", icon: "alert-circle-outline" },
];

type ContentTypeSheetProps = {
  selectedTypes: ContentType[];
  onToggle: (type: ContentType) => void;
  onDismiss?: () => void;
};

export type ContentTypeSheetRef = {
  present: () => void;
  dismiss: () => void;
};

export const ContentTypeSheet = forwardRef<
  ContentTypeSheetRef,
  ContentTypeSheetProps
>(({ selectedTypes, onToggle, onDismiss }, ref) => {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const [pendingAdultType, setPendingAdultType] = useState<ContentType | null>(null);
  const setBlurSensitiveMedia = usePreferencesStore((s) => s.setBlurSensitiveMedia);
  const ageVerified = usePreferencesStore((s) => s.ageVerified);
  const setAgeVerified = usePreferencesStore((s) => s.setAgeVerified);
  const [showAgeVerification, setShowAgeVerification] = useState(false);
  const toast = useToast();

  const present = useCallback(() => {
    bottomSheetRef.current?.expand();
  }, []);

  const dismiss = useCallback(() => {
    bottomSheetRef.current?.close();
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

  const isContentFilterType = (type: ContentType) =>
    ADULT_CONTENT_TAGS.includes(type as any) || type === "all" || type === "sensitive";

  const currentlyHasAdultContent = isAdultContentEnabled(selectedTypes);

  const handleSelect = useCallback(
    (type: ContentType) => {
      triggerHaptic("light");

      if (Platform.OS !== "ios" && isContentFilterType(type) && !selectedTypes.includes(type)) {
        if (type === "all" || type === "sensitive" || !currentlyHasAdultContent) {
          if (!ageVerified) {
            setPendingAdultType(type);
            setShowAgeVerification(true);
            return;
          }
          setPendingAdultType(type);
          return;
        }
      }

      onToggle(type);
    },
    [onToggle, currentlyHasAdultContent, selectedTypes, ageVerified],
  );

  const handleAgeVerified = useCallback(() => {
    setAgeVerified(true);
    setShowAgeVerification(false);
    toast.success("Age verified successfully");
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: "Age verification passed",
      level: "info",
    });
  }, [setAgeVerified, toast]);

  const handleAgeVerificationCancel = useCallback(() => {
    setShowAgeVerification(false);
    setPendingAdultType(null);
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: "Age verification cancelled",
      level: "info",
    });
  }, []);

  const handleConfirmAdultContent = useCallback(() => {
    if (pendingAdultType) {
      triggerHaptic("medium");
      setBlurSensitiveMedia(true);
      onToggle(pendingAdultType);
      Sentry.addBreadcrumb({
        category: "content_filter",
        message: `Adult content enabled: ${pendingAdultType}`,
        level: "info",
      });
      setPendingAdultType(null);
    }
  }, [pendingAdultType, onToggle, setBlurSensitiveMedia]);

  const handleCancelAdultContent = useCallback(() => {
    triggerHaptic("light");
    setPendingAdultType(null);
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: "Adult content confirmation declined",
      level: "info",
    });
  }, []);

  const isAllSelected = selectedTypes.includes("all");
  const isNoneSelected = selectedTypes.length === 0;

  const isIndividualSelected = (type: ContentType) => {
    if (isAllSelected) return true;
    return selectedTypes.includes(type);
  };

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        enableDynamicSizing
        enablePanDownToClose
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.background.default }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border.default }}
      >
        <BottomSheetView
          style={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        >
          <View style={styles.header}>
            <Box flex>
              <Text size="lg" weight="bold">
                Content Filter
              </Text>
              <Text size="sm" mode="subtle">
                Adult content is hidden by default. You must explicitly enable
                each category below.
              </Text>
            </Box>
            <Pressable
              onPress={dismiss}
              style={[
                styles.closeButton,
                { backgroundColor: theme.colors.background.subtle },
              ]}
            >
              <Ionicons
                name="close"
                size={20}
                color={theme.colors.text.default}
              />
            </Pressable>
          </View>

          <View style={styles.quickRow}>
            <Pressable
              onPress={() => handleSelect("all")}
              style={[
                styles.quickButton,
                {
                  backgroundColor: isAllSelected
                    ? "rgb(30,67,150)"
                    : theme.colors.background.subtle,
                  borderColor: isAllSelected
                    ? "rgb(30,67,150)"
                    : theme.colors.border.default,
                },
              ]}
            >
              <Ionicons
                name="globe-outline"
                size={16}
                color={isAllSelected ? "#FFFFFF" : theme.colors.text.default}
              />
              <Text
                size="sm"
                weight="medium"
                style={{
                  color: isAllSelected ? "#FFFFFF" : theme.colors.text.default,
                }}
              >
                All
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleSelect("none")}
              style={[
                styles.quickButton,
                {
                  backgroundColor: isNoneSelected
                    ? "rgb(30,67,150)"
                    : theme.colors.background.subtle,
                  borderColor: isNoneSelected
                    ? "rgb(30,67,150)"
                    : theme.colors.border.default,
                },
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={isNoneSelected ? "#FFFFFF" : theme.colors.text.default}
              />
              <Text
                size="sm"
                weight="medium"
                style={{
                  color: isNoneSelected ? "#FFFFFF" : theme.colors.text.default,
                }}
              >
                None
              </Text>
            </Pressable>
          </View>

          <View style={styles.optionsList}>
            {individualOptions.map((option) => {
              const selected = isIndividualSelected(option.value);

              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleSelect(option.value)}
                  style={({ pressed }) => [
                    styles.optionItem,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Box direction="row" alignItems="center" gap="md" flex>
                    <Ionicons
                      name={option.icon as any}
                      size={20}
                      color={theme.colors.text.default}
                    />
                    <Text size="md" weight="regular">
                      {option.label}
                    </Text>
                  </Box>
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: selected
                          ? "rgb(30,67,150)"
                          : "transparent",
                        borderColor: selected
                          ? "rgb(30,67,150)"
                          : theme.colors.border.default,
                      },
                    ]}
                  >
                    {selected && (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </BottomSheetView>
      </BottomSheet>

      <ConfirmationPopup
        visible={Platform.OS !== "ios" && !!pendingAdultType && !showAgeVerification}
        title={ADULT_CONTENT_DESCRIPTIONS[pendingAdultType ?? "all"]?.title ?? "Enable Adult Content"}
        message={ADULT_CONTENT_DESCRIPTIONS[pendingAdultType ?? "all"]?.message ?? "Are you sure?"}
        description={ADULT_CONTENT_DESCRIPTIONS[pendingAdultType ?? "all"]?.description ?? ""}
        icon="eye-off"
        confirmText="Enable"
        cancelText="Keep Hidden"
        isDestructive={false}
        onConfirm={handleConfirmAdultContent}
        onCancel={handleCancelAdultContent}
      />

      <AgeVerificationModal
        visible={Platform.OS !== "ios" && showAgeVerification}
        onVerified={handleAgeVerified}
        onCancel={handleAgeVerificationCancel}
      />
    </>
  );
});

ContentTypeSheet.displayName = "ContentTypeSheet";

const styles = StyleSheet.create((theme) => ({
  content: {
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: theme.spacing.md,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  quickButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  optionsList: {
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md - 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
}));
