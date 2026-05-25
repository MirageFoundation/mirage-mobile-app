import { useCallback, useState, type RefObject } from "react";
import { ActivityIndicator, LayoutChangeEvent, Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";

import { MediaPostDetailSkeleton, PostCard, type Post } from "@/src/components/molecules";
import { Text } from "@/src/components/ui/primitives";
import { useFollowHandler, useVoteHandler, type VoteResult } from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import { getShareBaseUrl } from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePostDetailActionStateStore } from "@/src/stores/post-detail-action-state-store";
import type { PostDetailActionSheetsRef } from "./post-detail-action-sheets";
import { styles } from "./post-detail-styles";

type PostDetailPostSectionProps = {
  actionSheetsRef: RefObject<PostDetailActionSheetsRef | null>;
  actualRootPostId?: string | null;
  contentInitiallyRevealed: boolean;
  currentUserId?: string;
  focusedCommentId?: string | null;
  followedTopics: string[];
  hasFocusedRecentContext: boolean;
  hasFullThreadBeyondFocus: boolean;
  id: string;
  isVideoVisible: boolean;
  loadFocusedContext: (depth: number) => Promise<void>;
  onLayout: (event: LayoutChangeEvent) => void;
  onShowFullThread: () => void;
  post: Post | null;
  postEnteringStyle: any;
  recentContextDone: boolean;
  screenActive: boolean;
  setThreadActionLoading: (value: "context" | "full" | null) => void;
  shareServer: string;
  threadActionLoading: "context" | "full" | null;
  videoSyncScope?: string;
};

