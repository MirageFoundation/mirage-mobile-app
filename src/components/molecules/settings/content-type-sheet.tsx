import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { ContentType } from "@/src/stores/preferences-store";

type ContentTypeOption = {
  value: ContentType;
  label: string;
  icon: string;
};

const contentTypeOptions: ContentTypeOption[] = [
  { value: "none", label: "None", icon: "shield-checkmark-outline" },
  { value: "sensitive", label: "Sensitive", icon: "warning-outline" },
  { value: "porn", label: "Porn", icon: "eye-off-outline" },
  { value: "violence", label: "Violence", icon: "flash-outline" },
  { value: "gore", label: "Gore", icon: "skull-outline" },
  { value: "death", label: "Death", icon: "alert-circle-outline" },
  { value: "all", label: "All Content", icon: "globe-outline" },
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
    [onDismiss]
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
    []
  );

  const handleSelect = useCallback(
    (type: ContentType) => {
      triggerHaptic("light");
      onToggle(type);
    },
    [onToggle]
  );

  const isSelected = (type: ContentType) => selectedTypes.includes(type);

  return (
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
        {/* Header */}
        <View style={styles.header}>
          <Box flex>
            <Text size="lg" weight="bold">
              Content Type
            </Text>
            <Text size="sm" mode="subtle">
              Select which content you want to see
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

        {/* Options */}
        <View style={styles.optionsList}>
          {contentTypeOptions.map((option) => {
            const selected = isSelected(option.value);

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
  optionsList: {
    paddingTop: theme.spacing.xs,
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
