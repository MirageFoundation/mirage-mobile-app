import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Divider, Text } from "@/src/components/ui/primitives";

type UserProfileMenuSheetProps = {
  username?: string;
  isFollowing?: boolean;
  isBlocked?: boolean;
  onFollow?: () => void;
  onUnfollow?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
  onReport?: () => void;
  onCopyProfileLink?: () => void;
  onDismiss?: () => void;
};

export type UserProfileMenuSheetRef = {
  present: () => void;
  dismiss: () => void;
};

const MenuItem = ({
  iconName,
  title,
  onPress,
  isDestructive = false,
}: {
  iconName: string;
  title: string;
  onPress?: () => void;
  isDestructive?: boolean;
}) => {
  const { theme } = useUnistyles();
  const color = isDestructive ? "#EF4444" : theme.colors.text.default;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
    >
      <Box direction="row" alignItems="center" gap="md" flex>
        <Ionicons name={iconName as any} size={20} color={color} />
        <Text style={{ color }} size="lg" weight="light">
          {title}
        </Text>
      </Box>
    </Pressable>
  );
};

export const UserProfileMenuSheet = forwardRef<
  UserProfileMenuSheetRef,
  UserProfileMenuSheetProps
>(
  (
    {
      username,
      isFollowing = false,
      isBlocked = false,
      onFollow,
      onUnfollow,
      onBlock,
      onUnblock,
      onReport,
      onCopyProfileLink,
      onDismiss,
    },
    ref,
  ) => {
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

    const handleFollow = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      if (isFollowing) {
        onUnfollow?.();
      } else {
        onFollow?.();
      }
    }, [dismiss, isFollowing, onFollow, onUnfollow]);

    const handleBlock = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      if (isBlocked) {
        onUnblock?.();
      } else {
        onBlock?.();
      }
    }, [dismiss, isBlocked, onBlock, onUnblock]);

    const handleReport = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onReport?.();
    }, [dismiss, onReport]);

    const handleCopyProfileLink = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onCopyProfileLink?.();
    }, [dismiss, onCopyProfileLink]);

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
          style={[
            styles.content,
            {
              paddingBottom:
                Platform.OS === "ios" ? insets.bottom : insets.bottom + 20,
            },
          ]}
        >
          <View style={styles.header}>
            <Text size="lg" weight="bold">
              {username ? `@${username}` : "User Options"}
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
          <Divider
            size="extraThin"
            style={{ marginBottom: theme.spacing.md, width: "100%" }}
          />

          <View style={styles.menuList}>
            <MenuItem
              iconName={
                isFollowing ? "person-remove-outline" : "person-add-outline"
              }
              title={isFollowing ? "Unfollow" : "Follow"}
              onPress={handleFollow}
            />

            <MenuItem
              iconName="link-outline"
              title="Copy Profile Link"
              onPress={handleCopyProfileLink}
            />

            <MenuItem
              iconName={isBlocked ? "shield-checkmark-outline" : "ban-outline"}
              title={isBlocked ? "Unblock User" : "Block User"}
              onPress={handleBlock}
              isDestructive={!isBlocked}
            />

            <MenuItem
              iconName="flag-outline"
              title="Report User"
              onPress={handleReport}
              isDestructive
            />
          </View>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

UserProfileMenuSheet.displayName = "UserProfileMenuSheet";

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
  menuList: {},
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm + 2,
  },
}));
