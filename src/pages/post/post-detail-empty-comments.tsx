import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";

type PostDetailEmptyCommentsProps = {
  commentsCount: number;
  isCommentsError: boolean;
  isFetchingComments: boolean;
  isLoadingComments: boolean;
  isLoadingContext: boolean;
  isLoadingFocusedComment: boolean;
  isLoadingFullThreadComments: boolean;
  onRetry: () => void;
  renderCommentSkeleton: (index: number, depth?: number) => React.ReactNode;
};

export function PostDetailEmptyComments({
  commentsCount,
  isCommentsError,
  isFetchingComments,
  isLoadingComments,
  isLoadingContext,
  isLoadingFocusedComment,
  isLoadingFullThreadComments,
  onRetry,
  renderCommentSkeleton,
}: PostDetailEmptyCommentsProps) {
  const { theme } = useUnistyles();

  if (
    isLoadingComments ||
    isLoadingContext ||
    isLoadingFocusedComment ||
    isLoadingFullThreadComments ||
    (isFetchingComments && commentsCount === 0)
  ) {
    return (
      <View>
        {renderCommentSkeleton(0)}
        {renderCommentSkeleton(1, 1)}
        {renderCommentSkeleton(2, 1)}
        {renderCommentSkeleton(3)}
        {renderCommentSkeleton(4, 1)}
        {renderCommentSkeleton(5)}
      </View>
    );
  }

  if (isCommentsError) {
    return (
      <Box flex center p="lg">
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={theme.colors.error[500]}
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
          style={{
            marginTop: 16,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: theme.colors.border.default,
            borderRadius: 8,
            backgroundColor: theme.colors.background.subtle,
          }}
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
        color={theme.colors.text.subtle}
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
