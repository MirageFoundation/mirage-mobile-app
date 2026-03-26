import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";

type PostDetailEmptyCommentsProps = {
  isLoading: boolean;
  isError: boolean;
  subtleBackgroundColor: string;
  subtleTextColor: string;
  errorColor: string;
  borderColor: string;
  onRetry: () => void;
};

export function PostDetailEmptyComments({
  isLoading,
  isError,
  subtleBackgroundColor,
  subtleTextColor,
  errorColor,
  borderColor,
  onRetry,
}: PostDetailEmptyCommentsProps) {
  if (isLoading) {
    return (
      <View>
        {renderCommentSkeleton(0, 0, subtleBackgroundColor)}
        {renderCommentSkeleton(1, 1, subtleBackgroundColor)}
        {renderCommentSkeleton(2, 1, subtleBackgroundColor)}
        {renderCommentSkeleton(3, 0, subtleBackgroundColor)}
        {renderCommentSkeleton(4, 1, subtleBackgroundColor)}
        {renderCommentSkeleton(5, 0, subtleBackgroundColor)}
      </View>
    );
  }

  if (isError) {
    return (
      <Box flex center p="lg">
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={errorColor}
        />
        <Text
          size="md"
          weight="medium"
          mode="subtle"
          style={{ marginTop: 12 }}
        >
          Failed to load comments
        </Text>
        <Text
          size="sm"
          mode="subtle"
          style={{ marginTop: 4, textAlign: "center" }}
        >
          Something went wrong. Please check your connection and try again.
        </Text>
        <Pressable
          onPress={onRetry}
          style={[
            styles.retryButton,
            {
              borderColor,
              backgroundColor: subtleBackgroundColor,
            },
          ]}
        >
          <Text size="sm" weight="medium">
            Try again
          </Text>
        </Pressable>
      </Box>
    );
  }

  return (
    <Box flex center p="lg">
      <Ionicons
        name="chatbubbles-outline"
        size={48}
        color={subtleTextColor}
      />
      <Text
        size="lg"
        weight="semibold"
        mode="subtle"
        style={{ marginTop: 12 }}
      >
        No comments yet
      </Text>
      <Text
        size="md"
        mode="subtle"
        style={{ marginTop: 2, textAlign: "center" }}
      >
        Be the first to share your thoughts!
      </Text>
    </Box>
  );
}

function renderCommentSkeleton(
  index: number,
  depth: number,
  subtleBackgroundColor: string,
) {
  const indentWidth = depth * 16;

  return (
    <View
      key={`skeleton-${index}-${depth}`}
      style={[styles.commentSkeleton, { marginLeft: indentWidth }]}
    >
      <View style={styles.skeletonHeader}>
        <View
          style={[
            styles.skeletonAvatar,
            {
              width: 32,
              height: 32,
              backgroundColor: subtleBackgroundColor,
            },
          ]}
        />
        <View style={styles.skeletonHeaderText}>
          <View
            style={[
              styles.skeletonLine,
              {
                width: 100,
                height: 10,
                backgroundColor: subtleBackgroundColor,
              },
            ]}
          />
        </View>
      </View>
      <View style={styles.skeletonBody}>
        <View
          style={[
            styles.skeletonLine,
            {
              width: "100%",
              height: 12,
              backgroundColor: subtleBackgroundColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: "85%",
              height: 12,
              backgroundColor: subtleBackgroundColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: "60%",
              height: 12,
              backgroundColor: subtleBackgroundColor,
            },
          ]}
        />
      </View>
      <View style={styles.skeletonActions}>
        <View
          style={[
            styles.skeletonLine,
            {
              width: 24,
              height: 10,
              backgroundColor: subtleBackgroundColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: 24,
              height: 10,
              backgroundColor: subtleBackgroundColor,
            },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            {
              width: 24,
              height: 10,
              backgroundColor: subtleBackgroundColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  commentSkeleton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  skeletonHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  skeletonAvatar: {
    borderRadius: 20,
  },
  skeletonHeaderText: {
    marginLeft: theme.spacing.sm,
    gap: 4,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },
  skeletonBody: {
    marginTop: 8,
    gap: 6,
  },
  skeletonActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
}));
