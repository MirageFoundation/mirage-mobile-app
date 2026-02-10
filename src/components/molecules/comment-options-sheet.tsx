import { triggerHaptic } from "@/src/components/utils/haptics";
import { EvilIcons, Feather, Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  SCREEN_WIDTH,
} from "@gorhom/bottom-sheet";
import * as Clipboard from "expo-clipboard";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Platform, Pressable, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Divider, Text } from "@/src/components/ui/primitives";
import { usePreferencesStore, getShareBaseUrl } from "@/src/stores";
import type { Comment } from "./comment-item";

type CommentOptionsSheetProps = {
  comment?: Comment | null;
  rootPostId?: string;
  isOwnComment?: boolean;
  isFollowingAuthor?: boolean;
  onShare?: () => void;
  onCopyText?: () => void;
  onBlockUser?: () => void;
  onBlockComment?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onToggleFollowAuthor?: () => void;
  onDismiss?: () => void;
};

export type CommentOptionsSheetRef = {
  present: () => void;
  dismiss: () => void;
};

// Menu Item Component
const MenuItem = ({
  iconName,
  iconComponent: IconComponent = Ionicons,
  title,
  onPress,
  isDestructive = false,
}: {
  iconName: string;
  iconComponent?: typeof Ionicons | typeof Feather;
  title: string;
  onPress?: () => void;
  isDestructive?: boolean;
}) => {
  const { theme } = useUnistyles();
  const color = isDestructive
    ? theme.colors.error[500]
    : theme.colors.text.subtle;

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

export const CommentOptionsSheet = forwardRef<
  CommentOptionsSheetRef,
  CommentOptionsSheetProps
>(
  (
    {
      comment,
      rootPostId,
      isOwnComment = false,
      isFollowingAuthor = false,
      onShare,
      onCopyText,
      onBlockUser,
      onBlockComment,
      onEdit,
      onDelete,
      onReport,
      onToggleFollowAuthor,
      onDismiss,
    },
    ref,
  ) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const shareServer = usePreferencesStore((s) => s.shareServer);

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

    const handleShare = useCallback(async () => {
      triggerHaptic("light");
      try {
        const commentId = comment?.id || "";
        const root = rootPostId || "";
        const url = `${getShareBaseUrl(shareServer)}/p/${commentId}`;
        await Share.share({
          message: `What do you think about this? 🗳️\n${url}`,
        });
      } catch {
        // User cancelled
      }
      dismiss();
      onShare?.();
    }, [comment?.id, rootPostId, shareServer, dismiss, onShare]);

    const handleCopyText = useCallback(async () => {
      triggerHaptic("medium");
      if (comment?.content) {
        await Clipboard.setStringAsync(comment.content);
      }
      dismiss();
      onCopyText?.();
    }, [dismiss, comment?.content, onCopyText]);

    const handleDelete = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onDelete?.();
    }, [dismiss, onDelete]);

    const handleEdit = useCallback(() => {
      triggerHaptic("selection");
      dismiss();
      onEdit?.();
    }, [dismiss, onEdit]);

    const handleReport = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onReport?.();
    }, [dismiss, onReport]);

    const handleBlockUser = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onBlockUser?.();
    }, [dismiss, onBlockUser]);

    const handleBlockComment = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onBlockComment?.();
    }, [dismiss, onBlockComment]);

    const handleToggleFollowAuthor = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onToggleFollowAuthor?.();
    }, [dismiss, onToggleFollowAuthor]);

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
          {/* Header */}
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

          {/* Menu Items */}
          <View style={styles.menuList}>
            {!isOwnComment && (
              <MenuItem
                iconName={
                  isFollowingAuthor
                    ? "person-remove-outline"
                    : "person-add-outline"
                }
                title={
                  isFollowingAuthor
                    ? `Unfollow @${comment?.author.username}`
                    : `Follow @${comment?.author.username}`
                }
                onPress={handleToggleFollowAuthor}
              />
            )}

            <MenuItem
              iconComponent={Feather}
              iconName="share"
              title="Share"
            onPress={handleShare}
            />

            <MenuItem
              iconComponent={Feather}
              iconName="copy"
              title="Copy text"
              onPress={handleCopyText}
            />

            {!isOwnComment && (
              <MenuItem
                iconName="ban-outline"
                title="Block comment"
                onPress={handleBlockComment}
                isDestructive
              />
            )}

            {!isOwnComment && (
              <MenuItem
                iconName="ban-outline"
                title={`Block @${comment?.author.username}`}
                onPress={handleBlockUser}
                isDestructive
              />
            )}

            {!isOwnComment && (
              <MenuItem
                iconName="flag-outline"
                title="Report"
                onPress={handleReport}
                isDestructive
              />
            )}

            {isOwnComment && (
              <MenuItem
                iconComponent={Feather}
                iconName="edit-2"
                title="Edit Comment"
                onPress={handleEdit}
              />
            )}

            {isOwnComment && (
              <MenuItem
                iconComponent={Feather}
                iconName="trash-2"
                title="Delete Comment"
                onPress={handleDelete}
                isDestructive
              />
            )}
          </View>

          {/* Footer spacer for safe area */}
          <View style={{ height: footerHeight }} />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

CommentOptionsSheet.displayName = "CommentOptionsSheet";

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
    width: SCREEN_WIDTH,
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
