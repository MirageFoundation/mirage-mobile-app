import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { CommentThread, type Comment } from "@/src/components/molecules";
import { Text } from "@/src/components/ui/primitives";

import {
  createMediaPostDetailFooterContract,
  createMediaPostDetailMeasurementFooterContract,
  type MediaPostDetailSheetController,
} from "./media-post-detail-contracts";
import { MediaPostDetailFooter } from "./media-post-detail-footer";
import { styles } from "./media-post-detail-styles";

type MediaPostDetailCommentSheetProps = {
  controller: MediaPostDetailSheetController;
};

export function MediaPostDetailCommentSheet({
  controller: {
    threadState,
    postState,
    postActions,
    commentActions,
    videoControls,
    sheetLayout,
  },
}: MediaPostDetailCommentSheetProps) {
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
    sheetRef,
    commentsListRef,
    inputDockTotalH,
    shouldOpenInitially,
    snapPoints,
    animatedIndex,
    animatedPosition,
    animationConfigs,
    measuredPostSummaryH,
    postSummaryHeightChange,
    close,
  } = sheetLayout;
  const footerContract = createMediaPostDetailFooterContract(
    postState,
    postActions,
    videoControls,
    { isExpanded: false, hideVideoControls: false },
  );
  const { theme } = useUnistyles();
  const [isSheetExpanded, setIsSheetExpanded] = useState(
    shouldOpenInitially,
  );
  // Tracks "is the sheet expanding/expanded" for fast-hiding elements (like
  // the video controls row) that should disappear as soon as expansion
  // begins, instead of waiting for the sheet to settle.
  const [isExpandingOrExpanded, setIsExpandingOrExpanded] = useState(
    shouldOpenInitially,
  );
  const contextActionAvailable = !recentContextDisabled;
  const fullThreadActionAvailable = hasFullThreadBeyondFocus;
  const shouldShowThreadReminder = !!(
    focusedCommentId &&
    focusedMode !== "full" &&
    (contextActionAvailable || fullThreadActionAvailable)
  );

  const handleAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      animatedIndex.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      borderTopWidth: opacity > 0.01 ? 2 : 0,
    };
  });

  const renderHandle = () => (
    <Animated.View
      style={[
        {
          backgroundColor: theme.colors.background.default,
          paddingVertical: 10,
          borderTopColor: theme.colors.border.subtle,
          alignItems: "center",
          justifyContent: "center",
        },
        handleAnimatedStyle,
      ]}
    >
      <View
        style={{
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: theme.colors.text.subtle,
        }}
      />
    </Animated.View>
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={shouldOpenInitially ? 1 : 0}
      snapPoints={snapPoints}
      animatedIndex={animatedIndex}
      animatedPosition={animatedPosition}
      animationConfigs={animationConfigs}
      enableDynamicSizing={false}
      // The collapsed snap point is the floor of this sheet; the screen
      // itself owns dismissal (back button / swipe-down on the media area).
      // Allowing pan-to-close here means a fast downward fling on the sheet
      // dismisses it entirely and triggers the screen's onClose handler,
      // which in turn calls router.back() — closing the whole media post
      // detail screen. Disable pan-to-close so a hard swipe at most lands
      // on the lowest (half) snap point and never tears down the screen.
      enablePanDownToClose={false}
      enableOverDrag={false}
      enableHandlePanningGesture
      enableContentPanningGesture
      onClose={close}
      onAnimate={(_from, to) => {
        // Switch body variant (collapsed inline ↔ expanded markdown) as soon
        // as the gesture starts moving toward the target snap point, so the
        // body reveals/hides in sync with the sheet instead of popping in
        // after it settles.
        setIsSheetExpanded(to >= 1);
        // Hide/show fast-collapsing elements as soon as the gesture starts
        // moving toward the target snap point.
        setIsExpandingOrExpanded(to >= 1);
      }}
      onChange={(index) => {
        // Safety net in case onAnimate didn't fire (e.g. programmatic snap)
        // — keep the body variant in sync with the final settled index.
        if (index >= 1) setIsSheetExpanded(true);
        else setIsSheetExpanded(false);
        setIsExpandingOrExpanded(index >= 1);
      }}
      style={{ zIndex: 30, elevation: 30 }}
      handleComponent={renderHandle}
      backgroundStyle={{
        backgroundColor: theme.colors.background.default,
        borderRadius: 0,
      }}
    >
      <BottomSheetFlatList
        ref={commentsListRef}
        data={comments}
        keyExtractor={(c: Comment) => c.id}
        showsVerticalScrollIndicator={false}
        // bottom-sheet's prop types omit onScroll (it owns the scroll
        // handler), but the runtime merges a user handler into it via
        // useScrollHandler, so this keeps working.
        {...({
          onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            commentActions.scrollYChange(event.nativeEvent.contentOffset.y);
          },
        } as object)}
        onScrollToIndexFailed={({ index }: { index: number }) => {
          setTimeout(() => {
            commentActions.scrollToIndex(index);
          }, 300);
        }}
        contentContainerStyle={{
          paddingBottom: inputDockTotalH + 24,
        }}
        ListHeaderComponent={
          <View style={styles.sheetHeader}>
            <View
              onLayout={(event) => {
                const height = Math.ceil(event.nativeEvent.layout.height);
                // Skip measurement updates while expanded so the collapsed
                // snap point stays stable and the sheet does not jump as the
                // body content grows/shrinks during the transition.
                if (isSheetExpanded) return;
                if (height > 0 && height !== measuredPostSummaryH) {
                  postSummaryHeightChange(height);
                }
              }}
            >
              <MediaPostDetailFooter
                {...footerContract}
                presentation={{
                  isExpanded: isSheetExpanded,
                  hideVideoControls: isExpandingOrExpanded,
                }}
              />
            </View>

            {/*
             * Hidden measurement copy of the footer rendered in its
             * collapsed-body variant.
             *
             * Why: the collapsed snap point's height is driven by the
             * collapsed-variant footer height (single-line body). When the
             * screen opens directly into the expanded state (from inbox /
             * profile / deep link), the visible footer renders the expanded
             * markdown body and the visible onLayout updates are
             * intentionally suppressed (to keep the snap point stable during
             * the transition). Without this side measurement, the snap
             * point falls back to INITIAL_SHEET_MIN_HEIGHT (132) and clips
             * the vote row + video controls once the user collapses the
             * sheet.
             *
             * Only rendered until we have a measurement to avoid
             * double-rendering the video seekbar on every frame.
             */}
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
    </BottomSheet>
  );
}
