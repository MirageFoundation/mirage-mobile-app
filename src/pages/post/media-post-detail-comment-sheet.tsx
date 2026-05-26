import { Ionicons } from "@expo/vector-icons";
import type { RefObject } from "react";
import { useState } from "react";
import {
  LayoutChangeEvent,
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
  type SharedValue,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { CommentThread, type Comment, type Post } from "@/src/components/molecules";
import { Text } from "@/src/components/ui/primitives";

import { MediaPostDetailFooter } from "./media-post-detail-footer";
import { styles } from "./media-post-detail-styles";

type FocusedMode = "single" | "context" | "full";

const noop = () => {};
const noopSeek = (_ms: number) => {};

type MediaPostDetailCommentSheetProps = {
  sheetRef: RefObject<BottomSheet | null>;
  commentsListRef: RefObject<any>;
  displayComments: Comment[];
  post: Post;
  currentUserId: string | null;
  followedUsers: string[];
  followedTopics: string[];
  inputDockTotalH: number;
  shouldOpenSheetInitially: boolean;
  snapPoints: (number | string)[];
  animatedIndex: SharedValue<number>;
  animatedPosition: SharedValue<number>;
  animationConfigs: any;
  measuredPostSummaryH: number;
  onPostSummaryHeightChange: (height: number) => void;
  onClose: () => void;
  focusedCommentId: string | null;
  focusedMode: FocusedMode;
  isLoadingComments: boolean;
  isLoadingFocusedComment: boolean;
  isLoadingFocusedContextThread: boolean;
  recentContextDisabled: boolean;
  recentContextDone: boolean;
  hasFullThreadBeyondFocus: boolean;
  highlightedCommentId: string | null;
  onScrollYChange: (y: number) => void;
  onScrollToIndex: (index: number) => void;
  onAuthorPress: () => void;
  onAuthorIdPress: (authorId: string) => void;
  onFollowAuthor: () => void;
  onFollowTopic: () => void;
  onUpvote: () => void;
  onDownvote: () => void;
  onComment: () => void;
  onShare: () => void;
  onBlockUser: () => void;
  onBlockPost: () => void;
  onBlockTopic: () => void;
  onReportPost: () => void;
  onExpandSheet: () => void;
  isOwnPost: boolean;
  shareUrl: string;
  isVideo: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  onPlayPause: () => void;
  onSeek: (ms: number) => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  onSetFocusedMode: (mode: FocusedMode) => void;
  onRefetchFocusedContext: () => void;
  onCommentUpvote: (
    id: string,
    hasLiked: boolean,
    hasDisliked: boolean,
    likes: number,
  ) => void;
  onCommentDownvote: (
    id: string,
    hasLiked: boolean,
    hasDisliked: boolean,
    likes: number,
  ) => void;
  onReplyPress: (comment: Comment) => void;
  onMorePress: (comment: Comment) => void;
  onHighlightedLayout: (event: LayoutChangeEvent) => void;
};

export function MediaPostDetailCommentSheet({
  sheetRef,
  commentsListRef,
  displayComments,
  post,
  currentUserId,
  followedUsers,
  followedTopics,
  inputDockTotalH,
  shouldOpenSheetInitially,
  snapPoints,
  animatedIndex,
  animatedPosition,
  animationConfigs,
  measuredPostSummaryH,
  onPostSummaryHeightChange,
  onClose,
  focusedCommentId,
  focusedMode,
  isLoadingComments,
  isLoadingFocusedComment,
  isLoadingFocusedContextThread,
  recentContextDisabled,
  recentContextDone,
  hasFullThreadBeyondFocus,
  highlightedCommentId,
  onScrollYChange,
  onScrollToIndex,
  onAuthorPress,
  onAuthorIdPress,
  onFollowAuthor,
  onFollowTopic,
  onUpvote,
  onDownvote,
  onComment,
  onShare,
  onBlockUser,
  onBlockPost,
  onBlockTopic,
  onReportPost,
  onExpandSheet,
  isOwnPost,
  shareUrl,
  isVideo,
  isPlaying,
  positionMs,
  durationMs,
  onPlayPause,
  onSeek,
  isMuted,
  onMuteToggle,
  onSetFocusedMode,
  onRefetchFocusedContext,
  onCommentUpvote,
  onCommentDownvote,
  onReplyPress,
  onMorePress,
  onHighlightedLayout,
}: MediaPostDetailCommentSheetProps) {
  const { theme } = useUnistyles();
  const [isSheetExpanded, setIsSheetExpanded] = useState(
    shouldOpenSheetInitially,
  );
  // Tracks "is the sheet expanding/expanded" for fast-hiding elements (like
  // the video controls row) that should disappear as soon as expansion
  // begins, instead of waiting for the sheet to settle.
  const [isExpandingOrExpanded, setIsExpandingOrExpanded] = useState(
    shouldOpenSheetInitially,
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
      index={shouldOpenSheetInitially ? 1 : 0}
      snapPoints={snapPoints}
      animatedIndex={animatedIndex}
      animatedPosition={animatedPosition}
      animationConfigs={animationConfigs}
      enableDynamicSizing={false}
      enablePanDownToClose={true}
      enableOverDrag={true}
      enableHandlePanningGesture
      enableContentPanningGesture
      onClose={onClose}
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
        data={displayComments}
        keyExtractor={(c: Comment) => c.id}
        showsVerticalScrollIndicator={false}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          onScrollYChange(event.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        onScrollToIndexFailed={({ index }: { index: number }) => {
          setTimeout(() => {
            onScrollToIndex(index);
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
                  onPostSummaryHeightChange(height);
                }
              }}
            >
              <MediaPostDetailFooter
                post={post}
                isExpanded={isSheetExpanded}
                hideVideoControls={isExpandingOrExpanded}
                onAuthorPress={onAuthorPress}
                onUpvote={onUpvote}
                onDownvote={onDownvote}
                onComment={onComment}
                onShare={onShare}
                onBlockUser={onBlockUser}
                onBlockPost={onBlockPost}
                onBlockTopic={onBlockTopic}
                onReport={onReportPost}
                isOwnPost={isOwnPost}
                shareUrl={shareUrl}
                isVideo={isVideo}
                isPlaying={isPlaying}
                positionMs={positionMs}
                durationMs={durationMs}
                onPlayPause={onPlayPause}
                onSeek={onSeek}
                onMoreLink={onExpandSheet}
                isMuted={isMuted}
                onMuteToggle={onMuteToggle}
                isFollowing={post.isFollowing ?? followedUsers.includes(post.author.id)}
                isTopicFollowed={post.topic ? followedTopics.includes(post.topic) : false}
                topic={post.topic}
                isOwnAuthor={currentUserId === post.author.id}
                onFollowAuthor={onFollowAuthor}
                onFollowTopic={onFollowTopic}
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
                    onPostSummaryHeightChange(height);
                  }
                }}
              >
                <MediaPostDetailFooter
                  post={post}
                  isExpanded={false}
                  onAuthorPress={noop}
                  onUpvote={noop}
                  onDownvote={noop}
                  onComment={noop}
                  onShare={noop}
                  onBlockUser={noop}
                  onBlockPost={noop}
                  onBlockTopic={noop}
                  onReport={noop}
                  isOwnPost={isOwnPost}
                  shareUrl={shareUrl}
                  isVideo={isVideo}
                  isPlaying={false}
                  positionMs={0}
                  durationMs={durationMs}
                  onPlayPause={noop}
                  onSeek={noopSeek}
                  onMoreLink={noop}
                  isMuted={isMuted}
                  onMuteToggle={noop}
                  isFollowing={post.isFollowing ?? followedUsers.includes(post.author.id)}
                  isTopicFollowed={post.topic ? followedTopics.includes(post.topic) : false}
                  topic={post.topic}
                  isOwnAuthor={currentUserId === post.author.id}
                  onFollowAuthor={noop}
                  onFollowTopic={noop}
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
                        onSetFocusedMode("context");
                        setTimeout(() => onRefetchFocusedContext(), 0);
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
                      onPress={() => onSetFocusedMode("full")}
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
            onAuthorPress={onAuthorIdPress}
            onLikePress={onCommentUpvote}
            onDislikePress={onCommentDownvote}
            onReplyPress={onReplyPress}
            onMorePress={onMorePress}
            onHighlightedLayout={onHighlightedLayout}
          />
        )}
        ListEmptyComponent={
          isLoadingComments || isLoadingFocusedComment || isLoadingFocusedContextThread ? (
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