export function PostDetailPostSection({
  actionSheetsRef,
  actualRootPostId,
  contentInitiallyRevealed,
  currentUserId,
  focusedCommentId,
  followedTopics,
  hasFocusedRecentContext,
  hasFullThreadBeyondFocus,
  id,
  isVideoVisible,
  loadFocusedContext,
  onLayout,
  onShowFullThread,
  post,
  postEnteringStyle,
  recentContextDone,
  screenActive,
  setThreadActionLoading,
  shareServer,
  threadActionLoading,
  videoSyncScope,
}: PostDetailPostSectionProps) {
  const { theme } = useUnistyles();
  const router = useRouter();
  const [revealedContent, setRevealedContent] = useState(contentInitiallyRevealed);
  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);
  const postFollowOverride = usePostDetailActionStateStore((state) =>
    post?.id ? state.postFollowOverrides[post.id] : undefined,
  );
  const topicFollowOverride = usePostDetailActionStateStore((state) =>
    post?.id ? state.topicFollowOverrides[post.id] : undefined,
  );
  const setPostFollowOverride = usePostDetailActionStateStore(
    (state) => state.setPostFollowOverride,
  );
  const clearPostFollowOverride = usePostDetailActionStateStore(
    (state) => state.clearPostFollowOverride,
  );
  const setTopicFollowOverride = usePostDetailActionStateStore(
    (state) => state.setTopicFollowOverride,
  );
  const clearTopicFollowOverride = usePostDetailActionStateStore(
    (state) => state.clearTopicFollowOverride,
  );
  const contextActionAvailable = hasFocusedRecentContext && !recentContextDone;
  const fullThreadActionAvailable = hasFullThreadBeyondFocus;
  const shouldShowThreadReminder = !!(
    focusedCommentId &&
    actualRootPostId &&
    (contextActionAvailable || fullThreadActionAvailable)
  );

  const postVoteHandler = useVoteHandler({
    onOptimisticUpdate: useCallback(
      (targetId: string, result: VoteResult) => {
        setVoteOverride(targetId, {
          hasLiked: result.hasLiked,
          hasDisliked: result.hasDisliked,
          likes: result.newLikes,
        });
      },
      [setVoteOverride],
    ),
    onRollback: useCallback(
      (targetId: string) => {
        clearVoteOverride(targetId);
      },
      [clearVoteOverride],
    ),
  });

  const {
    handleFollowUser: handleFollowUserViaQueue,
    handleFollowTopic: handleFollowTopicViaQueue,
  } = useFollowHandler({
    onOptimisticFollowUser: (_userId, isFollowing) => {
      if (post?.id) setPostFollowOverride(post.id, isFollowing);
    },
    onRollbackFollowUser: () => {
      if (post?.id) clearPostFollowOverride(post.id);
    },
    onOptimisticFollowTopic: (_topic, isFollowing) => {
      if (post?.id) setTopicFollowOverride(post.id, isFollowing);
    },
    onRollbackFollowTopic: () => {
      if (post?.id) clearTopicFollowOverride(post.id);
    },
  });

  const handleRevealContent = useCallback(() => {
    setRevealedContent(true);
  }, []);

  const handleAuthorPress = useCallback(() => {
    if (!post) return;
    router.push(`/user/${post.author.id}`);
  }, [post, router]);

  const handleTopicPress = useCallback(() => {
    if (!post?.topic) return;
    router.push(`/topic/${encodeURIComponent(post.topic)}`);
  }, [post?.topic, router]);

  const handleLikePost = useCallback(() => {
    if (!post) return;
    postVoteHandler.handleUpvote(
      post.id,
      post.hasLiked ?? false,
      post.hasDisliked ?? false,
      post.likes,
    );
  }, [post, postVoteHandler]);

  const handleDislikePost = useCallback(() => {
    if (!post) return;
    postVoteHandler.handleDownvote(
      post.id,
      post.hasLiked ?? false,
      post.hasDisliked ?? false,
      post.likes,
    );
  }, [post, postVoteHandler]);

  const handleFollowPost = useCallback(() => {
    if (!post) return;
    handleFollowUserViaQueue(
      post.author.id,
      post.author.username,
      postFollowOverride ?? post.isFollowing ?? false,
    );
  }, [handleFollowUserViaQueue, post, postFollowOverride]);

  const handleFollowTopic = useCallback(() => {
    if (!post?.topic) return;
    handleFollowTopicViaQueue(
      post.topic,
      topicFollowOverride ?? followedTopics.includes(post.topic),
    );
  }, [followedTopics, handleFollowTopicViaQueue, post?.topic, topicFollowOverride]);

  if (!post) {
    return (
      <View onLayout={onLayout}>
        <MediaPostDetailSkeleton embedded showHeader={false} />
      </View>
    );
  }

  return (
    <Animated.View style={postEnteringStyle} onLayout={onLayout}>
      <PostCard
        post={post}
        isOwnPost={currentUserId === post.author.id}
        isVisible={isVideoVisible}
        isTopicFollowed={
          topicFollowOverride ??
          (post.topic ? followedTopics.includes(post.topic) : false)
        }
        screenActive={screenActive}
        onAuthorPress={handleAuthorPress}
        onTopicPress={handleTopicPress}
        onLikePress={handleLikePost}
        onDislikePress={handleDislikePost}
        onFollowUser={handleFollowPost}
        onFollowTopic={handleFollowTopic}
        onMorePress={() => actionSheetsRef.current?.presentPostOptions()}
        onBlockUser={() => actionSheetsRef.current?.requestBlockPostAuthor()}
        onBlockPost={() => actionSheetsRef.current?.requestBlockPost()}
        onReport={() => actionSheetsRef.current?.requestReportPost()}
        onRevealContent={handleRevealContent}
        contentRevealed={revealedContent}
        shareUrl={`${getShareBaseUrl(shareServer)}/p/${id}`}
        showUrlCard={false}
        hideCommentAction
        showMoreButton
        isPostDetail
        videoSyncScope={videoSyncScope}
      />
      <View style={styles.divider} />
      {shouldShowThreadReminder ? (
        <View style={styles.threadReminder}>
          <View style={styles.threadReminderHeader}>
            <Ionicons
              name="chatbubbles-outline"
              size={14}
              color={theme.colors.text.subtle}
            />
            <Text size="xs" mode="subtle" weight="medium" style={styles.threadReminderTitle}>
              You&apos;re viewing a limited set of comments
            </Text>
          </View>
          <View style={styles.threadReminderActions}>
            <View style={styles.threadReminderButtonSlot}>
              <Pressable
                onPress={() => {
                  const contextDisabled =
                    !contextActionAvailable || threadActionLoading !== null;
                  if (contextDisabled) return;
                  setThreadActionLoading("context");
                  void loadFocusedContext(10).finally(() => setThreadActionLoading(null));
                }}
                disabled={!contextActionAvailable || threadActionLoading !== null}
                style={({ pressed }) => [
                  styles.threadReminderButton,
                  pressed && styles.threadReminderButtonPressed,
                  threadActionLoading === "context" && styles.threadReminderButtonActive,
                  (!contextActionAvailable || threadActionLoading !== null) &&
                    styles.threadReminderButtonDisabled,
                ]}
              >
                {threadActionLoading === "context" ? (
                  <ActivityIndicator size="small" color={theme.colors.text.default} />
                ) : (
                  <Ionicons
                    name={recentContextDone ? "checkmark-outline" : "arrow-up-outline"}
                    size={14}
                    color={
                      !contextActionAvailable || threadActionLoading !== null
                        ? theme.colors.text.subtle
                        : theme.colors.text.default
                    }
                  />
                )}
                <Text
                  size="xs"
                  weight="semibold"
                  mode={!contextActionAvailable || threadActionLoading !== null ? "subtle" : undefined}
                >
                  Recent context
                </Text>
              </Pressable>
            </View>
            <View style={styles.threadReminderButtonSlot}>
              <Pressable
                onPress={() => {
                  if (threadActionLoading || !fullThreadActionAvailable) return;
                  setThreadActionLoading("full");
                  onShowFullThread();
                  setTimeout(() => setThreadActionLoading(null), 150);
                }}
                disabled={threadActionLoading !== null || !fullThreadActionAvailable}
                style={({ pressed }) => [
                  styles.threadReminderButton,
                  pressed && styles.threadReminderButtonPressed,
                  threadActionLoading === "full" && styles.threadReminderButtonActive,
                  !fullThreadActionAvailable && styles.threadReminderButtonDisabled,
                ]}
              >
                {threadActionLoading === "full" ? (
                  <ActivityIndicator size="small" color={theme.colors.text.default} />
                ) : (
                  <Ionicons
                    name="list-outline"
                    size={14}
                    color={
                      fullThreadActionAvailable
                        ? theme.colors.text.default
                        : theme.colors.text.subtle
                    }
                  />
                )}
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
    </Animated.View>
  );
}
