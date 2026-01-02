import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Pressable, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";

type ProfileMenuSheetProps = {
  /** Initial online status */
  isOnline?: boolean;
  /** Callback when settings is pressed */
  onSettings?: () => void;
  /** Callback when subscription is pressed */
  onSubscription?: () => void;
  /** Callback when network is pressed */
  onNetwork?: () => void;
  /** Callback when invite and earn is pressed */
  onInviteAndEarn?: () => void;
  /** Callback when drafts is pressed */
  onDrafts?: () => void;
  /** Callback when history is pressed */
  onHistory?: () => void;
  /** Callback when saved is pressed */
  onSaved?: () => void;
  /** Callback when online status is toggled */
  onOnlineStatusChange?: (isOnline: boolean) => void;
  /** Callback when sheet is dismissed */
  onDismiss?: () => void;
};

export type ProfileMenuSheetRef = {
  present: () => void;
  dismiss: () => void;
};

// Menu Item Component
const MenuItem = ({
  iconName,
  title,
  onPress,
  rightContent,
}: {
  iconName: string;
  title: string;
  onPress?: () => void;
  rightContent?: React.ReactNode;
}) => {
  const { theme } = useUnistyles();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
    >
      <Box direction="row" alignItems="center" gap="md" flex>
        <Ionicons name={iconName as any} size={20} color={"rgb(29,31,30)"} />
        <Text style={{ color: "rgb(29,31,30)" }} size="lg" weight="light">
          {title}
        </Text>
      </Box>
      {rightContent}
    </Pressable>
  );
};

export const ProfileMenuSheet = forwardRef<
  ProfileMenuSheetRef,
  ProfileMenuSheetProps
>(
  (
    {
      isOnline = true,
      onSettings,
      onSubscription,
      onNetwork,
      onInviteAndEarn,
      onDrafts,
      onHistory,
      onSaved,
      onOnlineStatusChange,
      onDismiss,
    },
    ref
  ) => {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const [onlineStatus, setOnlineStatus] = useState(isOnline);

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

    const handleSettings = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onSettings?.();
    }, [dismiss, onSettings]);

    const handleSubscription = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onSubscription?.();
    }, [dismiss, onSubscription]);

    const handleNetwork = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onNetwork?.();
    }, [dismiss, onNetwork]);

    const handleInviteAndEarn = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onInviteAndEarn?.();
    }, [dismiss, onInviteAndEarn]);

    const handleDrafts = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onDrafts?.();
    }, [dismiss, onDrafts]);

    const handleHistory = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onHistory?.();
    }, [dismiss, onHistory]);

    const handleSaved = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onSaved?.();
    }, [dismiss, onSaved]);

    const handleOnlineToggle = useCallback(
      (value: boolean) => {
        triggerHaptic("light");
        setOnlineStatus(value);
        onOnlineStatusChange?.(value);
      },
      [onOnlineStatusChange]
    );

    const activeColor = "rgb(29, 68, 150)";

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
          style={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text size="lg" weight="bold">
              My Account
            </Text>
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

          {/* Menu Items */}
          <View style={styles.menuList}>
            <MenuItem
              iconName="settings-outline"
              title="Settings"
              onPress={handleSettings}
            />

            <MenuItem
              iconName="card-outline"
              title="Subscription"
              onPress={handleSubscription}
            />

            <MenuItem
              iconName="globe-outline"
              title="Network"
              onPress={handleNetwork}
            />

            <MenuItem
              iconName="gift-outline"
              title="Invite and Earn"
              onPress={handleInviteAndEarn}
            />

            <MenuItem
              iconName="document-text-outline"
              title="Drafts"
              onPress={handleDrafts}
            />

            <MenuItem
              iconName="time-outline"
              title="History"
              onPress={handleHistory}
            />

            <MenuItem
              iconName="bookmark-outline"
              title="Saved"
              onPress={handleSaved}
            />

            <MenuItem
              iconName="radio-button-on"
              title="Online Status"
              rightContent={
                <Switch
                  value={onlineStatus}
                  onValueChange={handleOnlineToggle}
                  trackColor={{
                    false: theme.colors.background.subtle,
                    true: activeColor,
                  }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={theme.colors.background.subtle}
                />
              }
            />
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

ProfileMenuSheet.displayName = "ProfileMenuSheet";

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
  menuList: {
    // paddingTop: theme.spacing.sm,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
  },
}));
