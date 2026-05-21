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

import { Avatar, TimeAgo } from "@/src/components/atoms";
import { CommentThread, type Comment, type Post } from "@/src/components/molecules";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { Text } from "@/src/components/ui/primitives";
import { getUsernameColor } from "@/src/utils/tiers";

import { MediaPostDetailFollowMenuButton } from "./media-post-detail-follow-menu-button";
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
  animationConfigs: any;
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
  animationConfigs,
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
  onSetFocusedMode,
  onRefetchFocusedContext,
  onCommentUpvote,
  onCommentDownvote,
  onReplyPress,
  onMorePress,
  onHighlightedLayout,
}: MediaPostDetailCommentSheetProps) {
  const { theme } = useUnistyles();
  const contextActionAvailable = !recentContextDisabled;
  const fullThreadActionAvailable = hasFullThreadBeyondFocus;
  const shouldShowThreadReminder = !!(
    focusedCommentId &&
    focusedMode !== "full" &&
    (contextActionAvailable || fullThreadActionAvailable)
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={shouldOpenSheetInitially ? 0 : -1}
      snapPoints={snapPoints}
      animatedIndex={animatedIndex}
      animationConfigs={animationConfigs}
      enableDynamicSizing={false}
      enablePanDownToClose={true}
      enableOverDrag={false}
      enableHandlePanningGesture
      enableContentPanningGesture
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
            <View style={styles.sheetPostInfo}>
              <View style={styles.authorRowFull}>
                <Pressable onPress={onAuthorPress} style={styles.authorRow}>
                  <Avatar seed={post.author.avatarSeed ?? post.author.id} size={32} />
                  <Text
                    size="md"
                    weight="semibold"
                    style={{
                      marginLeft: 8,
                      color:
                        post.author.level != null
                          ? getUsernameColor(post.author.level) ??
                            theme.colors.text.default
                          : theme.colors.text.default,
                    }}
                  >
                    @{post.author.username}
                  </Text>
                  <Text size="sm" mode="subtle" style={{ marginHorizontal: 6 }}>
                    •
                  </Text>
                  <TimeAgo
                    timestamp={post.createdAt}
                    showSuffix={false}
                    size="md"
                    mode="subtle"
                  />
                </Pressable>
                {currentUserId !== post.author.id ? (
                  <MediaPostDetailFollowMenuButton
                    username={post.author.username}
                    topic={post.topic}
                    isFollowing={
                      post.isFollowing ?? followedUsers.includes(post.author.id)
                    }
                    isTopicFollowed={
                      post.topic ? followedTopics.includes(post.topic) : false
                    }
                    onFollowUser={onFollowAuthor}
                    onFollowTopic={onFollowTopic}
                  />
                ) : null}
              </View>
              <Text size="lg" weight="bold" style={{ marginTop: 6, lineHeight: 20 }}>
                {post.title}
              </Text>
              {post.body ? (
                <View style={styles.mdNoTrailingMargin}>
                  <MarkdownContent
                    content={post.body}
                    color={theme.colors.text.default}
                  />
                </View>
              ) : null}
            </View>

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
