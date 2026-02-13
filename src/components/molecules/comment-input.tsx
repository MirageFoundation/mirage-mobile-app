import { Text } from "@/src/components/ui/primitives";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { forwardRef, useCallback, useImperativeHandle } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type CommentInputProps = {
  onSubmit?: (
    text: string,
    imageUri?: string | null,
    gifUrl?: string | null,
  ) => void | Promise<void>;
  onAddLink?: (name: string, url: string) => void;
  onAddImage?: (uri: string) => void;
  onAddGif?: (url: string) => void;
  isLoggedIn?: boolean;
  onAuthRequired?: () => void;
  disabled?: boolean;
  loading?: boolean;
  replyingTo?: string | null;
 replyingToId?: string | null;
  replyingToContent?: string | null;
 onCancelReply?: () => void;
  style?: StyleProp<ViewStyle>;
  postId?: string;
  postTitle?: string;
  postAuthorUsername?: string;
  postThumbnail?: string;
  postContent?: string;
};

export type CommentInputRef = {
  activate: () => void;
};

export const CommentInput = forwardRef<CommentInputRef, CommentInputProps>(
  (
    {
      isLoggedIn = false,
      onAuthRequired,
      disabled = false,
      replyingTo,
     replyingToId,
      replyingToContent,
     onCancelReply,
      style,
      postId,
      postTitle,
      postAuthorUsername,
      postThumbnail,
      postContent,
    },
    ref,
  ) => {
    const insets = useSafeAreaInsets();
    const { theme } = useUnistyles();
    const router = useRouter();

   const openComposeScreen = useCallback(
      (replyToUsername?: string | null, replyToId?: string | null, replyToContent?: string | null) => {
       if (!isLoggedIn) {
         onAuthRequired?.();
         return;
       }
       const params: Record<string, string> = { postId: postId ?? "" };
       if (postTitle) params.postTitle = postTitle;
       if (postAuthorUsername) params.postAuthorUsername = postAuthorUsername;
       if (postThumbnail) params.postThumbnail = postThumbnail;
       if (postContent) params.postContent = postContent;
       if (replyToUsername) params.replyToUsername = replyToUsername;
       if (replyToId) params.replyToId = replyToId;
        if (replyToContent) params.replyToContent = replyToContent;
       router.push({ pathname: "/comment-compose", params });
     },
      [
        isLoggedIn,
        onAuthRequired,
        postId,
        postTitle,
        postAuthorUsername,
        postThumbnail,
        postContent,
        router,
      ],
    );

   const handleActivate = useCallback(() => {
      openComposeScreen(replyingTo, replyingToId, replyingToContent);
    }, [openComposeScreen, replyingTo, replyingToId, replyingToContent]);

    useImperativeHandle(
      ref,
      () => ({
        activate: () => {
          handleActivate();
        },
      }),
      [handleActivate],
    );

    return (
      <View
        style={[
          styles.inactiveContainer,
          style,
          { paddingBottom: insets.bottom || 8 },
        ]}
      >
        {replyingTo && (
          <View style={styles.replyBanner}>
            <Text size="xs" mode="subtle">
              Replying to{" "}
              <Text
                size="xs"
                weight="semibold"
                style={{ color: theme.colors.brand[500] }}
              >
                @{replyingTo}
              </Text>
            </Text>
            <Pressable
              onPress={() => onCancelReply?.()}
              style={styles.cancelReply}
            >
              <Ionicons
                name="close"
                size={16}
                color={theme.colors.text.subtle}
              />
            </Pressable>
          </View>
        )}
        <View style={styles.inactiveInputWrapper}>
          <Pressable
            onPress={handleActivate}
            style={styles.inactiveInput}
            disabled={disabled}
          >
            <Text size="md">
              {isLoggedIn
                ? replyingTo
                  ? `Reply to @${replyingTo}...`
                  : "Share your thoughts..."
                : "Login to comment"}
            </Text>
          </Pressable>
          <View style={styles.inactiveIcons}>
            <Pressable
              onPress={handleActivate}
              style={styles.inactiveIconButton}
            >
              <MaterialIcons
                name="gif"
                size={24}
                color={theme.colors.text.default}
              />
            </Pressable>
            <Pressable
              onPress={handleActivate}
              style={styles.inactiveIconButton}
            >
              <Ionicons
                name="image-outline"
                size={20}
                color={theme.colors.text.default}
              />
            </Pressable>
          </View>
        </View>
      </View>
    );
  },
);

CommentInput.displayName = "CommentInput";

const styles = StyleSheet.create((theme) => ({
  inactiveContainer: {
    backgroundColor: theme.colors.background.default,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
  inactiveInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background.lighter,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  inactiveInput: {
    flex: 1,
    justifyContent: "center",
  },
  inactiveIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  inactiveIconButton: {
    padding: 4,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  cancelReply: {
    padding: theme.spacing.xs,
  },
}));
