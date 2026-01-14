import { Avatar, TimeAgo } from "@/src/components/atoms";
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
import { Image } from "expo-image";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Platform, Pressable, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import type { Comment } from "./comment-item";

type CommentOptionsSheetProps = {
  /** The comment to show options for */
  comment?: Comment | null;
  /** Whether the current user is the author */
  isOwnComment?: boolean;
  /** Whether the user is following the comment author */
  isFollowingAuthor?: boolean;
  /** Callback when share is pressed */
  onShare?: () => void;
  /** Callback when share as post is pressed */
  onShareAsPost?: () => void;
  /** Callback when save is pressed */
  onSave?: () => void;
  /** Callback when follow comment is pressed */
  onFollowComment?: () => void;
  /** Callback when copy text is pressed */
  onCopyText?: () => void;
  /** Callback when collapse is pressed */
  onCollapse?: () => void;
  /** Callback when block user is pressed */
  onBlockUser?: () => void;
  /** Callback when delete is pressed */
  onDelete?: () => void;
  /** Callback when report is pressed */
  onReport?: () => void;
  /** Callback when follow/unfollow author is pressed */
  onToggleFollowAuthor?: () => void;
  /** Callback when sheet is dismissed */
  onDismiss?: () => void;
};

export type CommentOptionsSheetRef = {
  present: () => void;
  dismiss: () => void;
};

// Regex patterns to detect image URLs
const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi;
const CLOUDFLARE_IMAGE_REGEX = /https?:\/\/imagedelivery\.net\/[^\s]+/gi;
const GIPHY_URL_REGEX =
  /https?:\/\/(?:media\d?\.giphy\.com|i\.giphy\.com)\/[^\s]+/gi;
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\(([^)]+)\)/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Extract image URLs from content
 */
function extractImageUrls(content: string): string[] {
  const urls: string[] = [];

  // Check for markdown images first
  let match;
  while ((match = MARKDOWN_IMAGE_REGEX.exec(content)) !== null) {
    urls.push(match[1]);
  }

  // Check for direct image URLs
  const imageMatches = content.match(IMAGE_URL_REGEX) || [];
  urls.push(...imageMatches);

  // Check for Cloudflare Images
  const cloudflareMatches = content.match(CLOUDFLARE_IMAGE_REGEX) || [];
  urls.push(...cloudflareMatches);

  // Check for Giphy URLs
  const giphyMatches = content.match(GIPHY_URL_REGEX) || [];
  urls.push(...giphyMatches);

  // Remove duplicates
  return [...new Set(urls)];
}

/**
 * Remove image URLs and markdown links from content for text preview
 */
function getCleanTextPreview(content: string): string {
  let cleaned = content;

  // Remove markdown images
  cleaned = cleaned.replace(MARKDOWN_IMAGE_REGEX, "");

  // Replace markdown links with just the text
  cleaned = cleaned.replace(MARKDOWN_LINK_REGEX, "$1");

  // Remove standalone image URLs
  cleaned = cleaned.replace(IMAGE_URL_REGEX, "");
  cleaned = cleaned.replace(CLOUDFLARE_IMAGE_REGEX, "");
  cleaned = cleaned.replace(GIPHY_URL_REGEX, "");

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}

