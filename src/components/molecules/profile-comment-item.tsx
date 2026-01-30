import { useRootPostId } from "@/src/api/read";
import type { Post } from "@/src/api/types";
import { TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

interface ProfileCommentItemProps {
  comment: Post;
  onPress: (commentId: string, rootPostId: string) => void;
}

/**
 * Comment item for profile comments list
 * Layout: time · upvote_count ↑
 *         Comment text
 */
export const ProfileCommentItem = memo(function ProfileCommentItem({
  comment,
  onPress,
}: ProfileCommentItemProps) {
  const { theme } = useUnistyles();

  // Check if we have a valid root_post_id from the comment data
  // A valid root_post_id should be a non-empty string that's different from the comment's post_id
  const hasValidRootPostId = useMemo(() => {
    return (
      comment.root_post_id &&
      comment.root_post_id.trim() !== "" &&
      comment.root_post_id !== "undefined"
    );
  }, [comment.root_post_id]);

  // Only fetch root post ID if not available in comment data
  const { data: rootPostData, isLoading: isLoadingRootPostId } = useRootPostId(
    !hasValidRootPostId ? comment.post_id : null,
  );

  // Determine the final root post ID to use
  const resolvedRootPostId = useMemo(() => {
    if (hasValidRootPostId) {
      return comment.root_post_id;
    }
    return rootPostData?.root_post_id || null;
  }, [hasValidRootPostId, comment.root_post_id, rootPostData]);

  // Check if we're still loading the root post ID
  const isLoading = !hasValidRootPostId && isLoadingRootPostId;

  const handlePress = useCallback(() => {
    // Don't navigate if we don't have a valid root post ID yet
    if (!resolvedRootPostId) {
      console.warn(
        "Cannot navigate: root post ID not yet resolved for comment",
        comment.post_id,
      );
      return;
    }
    triggerHaptic("selection");
    onPress(comment.post_id, resolvedRootPostId);
  }, [onPress, comment.post_id, resolvedRootPostId]);

  // Calculate display points (adjusting for user's own vote weight)
  const displayPoints = Math.round(
    comment.points - comment.user_weight + comment.user_vote,
  );

  const commentContent = comment.content;
  const hasUpvoted = comment.user_vote === 1;

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.container, isLoading && styles.containerLoading]}
      disabled={isLoading}
    >
      {/* Meta row: time · upvote */}
      <View style={styles.metaRow}>
        <TimeAgo
          timestamp={comment.timestamp * 1000}
          showSuffix={false}
          size="sm"
        />

        <Text size="sm" mode="subtle" style={styles.dot}>
          ·
        </Text>

        <View style={styles.upvoteContainer}>
          <Text
            size="sm"
            weight={hasUpvoted ? "semibold" : "regular"}
            style={{
              color: hasUpvoted
                ? theme.colors.success[500]
                : theme.colors.text.subtle,
            }}
          >
            {displayPoints}
          </Text>
          <Ionicons
            name={hasUpvoted ? "arrow-up" : "arrow-up-outline"}
            size={14}
            color={
              hasUpvoted ? theme.colors.success[500] : theme.colors.text.subtle
            }
          />
        </View>

        {/* Loading indicator when fetching root post ID */}
        {isLoading && (
          <View style={styles.loadingIndicator}>
            <ActivityIndicator size="small" color={theme.colors.text.subtle} />
          </View>
        )}
      </View>

    {/* Comment text */}
      <View>
       <MarkdownContent content={commentContent} />
     </View>
    </Pressable>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    backgroundColor: theme.colors.background.default,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  containerLoading: {
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  dot: {
    marginHorizontal: theme.spacing.xs,
  },
  upvoteContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  loadingIndicator: {
    marginLeft: "auto",
  },
  commentText: {
    lineHeight: 22,
  },
}));
