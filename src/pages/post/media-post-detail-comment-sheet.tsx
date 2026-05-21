import { Ionicons } from "@expo/vector-icons";
import type { RefObject } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import type { SharedValue } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { CommentThread, type Comment, type Post } from "@/src/components/molecules";
import { Text } from "@/src/components/ui/primitives";

import { MediaPostDetailFooter } from "./media-post-detail-footer";
import { styles } from "./media-post-detail-styles";

type FocusedMode = "single" | "context" | "full";

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
      style={{ zIndex: 30, elevation: 30 }}
      handleIndicatorStyle={{
        backgroundColor: theme.colors.text.subtle,
        width: 36,
        height: 4,
      }}
      handleStyle={{
        backgroundColor: theme.colors.background.default,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        paddingVertical: 10,
        borderTopWidth: 2,
        borderTopColor: theme.colors.border.subtle,
      }}
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
                if (height > 0 && height !== measuredPostSummaryH) {
                  onPostSummaryHeightChange(height);
                }
              }}
            >
              <MediaPostDetailFooter
                post={post}
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

            {focusedCommentId && focusedMode !== "full" ? (
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
                    You&apos;re viewing single comment&apos;s thread
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
                        recentContextDisabled && styles.threadReminderButtonDisabled,
                      ]}
                      disabled={recentContextDisabled}
                    >
                      <Ionicons
                        name={recentContextDone ? "checkmark-outline" : "arrow-up-outline"}
                        size={14}
                        color={
                          recentContextDisabled
                            ? theme.colors.text.subtle
                            : theme.colors.text.default
                        }
                      />
                      <Text
                        size="xs"
                        weight="semibold"
                        mode={recentContextDisabled ? "subtle" : undefined}
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
                        !hasFullThreadBeyondFocus && styles.threadReminderButtonDisabled,
                      ]}
                      disabled={!hasFullThreadBeyondFocus}
                    >
                      <Ionicons
                        name="list-outline"
                        size={14}
                        color={
                          hasFullThreadBeyondFocus
                            ? theme.colors.text.default
                            : theme.colors.text.subtle
                        }
                      />
                      <Text
                        size="xs"
                        weight="semibold"
                        mode={hasFullThreadBeyondFocus ? undefined : "subtle"}
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

            <Text size="md" weight="semibold" style={styles.commentsTitle}>
              Comments ({post.comments})
            </Text>
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