// Menu Item Component
const MenuItem = ({
  iconName,
  iconComponent: IconComponent = Ionicons,
  title,
  onPress,
  isDestructive = false,
}: {
  iconName: string;
  iconComponent?:
    | typeof Ionicons
    | typeof Feather
    | typeof MaterialCommunityIcons;
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
      isOwnComment = false,
      isFollowingAuthor = false,
      onShare,
      onShareAsPost,
      onSave,
      onFollowComment,
      onCopyText,
      onCollapse,
      onBlockUser,
      onDelete,
      onReport,
      onToggleFollowAuthor,
      onDismiss,
    },
    ref
  ) => {
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

    const handleShare = useCallback(async () => {
      triggerHaptic("light");
      try {
        await Share.share({
          message: comment?.content || "",
        });
      } catch {
        // User cancelled
      }
      dismiss();
      onShare?.();
    }, [comment?.content, dismiss, onShare]);

    const handleShareAsPost = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onShareAsPost?.();
    }, [dismiss, onShareAsPost]);

    const handleSave = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onSave?.();
    }, [dismiss, onSave]);

    const handleFollowComment = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onFollowComment?.();
    }, [dismiss, onFollowComment]);

    const handleCopyText = useCallback(async () => {
      triggerHaptic("medium");
      if (comment?.content) {
        await Clipboard.setStringAsync(comment.content);
      }
      dismiss();
      onCopyText?.();
    }, [dismiss, comment?.content, onCopyText]);

    const handleCollapse = useCallback(() => {
      triggerHaptic("light");
      dismiss();
      onCollapse?.();
    }, [dismiss, onCollapse]);

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

    const handleBlockUser = useCallback(() => {
      triggerHaptic("warning");
      dismiss();
      onBlockUser?.();
    }, [dismiss, onBlockUser]);

    const handleToggleFollowAuthor = useCallback(() => {
      triggerHaptic("medium");
      dismiss();
      onToggleFollowAuthor?.();
    }, [dismiss, onToggleFollowAuthor]);

    // Extract image URLs and clean text for preview
    const { imageUrls, previewText } = useMemo(() => {
      if (!comment?.content) {
        return { imageUrls: [], previewText: "" };
      }
      const urls = extractImageUrls(comment.content);
      const cleanText = getCleanTextPreview(comment.content);
      const truncated =
        cleanText.length > 100
          ? `${cleanText.substring(0, 100)}...`
          : cleanText;
      return { imageUrls: urls, previewText: truncated };
    }, [comment?.content]);

    // Footer height for safe area
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

          {/* Comment Preview */}
          {comment && (
            <View
              style={[
                styles.commentPreview,
                { backgroundColor: theme.colors.background.subtle },
              ]}
            >
              {/* Author Row */}
              <View style={styles.authorRow}>
                <Avatar
                  size="sm"
                  seed={comment.author.avatarSeed}
                  url={comment.author.avatarUrl}
                />
                <Text size="sm" weight="semibold" style={styles.authorUsername}>
                  @{comment.author.username}
                </Text>
                <TimeAgo
                  date={comment.createdAt}
                  style={{ color: theme.colors.text.subtle }}
                />
              </View>

              {/* Image Preview (if any) */}
              {imageUrls.length > 0 && (
                <View style={styles.imagePreviewRow}>
                  {imageUrls.slice(0, 3).map((url, index) => (
                    <Image
                      key={`${url}-${index}`}
                      source={{ uri: url }}
                      style={styles.imagePreview}
                      contentFit="cover"
                    />
                  ))}
                  {imageUrls.length > 3 && (
                    <View
                      style={[
                        styles.moreImagesIndicator,
                        { backgroundColor: theme.colors.background.emphasis },
                      ]}
                    >
                      <Text size="xs" weight="semibold">
                        +{imageUrls.length - 3}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Comment Text (only if there's text after removing images) */}
              {previewText.length > 0 && (
                <Text
                  size="sm"
                  mode="subtle"
                  style={styles.commentText}
                  numberOfLines={3}
                >
                  {previewText}
                </Text>
              )}
            </View>
          )}

          {/* Divider */}
          <View
            style={[
              styles.divider,
              { backgroundColor: theme.colors.border.default },
            ]}
          />

          {/* Menu Items */}
          <View style={styles.menuList}>
            {/* Share */}
            <MenuItem
              iconComponent={Feather}
              iconName="share"
              title="Share"
              onPress={handleShare}
            />

            {/* Share as Post */}
            <MenuItem
              iconComponent={Ionicons}
              iconName="create-outline"
              title="Share as post"
              onPress={handleShareAsPost}
            />

            {/* Save */}
            <MenuItem
              iconComponent={Feather}
              iconName="bookmark"
              title="Save"
              onPress={handleSave}
            />

            {/* Follow Comment */}
            <MenuItem
              iconComponent={Ionicons}
              iconName="notifications-outline"
              title="Follow comment"
              onPress={handleFollowComment}
            />

            {/* Copy Text */}
            <MenuItem
              iconComponent={Feather}
              iconName="copy"
              title="Copy text"
              onPress={handleCopyText}
            />

            {/* Collapse Thread */}
            <MenuItem
              iconComponent={MaterialCommunityIcons}
              iconName="arrow-collapse-vertical"
              title="Collapse thread"
              onPress={handleCollapse}
            />

            {/* Block Account (only for other users' comments) - RED */}
            {!isOwnComment && (
              <MenuItem
                iconName="ban-outline"
                title={`Block @${comment?.author.username}`}
                onPress={handleBlockUser}
                isDestructive
              />
            )}

            {/* Report (only for other users' comments) - RED */}
            {!isOwnComment && (
              <MenuItem
                iconName="flag-outline"
                title="Report"
                onPress={handleReport}
                isDestructive
              />
            )}

            {/* Follow/Unfollow Author (only for other users' comments) */}
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

            {/* Delete (only for own comments) - RED */}
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
  }
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
  commentPreview: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  authorUsername: {
    flex: 1,
  },
  imagePreviewRow: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  imagePreview: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
  },
  moreImagesIndicator: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  commentText: {
    lineHeight: 20,
    marginTop: theme.spacing.xs,
  },
  divider: {
    height: 1,
    marginVertical: theme.spacing.sm,
  },
  menuList: {},
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
  },
  menuItemIOS: {
    paddingVertical: theme.spacing.sm,
  },
}));
