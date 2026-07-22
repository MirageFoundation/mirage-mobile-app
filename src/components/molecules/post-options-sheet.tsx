import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  EvilIcons,
  Feather,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { FlatList, Platform, Pressable, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { usePreferencesStore, getShareBaseUrl } from "@/src/stores";
import { useAuthStore } from "@/src/stores/auth-store";
import type { Post } from "./post-card";

type PostOptionsSheetProps = {
  /** The post to show options for */
  post?: Post | null;
  /** Whether the current user is the author */
  isOwnPost?: boolean;
  /** Whether the topic is currently followed */
  isTopicFollowed?: boolean;
  /** Whether the user is currently followed */
  isFollowingUser?: boolean;
  /** Whether the post is currently saved */
  isSaved?: boolean;
  /** Callback when show fewer is pressed */
  onShowFewer?: () => void;
  /** Callback when follow/unfollow user is pressed */
  onFollowUser?: () => void;
  /** Callback when follow/unfollow topic is pressed */
  onFollowTopic?: () => void;
  /** Callback when save is pressed */
  onSave?: () => void;
  /** Callback when copy text is pressed */
  onCopyText?: () => void;
  /** Callback when block post is pressed */
  onBlockPost?: () => void;
  /** Callback when block user is pressed */
  onBlockUser?: () => void;
  /** Callback when hide post is pressed */
  onHidePost?: () => void;
  /** Callback when delete is pressed */
  onDelete?: () => void;
  /** Callback when edit is pressed */
  onEdit?: () => void;
  /** Callback when report is pressed */
  onReport?: () => void;
  /** Callback when give award is pressed */
  onGiveAward?: () => void;
  /** Callback when gift mirage is pressed */
  onGiftMirage?: () => void;
  /** Callback when gift subscription is pressed */
  onGiftSubscription?: () => void;
  /** Callback when annotate is pressed (agent only) */
  onAnnotate?: () => void;
  /** Callback when sheet is dismissed */
  onDismiss?: () => void;
};

export type PostOptionsSheetRef = {
  present: () => void;
  dismiss: () => void;
};

type ShareApp = {
  id: string;
  iconName: string;
  iconComponent: typeof Ionicons | typeof Feather;
  label: string;
  color?: string;
};

const SHARE_APPS: ShareApp[] = [
  {
    id: "whatsapp",
    iconName: "logo-whatsapp",
    iconComponent: Ionicons,
    label: "WhatsApp",
    color: "#25D366",
  },
  {
    id: "messages",
    iconName: "chatbubble",
    iconComponent: Ionicons,
    label: "Messages",
    color: "#34C759",
  },
  {
    id: "instagram",
    iconName: "logo-instagram",
    iconComponent: Ionicons,
    label: "Instagram",
    color: "#E4405F",
  },
  {
    id: "telegram",
    iconName: "paper-plane",
    iconComponent: Ionicons,
    label: "Telegram",
    color: "#0088CC",
  },
  { id: "copy", iconName: "link", iconComponent: Feather, label: "Copy" },
];

// Share app button component
const ShareAppButton = ({
  item,
  onPress,
}: {
  item: ShareApp;
  onPress: (id: string) => void;
}) => {
  const { theme } = useUnistyles();
  const IconComponent = item.iconComponent;
  const iconColor = item.color ?? theme.colors.text.default;

  return (
    <Pressable
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [
        styles.shareAppButton,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View
        style={[
          styles.shareAppIconContainer,
          { backgroundColor: theme.colors.background.subtle },
        ]}
      >
        <IconComponent
          name={item.iconName as any}
          size={24}
          color={iconColor}
        />
      </View>
      <Text
        size="xs"
        mode="subtle"
        style={styles.shareAppLabel}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </Pressable>
  );
};

// Menu Item Component
const MenuItem = ({
  iconName,
  iconComponent: IconComponent = Ionicons,
  title,
  onPress,
  isDestructive = false,
  disabled = false,
}: {
  iconName: string;
  iconComponent?:
    | typeof Ionicons
    | typeof Feather
    | typeof MaterialCommunityIcons;
  title: string;
  onPress?: () => void;
  isDestructive?: boolean;
  disabled?: boolean;
}) => {
  const { theme } = useUnistyles();
  const color = disabled
    ? theme.colors.text.subtle
    : isDestructive
      ? theme.colors.error[500]
      : theme.colors.text.subtle;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.menuItem,
        Platform.OS === "ios" && styles.menuItemIOS,
        pressed && !disabled && { opacity: 0.7 },
        disabled && { opacity: 0.6 },
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

export const PostOptionsSheet = forwardRef<
  PostOptionsSheetRef,
  PostOptionsSheetProps
>(
  (
    {
      post,
      isOwnPost = false,
      isTopicFollowed = false,
      isFollowingUser = false,
      isSaved = false,
      onShowFewer,
      onFollowUser,
      onFollowTopic,
      onSave,
      onCopyText,
      onBlockPost,
      onBlockUser,
      onHidePost,
      onDelete,
      onEdit,
      onReport,
      onGiveAward,
      onGiftMirage,
      onGiftSubscription,
      onAnnotate,
      onDismiss,
    },
    ref,
  ) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const shareServer = usePreferencesStore((s) => s.apiServer);
    const userLevel = useAuthStore((s) => s.userLevel);
    const isAgent = userLevel >= 10;

    const present = useCallback(() => {
      bottomSheetRef.current?.present(0);
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

    const getShareUrl = useCallback(() => {
      if (!post?.id) return "";
      return `${getShareBaseUrl(shareServer)}/p/${post.id}`;
    }, [post?.id, shareServer]);

    const getShareMessage = useCallback(() => {
      const url = getShareUrl();
      return url;
    }, [getShareUrl]);

    // Share handlers
    const handleShareApp = useCallback(
      async (appId: string) => {
        triggerHaptic("light");

        switch (appId) {
          case "whatsapp": {
            try {
              const url = `whatsapp://send?text=${encodeURIComponent(
                getShareMessage(),
              )}`;
              const canOpen = await Linking.canOpenURL(url);
              if (canOpen) {
                await Linking.openURL(url);
                break;
              }
            } catch {
            }
              await Linking.openURL(
                `https://wa.me/?text=${encodeURIComponent(getShareMessage())}`,
              );
            break;
          }
          case "messages": {
            try {
              const url = `sms:&body=${encodeURIComponent(getShareMessage())}`;
              await Linking.openURL(url);
            } catch {
            }
            break;
          }
          case "instagram": {
            await Clipboard.setStringAsync(getShareUrl());
            try {
              const appUrl = "instagram://app";
              const canOpen = await Linking.canOpenURL(appUrl);
              if (canOpen) {
                await Linking.openURL(appUrl);
                break;
              }
            } catch {
            }
            await Linking.openURL("https://www.instagram.com/");
            break;
          }
          case "telegram": {
            try {
              const url = `tg://msg_url?url=${encodeURIComponent(
                getShareUrl(),
              )}&text=${encodeURIComponent(post?.title || "")}`;
              const canOpen = await Linking.canOpenURL(url);
              if (canOpen) {
                await Linking.openURL(url);
                break;
              }
            } catch {
            }
              await Linking.openURL(
                `https://t.me/share/url?url=${encodeURIComponent(
                  getShareUrl(),
                )}&text=${encodeURIComponent(post?.title || "")}`,
              );
            break;
          }
          case "copy": {
            triggerHaptic("medium");
            await Clipboard.setStringAsync(getShareUrl());
            break;
          }
          case "more": {
            try {
              const url = getShareUrl();
              const shareMessage = post?.title
                ? `${post.title}\n\n${url}`
                : url;
              await Share.share({
                message: shareMessage,
                title: post?.title,
              });
            } catch {
              // User cancelled
            }
            break;
          }
        }
        dismiss();
      },
      [getShareMessage, getShareUrl, post?.title, dismiss],
    );

    // Menu handlers
    const handleShowFewer = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onShowFewer?.();
    }, [dismiss, onShowFewer]);

    const handleFollowUser = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onFollowUser?.();
    }, [dismiss, onFollowUser]);

    const handleFollowTopic = useCallback(() => {
      dismiss();
      onFollowTopic?.();
    }, [dismiss, onFollowTopic]);

    const handleSave = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onSave?.();
    }, [dismiss, onSave]);

    const handleCopyText = useCallback(async () => {
      triggerHaptic("medium");
      if (post?.body) {
        await Clipboard.setStringAsync(post.body);
      }
      dismiss();
      onCopyText?.();
    }, [dismiss, post?.body, onCopyText]);

    const handleHidePost = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onHidePost?.();
    }, [dismiss, onHidePost]);

    const handleBlockUser = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onBlockUser?.();
    }, [dismiss, onBlockUser]);

    const handleEdit = useCallback(() => {
      triggerHaptic("selection");
      dismiss();
      onEdit?.();
    }, [dismiss, onEdit]);

    const handleDelete = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onDelete?.();
    }, [dismiss, onDelete]);

    const handleReport = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onReport?.();
    }, [dismiss, onReport]);

    const handleGiveAward = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onGiveAward?.();
    }, [dismiss, onGiveAward]);

    const handleGiftMirage = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onGiftMirage?.();
    }, [dismiss, onGiftMirage]);

    const handleGiftSubscription = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onGiftSubscription?.();
    }, [dismiss, onGiftSubscription]);

    const handleAnnotate = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onAnnotate?.();
    }, [dismiss, onAnnotate]);

    const handleShare = useCallback(async () => {
      triggerHaptic("light");
      dismiss();
      try {
        const url = getShareUrl();
        const shareMessage = post?.title ? `${post.title}\n\n${url}` : url;
        await Share.share({ message: shareMessage, title: post?.title });
      } catch {
      }
    }, [dismiss, getShareUrl, post?.title]);

    // Render share app item for FlatList
    const renderShareApp = useCallback(
      ({ item }: { item: ShareApp }) => (
        <ShareAppButton item={item} onPress={handleShareApp} />
      ),
      [handleShareApp],
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
        <BottomSheetView style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text size="lg" weight="bold">
              Options
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close post options"
              onPress={dismiss}
              style={[styles.closeButton]}
              hitSlop={6}
            >
              <EvilIcons
                name="close"
                size={24}
                color={theme.colors.text.default}
              />
            </Pressable>
          </View>

          {/* Share Row - Using FlatList for scrollability */}
          <FlatList
            horizontal
            data={SHARE_APPS}
            keyExtractor={(item) => item.id}
            renderItem={renderShareApp}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shareRowContent}
            style={styles.shareRow}
          />

          {/* Divider - Full width */}
          <View
            style={[
              styles.divider,
              { backgroundColor: theme.colors.border.default },
            ]}
          />

          {/* Menu Items - Arranged in logical order */}
          <View style={styles.menuList}>
            {/* Save Post */}
            <MenuItem
              iconComponent={Feather}
              iconName={isSaved ? "bookmark" : "bookmark"}
              title={isSaved ? "Unsave" : "Save"}
              onPress={handleSave}
            />

            {/* Copy Text */}
            <MenuItem
              iconComponent={Feather}
              iconName="copy"
              title="Copy text"
              onPress={handleCopyText}
            />

            <MenuItem
              iconComponent={Feather}
              iconName="share"
              title="Share"
              onPress={handleShare}
            />

            {!isOwnPost && onGiveAward && (
              <MenuItem
                iconName="gift-outline"
                title="Give Award"
                onPress={handleGiveAward}
              />
            )}

            {!isOwnPost && onGiftMirage && (
              <MenuItem
                iconName="cash-outline"
                title="Gift Mirage"
                onPress={handleGiftMirage}
              />
            )}

            {!isOwnPost && onGiftSubscription && (
              <MenuItem
                iconName="diamond-outline"
                title="Gift Subscription"
                onPress={handleGiftSubscription}
              />
            )}

            {isOwnPost && (
              <MenuItem
                iconComponent={Feather}
                iconName="edit-2"
                title="Edit Post"
                onPress={handleEdit}
              />
            )}

            {/* Delete (only for own posts) - RED */}
            {isOwnPost && (
              <MenuItem
                iconComponent={Feather}
                iconName="trash-2"
                title="Delete Post"
                onPress={handleDelete}
                isDestructive
              />
            )}
          </View>

          {/* Footer spacer for safe area */}
          <View
            style={{
              height:
                Platform.OS === "ios" ? insets.bottom : insets.bottom + 30,
            }}
          />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

PostOptionsSheet.displayName = "PostOptionsSheet";

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
  shareRow: {
    marginHorizontal: -theme.spacing.lg,
  },
  shareRowContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  shareAppButton: {
    alignItems: "center",
    width: 56,
  },
  shareAppIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.xs,
  },
  shareAppLabel: {
    textAlign: "center",
  },
  divider: {
    height: 1,
    marginVertical: theme.spacing.md,
    marginHorizontal: -theme.spacing.lg,
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
