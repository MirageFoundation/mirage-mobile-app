import { Ionicons } from "@expo/vector-icons";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { Dimensions, Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { CommentThread, type Comment } from "@/src/components/molecules";
import { Text } from "@/src/components/ui/primitives";

import {
  createMediaPostDetailFooterContract,
  createMediaPostDetailMeasurementFooterContract,
  type MediaPostDetailListController,
} from "./media-post-detail-contracts";
import { MediaPostDetailFooter } from "./media-post-detail-footer";
import { styles } from "./media-post-detail-styles";

const SCREEN_H = Dimensions.get("window").height;
const SCREEN_W = Dimensions.get("window").width;

type MediaPostDetailCommentsListProps = {
  controller: MediaPostDetailListController;
};

export function MediaPostDetailCommentsList({
  controller: {
    threadState,
    postState,
    postActions,
    commentActions,
    videoControls,
    listLayout,
  },
}: MediaPostDetailCommentsListProps) {
  const {
    comments,
    currentUserId,
    followedUsers,
    focusedCommentId,
    focusedMode,
    focusedCommentNotFound,
    isLoadingComments,
    isLoadingFocusedComment,
    isLoadingFocusedContextThread,
    recentContextDisabled,
    recentContextDone,
    hasFullThreadBeyondFocus,
    highlightedCommentId,
  } = threadState;
  const {
    commentsListRef,
    collapseDistance,
    inputDockTotalH,
    isCollapsed,
    listTopY,
    measuredPostSummaryH,
    postSummaryHeightChange,
    scrollOffset,
    shouldOpenInitially,
  } = listLayout;
  const footerContract = createMediaPostDetailFooterContract(
    postState,
    postActions,
    videoControls,
    { isExpanded: isCollapsed, hideVideoControls: isCollapsed },
  );
  const { theme } = useUnistyles();
  const contextActionAvailable = !recentContextDisabled;
  const fullThreadActionAvailable = hasFullThreadBeyondFocus;
  const shouldShowThreadReminder = !!(
    focusedCommentId &&
    focusedMode !== "full" &&
    (contextActionAvailable || fullThreadActionAvailable)
  );

  return (
    <AnimatedLegendList
      ref={commentsListRef}
      style={[styles.commentsList, { top: listTopY, bottom: 0 }]}
      data={comments}
      keyExtractor={(comment: Comment) => comment.id}
      estimatedItemSize={120}
      estimatedHeaderSize={collapseDistance + 220}
      estimatedListSize={{ height: Math.max(1, SCREEN_H - listTopY), width: SCREEN_W }}
      initialScrollOffset={shouldOpenInitially ? collapseDistance : 0}
      maintainVisibleContentPosition={{ data: true, size: true }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      sharedValues={{ scrollOffset }}
      onScroll={(event) => {
        commentActions.scrollYChange(event.nativeEvent.contentOffset.y);
      }}
      onContentSizeChange={(_width, height) => {
        console.log("[CommentReveal] contentSizeChange", {
          height,
          commentCount: comments.length,
        });
        commentActions.contentSizeChange(height);
      }}
      contentContainerStyle={{
        paddingBottom: inputDockTotalH + 24,
      }}
      ListHeaderComponent={
        <View>
          {collapseDistance > 0 ? (
            <View style={{ height: collapseDistance }} />
          ) : null}
          <View style={styles.sheetHeader}>
            <View
              onLayout={(event) => {
                const height = Math.ceil(event.nativeEvent.layout.height);
                if (isCollapsed) return;
                if (height > 0 && height !== measuredPostSummaryH) {
                  postSummaryHeightChange(height);
                }
              }}
            >
              <View style={{ paddingVertical: 10, alignItems: "center" }}>
                <View style={styles.handleBar} />
              </View>
              <MediaPostDetailFooter {...footerContract} />
            </View>

            {measuredPostSummaryH === 0 ? (
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  opacity: 0,
                  paddingHorizontal: theme.spacing.md,
                }}
                onLayout={(event) => {
                  const height = Math.ceil(event.nativeEvent.layout.height);
                  if (height > 0 && height !== measuredPostSummaryH) {
                    postSummaryHeightChange(height);
                  }
                }}
              >
                <MediaPostDetailFooter
                  {...createMediaPostDetailMeasurementFooterContract(footerContract)}
                />
              </View>
            ) : null}

            {shouldShowThreadReminder ? (
              <View style={styles.threadReminderCard}>
                <View style={styles.threadReminderHeaderRow}>
                  <Ionicons
                    name="chatbubbles-outline"
                    size={14}
                    color={theme.colors.text.subtle}
                  />
                  <Text
                    size="xs"
                    mode="subtle"
                    weight="medium"
                    style={styles.threadReminderTitle}
                  >
                    You&apos;re viewing a limited set of comments
                  </Text>
                </View>
                <View style={styles.threadReminderActionsRow}>
                  <View style={styles.threadReminderButtonSlot}>
                    <Pressable
                      onPress={() => {
                        commentActions.setFocusedMode("context");
                        setTimeout(() => commentActions.refetchFocusedContext(), 0);
                      }}
                      style={({ pressed }) => [
                        styles.threadReminderButton,
                        pressed && styles.threadReminderButtonPressed,
                        !contextActionAvailable && styles.threadReminderButtonDisabled,
                      ]}
                      disabled={!contextActionAvailable}
                    >
                      <Ionicons
                        name={recentContextDone ? "checkmark-outline" : "arrow-up-outline"}
                        size={14}
                        color={
                          !contextActionAvailable
                            ? theme.colors.text.subtle
                            : theme.colors.text.default
                        }
                      />
                      <Text
                        size="xs"
                        weight="semibold"
                        mode={!contextActionAvailable ? "subtle" : undefined}
                      >
                        Recent context
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.threadReminderButtonSlot}>
                    <Pressable
                      onPress={() => commentActions.setFocusedMode("full")}
                      style={({ pressed }) => [
                        styles.threadReminderButton,
                        pressed && styles.threadReminderButtonPressed,
                        !fullThreadActionAvailable && styles.threadReminderButtonDisabled,
                      ]}
                      disabled={!fullThreadActionAvailable}
                    >
                      <Ionicons
                        name="list-outline"
                        size={14}
                        color={
                          fullThreadActionAvailable
                            ? theme.colors.text.default
                            : theme.colors.text.subtle
                        }
                      />
                      <Text
                        size="xs"
                        weight="semibold"
                        mode={fullThreadActionAvailable ? undefined : "subtle"}
                      >
                        Full thread
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            {focusedCommentNotFound ? (
              <View style={styles.deletedCommentNotice}>
                <Ionicons
                  name="trash-bin-outline"
                  size={15}
                  color={theme.colors.error[500]}
                />
                <Text size="xs" weight="medium" style={styles.deletedCommentNoticeText}>
                  Comment not found. It may have been deleted by its author.
                </Text>
              </View>
            ) : null}

            <View
              style={[
                styles.dividerThick,
                { backgroundColor: theme.colors.background.subtle },
              ]}
            />
          </View>
        </View>
      }
      renderItem={({ item }: { item: Comment }) => (
        <CommentThread
          comment={item}
          highlightedCommentId={highlightedCommentId}
          currentUserId={currentUserId}
          followedUsers={followedUsers}
          onAuthorPress={postActions.authorIdPress}
          onLikePress={commentActions.upvote}
          onDislikePress={commentActions.downvote}
          onFollowPress={commentActions.followAuthor}
          onReplyPress={commentActions.replyPress}
          onMorePress={commentActions.morePress}
          onHighlightedLayout={commentActions.highlightedLayout}
        />
      )}
      ListEmptyComponent={
        focusedCommentNotFound ? null : isLoadingComments || isLoadingFocusedComment || isLoadingFocusedContextThread ? (
          <View style={styles.contextSkeletonList}>
            {[0, 1, 2, 3].map((item) => (
              <View
                key={`focused-context-skeleton-${item}`}
                style={[
                  styles.contextSkeletonRow,
                  item > 0 && { marginLeft: item === 3 ? 48 : 24 },
                ]}
              >
                <View style={styles.contextSkeletonHeader}>
                  <View style={styles.contextSkeletonAvatar} />
                  <View style={styles.contextSkeletonName} />
                </View>
                <View style={styles.contextSkeletonLineFull} />
                <View style={styles.contextSkeletonLineShort} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons
              name="chatbubbles-outline"
              size={36}
              color={theme.colors.text.subtle}
            />
            <Text
              size="md"
              weight="semibold"
              mode="subtle"
              style={{ marginTop: 8 }}
            >
              No comments yet
            </Text>
            <Text
              size="sm"
              mode="subtle"
              style={{ marginTop: 2, textAlign: "center" }}
            >
              Be the first to share your thoughts!
            </Text>
          </View>
        )
      }
    />
  );
}
