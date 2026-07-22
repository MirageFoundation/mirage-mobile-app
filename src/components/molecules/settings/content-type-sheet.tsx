import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  ContentType,
  usePreferencesStore,
} from "@/src/stores/preferences-store";

type ContentTypeOption = {
  value: ContentType;
  label: string;
  icon: string;
};

const individualOptions: ContentTypeOption[] = [
  { value: "sensitive", label: "Sensitive", icon: "warning-outline" },
  { value: "adult", label: "Adult", icon: "eye-off-outline" },
  { value: "violence", label: "Violence", icon: "flash-outline" },
  { value: "gore", label: "Gore", icon: "skull-outline" },
  { value: "death", label: "Death", icon: "alert-circle-outline" },
];

type ContentTypeSheetProps = {
  selectedTypes: ContentType[];
  matureToggleEnabled: boolean;
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
>(({ selectedTypes, matureToggleEnabled, onToggle, onDismiss }, ref) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const setBlurSensitiveMedia = usePreferencesStore((s) => s.setBlurSensitiveMedia);

  const present = useCallback(() => {
    bottomSheetRef.current?.present();
  }, []);

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

  const handleSelect = useCallback(
    (type: ContentType) => {
      triggerHaptic("light");
      if (selectedTypes.length === 0 && type !== "none") {
        setBlurSensitiveMedia(true);
      }
      onToggle(type);
    },
    [onToggle, selectedTypes, setBlurSensitiveMedia],
  );

  const ALL_TAGS = ["sensitive", "adult", "violence", "gore", "death"] as const;
  const isAllSelected = ALL_TAGS.every((t) => selectedTypes.includes(t));
  const isNoneSelected = selectedTypes.length === 0;
  const adultSelectedButToggleOff = selectedTypes.includes("adult") && !matureToggleEnabled;

  const isIndividualSelected = (type: ContentType) => {
    return selectedTypes.includes(type);
  };

  return (
    <>
      <BottomSheetModal
        ref={bottomSheetRef}
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
              accessibilityRole="button"
              accessibilityLabel="Close content filter"
              onPress={dismiss}
              style={[
                styles.closeButton,
                { backgroundColor: theme.colors.background.subtle },
              ]}
              hitSlop={6}
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
              const showNote = option.value === "adult" && selected && !matureToggleEnabled;

              return (
                <View key={option.value}>
                  <Pressable
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
                  {showNote && (
                    <View style={[styles.noteContainer, { backgroundColor: `${theme.colors.warning[500]}15`, borderColor: `${theme.colors.warning[500]}30` }]}>
                      <Ionicons name="information-circle-outline" size={14} color={theme.colors.warning[500]} />
                      <Text
                        size="xs"
                        style={{ color: theme.colors.warning[500], flex: 1 }}
                      >
                        Enable &quot;Show Mature Content&quot; toggle to see adult content
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
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
  noteContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginLeft: 0,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
  },
}));
