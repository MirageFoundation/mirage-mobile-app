import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

export type ValueOption<T> = {
  value: T;
  label: string;
};

type ValuePickerSheetProps<T> = {
  title: string;
  options: ValueOption<T>[];
  value: T;
  onChange: (value: T) => void;
  onDismiss?: () => void;
};

export type ValuePickerSheetRef = {
  present: () => void;
  dismiss: () => void;
};

function ValuePickerSheetInner<T>(
  { title, options, value, onChange, onDismiss }: ValuePickerSheetProps<T>,
  ref: React.Ref<ValuePickerSheetRef>
) {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

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
    (newValue: T) => {
      triggerHaptic("light");
      try {
        const result = onChange(newValue) as unknown;
        if (result && typeof (result as Promise<void>).then === 'function') {
          (result as Promise<void>).then(() => {
            dismiss();
          }).catch(() => {
            dismiss();
          });
        } else {
          dismiss();
        }
      } catch (err) {
        dismiss();
      }
    },
    [onChange, dismiss]
  );

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
      <BottomSheetView
        style={[styles.content, { paddingBottom: insets.bottom + 16 }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text size="lg" weight="bold">
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
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

        {/* Options */}
        <View style={styles.optionsList}>
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <Pressable
                key={String(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                onPress={() => handleSelect(option.value)}
                style={({ pressed }) => [
                  styles.optionItem,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  size="md"
                  weight={isSelected ? "semibold" : "regular"}
                  style={{
                    color: isSelected
                      ? theme.colors.brand[500]
                      : theme.colors.text.default,
                  }}
                >
                  {option.label}
                </Text>
              {isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={22}
                    color={typeof theme.colors.brand === 'string' ? theme.colors.brand : theme.colors.brand[500] || '#007AFF'}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

export const ValuePickerSheet = forwardRef(ValuePickerSheetInner) as <T>(
  props: ValuePickerSheetProps<T> & { ref?: React.Ref<ValuePickerSheetRef> }
) => React.ReactElement;

const styles = StyleSheet.create((theme) => ({
  content: {
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
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
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
}));
