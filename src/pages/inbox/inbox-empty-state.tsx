import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { Button, Text } from "@/src/components/ui/primitives";

const emptyInfoImage = require("@/assets/images/empty-info.png");

type InboxEmptyStateProps = {
  isLoading: boolean;
  isError: boolean;
  hasInitialLoadTimedOut: boolean;
  isLoggedIn: boolean;
  onRetry: () => void;
};

export function InboxEmptyState({
  isLoading,
  isError,
  hasInitialLoadTimedOut,
  isLoggedIn,
  onRetry,
}: InboxEmptyStateProps) {
  const { theme } = useUnistyles();

  if (isLoading && !hasInitialLoadTimedOut) {
    return <ProfilePostsSkeleton count={6} type="comments" />;
  }

  if (isError || hasInitialLoadTimedOut) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.errorIconWrapper}>
          <Ionicons
            name="cloud-offline-outline"
            size={28}
            color={theme.colors.text.subtle}
          />
        </View>
        <Text size="md" weight="semibold" style={styles.emptyTitle}>
          Could not load inbox
        </Text>
        <Text size="sm" mode="subtle" style={styles.emptySubtitle}>
          Check your connection and try again.
        </Text>
        <Button
          size="sm"
          rounded="full"
          haptics="selection"
          onPress={onRetry}
          style={styles.retryButton}
        >
          <Button.Icon>
            <Ionicons
              name="refresh"
              size={14}
              color={theme.colors.background.default}
            />
          </Button.Icon>
          <Button.Text weight="semibold">Retry</Button.Text>
        </Button>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="log-in-outline" size={48} color={theme.colors.text.subtle} />
        <Text size="md" weight="medium" mode="subtle" style={styles.emptyTitle}>
          Sign in to see your inbox
        </Text>
        <Text size="sm" mode="subtle" style={styles.emptySubtitle}>
          Replies to your posts and comments will appear here
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyContainer}>
      <ExpoImage source={emptyInfoImage} style={styles.emptyImage} contentFit="contain" />
      <Text size="xxl" weight="bold" style={styles.emptyTitle}>
        No replies yet
      </Text>
      <Text size="lg" mode="subtle" style={styles.emptySubtitle}>
        When someone replies to your posts or comments, it will show up here
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  emptyImage: {
    width: 180,
    height: 180,
  },
  emptyTitle: {
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: theme.spacing.xs,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  errorIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background.subtle,
    marginBottom: theme.spacing.sm,
  },
}));
