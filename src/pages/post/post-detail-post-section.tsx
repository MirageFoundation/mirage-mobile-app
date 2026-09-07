import { useCallback, useState, type RefObject } from "react";
import { LayoutChangeEvent, Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";

import { MediaPostDetailSkeleton, PostCard, type Post } from "@/src/components/molecules";
import { Text } from "@/src/components/ui/primitives";
import { isCommunityJoined } from "@/src/domain/communities";
import { getThreadReplyPolicy } from "@/src/domain/content";
import { useFollowHandler, useVoteHandler, type VoteResult } from "@/src/hooks";
import { useRouter } from "@/src/navigation/guarded-router";
import { postMediaRoute } from "@/src/navigation/post-media-route";
import {
  POST_DETAIL_HOME_ROUTE,
  resolvePostDetailExitAction,
} from "@/src/navigation/post-detail-route-policy";
import { getShareBaseUrl, usePreferencesStore } from "@/src/stores";
import { shouldAutoplayVideo, useNetworkType } from "@/src/hooks/use-network-state";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePostDetailActionStateStore } from "@/src/stores/post-detail-action-state-store";
import type { PostDetailActionSheetsRef } from "./post-detail-action-sheets";
import { styles } from "./post-detail-styles";

type PostDetailPostSectionProps = {
  actionSheetsRef: RefObject<PostDetailActionSheetsRef | null>;
  contentInitiallyRevealed: boolean;
  currentUserId?: string;
  focusedCommentId?: string | null;
  joinedCommunities: string[];
  focusedCommentNotFound?: boolean;
  hasFocusedRecentContext: boolean;
  hasFullThreadBeyondFocus: boolean;
  id: string;
  isVideoVisible: boolean;
  loadFocusedContext: (depth: number) => Promise<void>;
  onLayout: (event: LayoutChangeEvent) => void;
  onMediaLayout: (event: LayoutChangeEvent) => void;
  onShowFullThread: () => void;
  post: Post | null;
  recentContextDone: boolean;
  screenActive: boolean;
  shareServer: string;
  videoSyncScope?: string;
};

export function PostDetailPostSection({
  actionSheetsRef,
  contentInitiallyRevealed,
  currentUserId,
  focusedCommentId,
  focusedCommentNotFound = false,
  joinedCommunities,
  hasFocusedRecentContext,
  hasFullThreadBeyondFocus,
  id,
  isVideoVisible,
  loadFocusedContext,
  onLayout,
  onMediaLayout,
  onShowFullThread,
  post,
  recentContextDone,
  screenActive,
  shareServer,
  videoSyncScope,
}: PostDetailPostSectionProps) {
  const { theme } = useUnistyles();
  const router = useRouter();
  const autoPlayVideos = usePreferencesStore((state) => state.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((state) => state.videoAutoplayNetwork);
  const networkType = useNetworkType();
  const [revealedContent, setRevealedContent] = useState(contentInitiallyRevealed);
  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);
  const postFollowOverride = usePostDetailActionStateStore((state) =>
    post?.id ? state.postFollowOverrides[post.id] : undefined,
  );
  const communityJoinOverride = usePostDetailActionStateStore((state) =>
    post?.id ? state.communityJoinOverrides[post.id] : undefined,
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
    handleToggleCommunityMembership: handleToggleCommunityMembershipViaQueue,
  } = useFollowHandler({
    onOptimisticFollowUser: (_userId, isFollowing) => {
      if (post?.id) setPostFollowOverride(post.id, isFollowing);
    },
    onRollbackFollowUser: () => {
      if (post?.id) clearPostFollowOverride(post.id);
    },
    onOptimisticJoinCommunity: (_topic, isFollowing) => {
      if (post?.id) setTopicFollowOverride(post.id, isFollowing);
    },
    onRollbackJoinCommunity: () => {
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

  const handleCommunityPress = useCallback(() => {
    if (!post?.community) return;
    router.push(`/c/${encodeURIComponent(post.community)}` as never);
  }, [post?.community, router]);

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

  const handleToggleCommunityMembership = useCallback(() => {
    if (!post?.community) return;
    handleToggleCommunityMembershipViaQueue(
      post.community,
      communityJoinOverride ?? isCommunityJoined(joinedCommunities, post.community),
    );
  }, [joinedCommunities, handleToggleCommunityMembershipViaQueue, post?.community, communityJoinOverride]);

  const handleHidePost = useCallback(() => {
    if (resolvePostDetailExitAction(router.canGoBack()) === "back") {
      router.back();
      return;
    }
    router.replace(POST_DETAIL_HOME_ROUTE);
  }, [router]);

  if (!post) {
    return (
      <View onLayout={onLayout}>
        <MediaPostDetailSkeleton embedded showHeader={false} />
      </View>
    );
  }

  return (
    <View onLayout={onLayout}>
      <PostCard
        post={post}
        isOwnPost={currentUserId === post.author.id}
        isVisible={isVideoVisible}
        isCommunityJoined={
          communityJoinOverride ?? isCommunityJoined(joinedCommunities, post.community)
        }
        screenActive={screenActive}
        allowAutoplay={shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType)}
        onAuthorPress={handleAuthorPress}
        onMediaPress={(index) => router.push(postMediaRoute(post.id, index, videoSyncScope, revealedContent))}
        onCommunityPress={handleCommunityPress}
        onLikePress={handleLikePost}
        onDislikePress={handleDislikePost}
        onFollowUser={handleFollowPost}
        onToggleCommunityMembership={handleToggleCommunityMembership}
        onMorePress={() => actionSheetsRef.current?.presentPostOptions()}
        onBlockUser={() => actionSheetsRef.current?.requestBlockPostAuthor()}
        onBlockPost={() => actionSheetsRef.current?.requestBlockPost()}
        onReport={() => actionSheetsRef.current?.requestReportPost()}
        onHidePost={handleHidePost}
        onRevealContent={handleRevealContent}
        contentRevealed={revealedContent}
        shareUrl={`${getShareBaseUrl(shareServer)}/p/${id}`}
        showUrlCard={false}
        hideCommentAction={!getThreadReplyPolicy({ protocol_version: post.protocolVersion, thread_locked: post.threadLocked }).canReply}
        onCommentPress={() => usePostDetailActionStateStore.getState().requestComments(post.id)}
        onMediaLayout={onMediaLayout}
        showMoreButton
        isPostDetail
        videoSyncScope={videoSyncScope}
      />
      <View style={styles.divider} />
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
                  // Backend caps comment context at depth 5.
                  void loadFocusedContext(5);
                }}
                disabled={!contextActionAvailable}
                style={({ pressed }) => [
                  styles.threadReminderButton,
                  pressed && styles.threadReminderButtonPressed,
                  !contextActionAvailable && styles.threadReminderButtonDisabled,
                ]}
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
                onPress={onShowFullThread}
                disabled={!fullThreadActionAvailable}
                style={({ pressed }) => [
                  styles.threadReminderButton,
                  pressed && styles.threadReminderButtonPressed,
                  !fullThreadActionAvailable && styles.threadReminderButtonDisabled,
                ]}
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
    </View>
  );
}
