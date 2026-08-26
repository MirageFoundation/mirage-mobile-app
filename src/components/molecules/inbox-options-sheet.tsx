import { triggerHaptic } from "@/src/components/utils/haptics";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Dimensions, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Divider, Text } from "@/src/components/ui/primitives";

type InboxOptionsSheetProps = {
  onMarkAllAsSeen?: () => void;
  onDismiss?: () => void;
};

export type InboxOptionsSheetRef = {
  present: () => void;
  dismiss: () => void;
};

const MenuItem = ({
  iconName,
  iconComponent: IconComponent = Ionicons,
  title,
  onPress,
}: {
  iconName: string;
  iconComponent?: typeof Ionicons;
  title: string;
  onPress?: () => void;
}) => {
  const { theme } = useUnistyles();
  const color = theme.colors.text.subtle;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        Platform.OS === "ios" && styles.menuItemIOS,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Box direction="row" alignItems="center" gap="md" flex>
        <IconComponent name={iconName as any} size={20} color={color} />
        <Text style={{ color }} size="lg" weight="light">
          {title}
        </Text>
      </Box>
    </Pressable>
  );
};

export const InboxOptionsSheet = forwardRef<
  InboxOptionsSheetRef,
  InboxOptionsSheetProps
>(({ onMarkAllAsSeen, onDismiss }, ref) => {
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

  const handleMarkAllAsSeen = useCallback(() => {
    triggerHaptic("medium");
    dismiss();
    onMarkAllAsSeen?.();
  }, [dismiss, onMarkAllAsSeen]);

  const footerHeight =
    Platform.OS === "ios" ? insets.bottom : insets.bottom + 30;

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
            Options
          </Text>
          <Pressable onPress={dismiss} style={[styles.closeButton]}>
            <EvilIcons
              name="close"
              size={24}
              color={theme.colors.text.default}
            />
          </Pressable>
        </View>
        <Divider size="extraThin" style={styles.divider} />

        <View style={styles.menuList}>
          <MenuItem
            iconName="checkmark-done-outline"
            title="Mark all as seen"
            onPress={handleMarkAllAsSeen}
          />
        </View>

        <View style={{ height: footerHeight }} />
      </BottomSheetView>
    </BottomSheetModal>
  );
});

InboxOptionsSheet.displayName = "InboxOptionsSheet";

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
  divider: {
    width: Dimensions.get("window").width,
    alignSelf: "center",
    marginBottom: theme.sizing.md,
  },
  menuList: {},
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm + 3,
  },
  menuItemIOS: {
    paddingVertical: theme.spacing.sm + 3,
  },
}));
