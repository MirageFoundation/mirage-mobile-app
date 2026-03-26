import { navigateToEditPost } from "@/src/utils/edit-post";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import * as Sentry from "@sentry/react-native";
import type { FlashListRef } from "@shopify/flash-list";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { triggerHaptic } from "@/src/components/utils/haptics";

import {
  transformApiPosts,
  useInfinitePosts,
  useUserFollowed,
} from "@/src/api";
import {
  NewPostsButton,
  type Post,
  PostCardSkeletonList,
  type PostOptionsSheetRef,
  type AwardPickerSheetRef,
  type ReportSheetRef,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import {
  useBlockHandler,
  useDeleteHandler,
  useFollowHandler,
  useHomePostCardBindings,
  useNetworkState,
  useReportHandler,
  useVoteHandler,
  shouldAutoplayVideo,
  type VoteResult,
} from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import { HomePostList } from "./home/home-post-list";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  getAllowedTagsFromContentTypes,
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useSavedPostsStore,
  useTimeTickStore,
} from "@/src/stores";
import { useNewPostsChecker } from "@/src/hooks/use-new-posts-checker";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";

import { TopicFeedHeader } from "./topic-feed/topic-feed-header";
import { TopicFeedOverlays } from "./topic-feed/topic-feed-overlays";

export function TopicFeedScreen() {
  const { id: topicName } = useLocalSearchParams<{ id: string }>();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const flatListRef = useRef<FlashListRef<Post>>(null);
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const awardPickerSheetRef = useRef<AwardPickerSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isBannerLoading, setIsBannerLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"magic" | "newest">("magic");

  const SORT_OPTIONS = useMemo(
    () => [
      { label: "Magic", value: "magic" as const },
      { label: "Latest", value: "newest" as const },
    ],
    [],
  );

  const handleSortChange = useCallback((value: "magic" | "newest") => {
    triggerHaptic("light");
    setSortBy(value);
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, []);

  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);
  const blockedTopicNames = useContentModerationStore((s) => s.blockedTopicNames);
  const hidePost = useContentModerationStore((s) => s.hidePost);
  const unhidePost = useContentModerationStore((s) => s.unhidePost);
  const blockUser = useContentModerationStore((s) => s.blockUser);
  const blockTopicOptimistic = useContentModerationStore((s) => s.blockTopic);

  const selectedContentTypes = usePreferencesStore(
    (s) => s.selectedContentTypes,
  );
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore(
    (s) => s.videoAutoplayNetwork,
  );
  const hideDownvotedPosts = usePreferencesStore((s) => s.hideDownvotedPosts);
  const currentUser = useAuthStore((s) => s.user);

  const { networkType } = useNetworkState();

  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData],
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData],
  );

  const [optimisticFollowedTopic, setOptimisticFollowedTopic] = useState<
    boolean | null
  >(null);

  const isTopicFollowed =
    optimisticFollowedTopic ?? followedTopics.includes(topicName ?? "");

  useEffect(() => {
    setOptimisticFollowedTopic(null);
  }, [followedTopics]);

  const {
    handleFollowUser: handleFollowPress,
    handleFollowTopic: handleFollowTopicFromCard,
  } = useFollowHandler({
    onOptimisticFollowTopic: (_topic, isFollowing) => {
      setOptimisticFollowedTopic(isFollowing);
    },
    onRollbackFollowTopic: () => {
      setOptimisticFollowedTopic(null);
    },
  });

  const handleHeaderFollowTopic = useCallback(() => {
    if (!topicName) return;
    handleFollowTopicFromCard(topicName, isTopicFollowed);
  }, [topicName, isTopicFollowed, handleFollowTopicFromCard]);

  const allowedTags = useMemo(
    () => getAllowedTagsFromContentTypes(selectedContentTypes),
    [selectedContentTypes],
  );

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePosts({
    limit: 10,
    topic: topicName,
    allowed_tags: allowedTags || undefined,
    by: sortBy,
  }, { pageLimit: 20 });

  const feedRefreshParamsList = useMemo(() => [{
    topic: topicName,
    by: sortBy,
    allowed_tags: allowedTags || undefined,
    limit: 10,
    address: currentUser?.walletAddress,
  }], [topicName, sortBy, allowedTags, currentUser?.walletAddress]);

  usePostDataRefresher({
    feedParamsList: feedRefreshParamsList,
  });

  const postEditOverrides = usePostEditStore((s) => s.overrides);

  const posts = useMemo(() => {
    if (!data?.pages) return [];
    const allPosts = data.pages.flatMap((page) => page.posts);

    const uniquePostsMap = new Map<string, (typeof allPosts)[0]>();
    for (const post of allPosts) {
      if (!uniquePostsMap.has(post.post_id)) {
        uniquePostsMap.set(post.post_id, post);
      }
    }
    const uniquePosts = Array.from(uniquePostsMap.values());

    const filteredPosts = hideDownvotedPosts
      ? uniquePosts.filter((post) => post.user_vote !== -1)
      : uniquePosts;

    const patchedPosts = filteredPosts.map((post) => {
      const ov = postEditOverrides[post.post_id];
      if (!ov) return post;
      return { ...post, title: ov.title, content: ov.content, topic: ov.topic ?? post.topic, media: ov.media ?? post.media };
    });

    const transformedPosts = transformApiPosts(patchedPosts, {
      currentUser: currentUser ? { id: currentUser.id, username: currentUser.username } : undefined,
    });

    return transformedPosts.filter(
      (post) =>
        !hiddenPostIds.has(post.id) &&
        !blockedUserIds.has(post.author.id) &&
        !(post.topic && blockedTopicNames.has(post.topic.toLowerCase())),
    );
  }, [data, hiddenPostIds, blockedUserIds, blockedTopicNames, hideDownvotedPosts, currentUser, postEditOverrides]);

  const latestPostTimestamp = useMemo(() => {
    const pages = data?.pages;
    if (!pages || pages.length === 0) return null;
    const firstPage = pages[0];
    if (!firstPage.posts || firstPage.posts.length === 0) return null;
    let maxTs = 0;
    for (const post of firstPage.posts) {
      if (post.timestamp > maxTs) maxTs = post.timestamp;
    }
    return maxTs > 0 ? maxTs : null;
  }, [data?.pages]);

  const { hasNewPosts, newPostAvatars, newPostCount, dismiss: dismissNewPosts, resetBaseline } = useNewPostsChecker({
    topic: topicName,
    by: sortBy === "magic" ? "magic" : "newest",
    allowed_tags: allowedTags || undefined,
    enabled: true,
    latestPostTimestamp,
  });
  const dismissNewPostsRef = useRef<(() => void) | null>(null);
  dismissNewPostsRef.current = dismissNewPosts;

  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const setVoteOverride = useHomePostCardStore(
    (state) => state.setVoteOverride,
  );
  const clearVoteOverride = useHomePostCardStore(
    (state) => state.clearVoteOverride,
  );

  const { handleUpvote, handleDownvote } = useVoteHandler({
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

  const revealedPostsRef = useRef<Set<string>>(new Set());
  const topicFeedSyncContext = `topic:${topicName ?? "unknown"}`;

  const handlePostPress = useCallback(
    (postId: string) => {
      const isRevealed = revealedPostsRef.current.has(postId);
      const params = new URLSearchParams({ syncContext: topicFeedSyncContext });
      if (isRevealed) {
        params.set("reveal", "true");
      }
      router.push(`/post/${postId}?${params.toString()}`);
    },
    [router, topicFeedSyncContext],
  );

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      router.push(`/user/${authorId}`);
    },
    [router],
  );

  const handleTopicPress = useCallback(
    (topic: string) => {
      router.push(`/topic/${encodeURIComponent(topic)}`);
    },
    [router],
  );

  const handleMorePress = useCallback((post: Post) => {
    setSelectedPost(post);
    postOptionsSheetRef.current?.present();
  }, []);

  const handleCommentPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}?syncContext=${encodeURIComponent(topicFeedSyncContext)}`);
    },
    [router, topicFeedSyncContext],
  );

  const blockHandler = useBlockHandler({});
  const reportHandler = useReportHandler({});
  const deleteHandler = useDeleteHandler({
    onRollback: (targetId, targetType) => {
      if (targetType === "post") {
        unhidePost(targetId);
      }
    },
  });

  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending) {
      if (pending.type === "user") {
        blockUser(pending.id);
      } else if (pending.type === "post") {
        hidePost(pending.id);
      } else if (pending.type === "topic") {
        blockTopicOptimistic(pending.id);
      }
    }
    blockHandler.confirmBlock();
  }, [blockHandler, blockUser, hidePost, blockTopicOptimistic]);

  const handleConfirmDelete = useCallback(() => {
    const pending = deleteHandler.pendingTarget;
    if (pending) {
      hidePost(pending.id);
    }
    deleteHandler.confirmDelete();
  }, [deleteHandler, hidePost]);

  const handleReportSubmitWithOptimistic = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending) {
        hidePost(pending.id);
      }
      reportSheetRef.current?.dismiss();
      reportHandler.submitReport(reason);
    },
    [reportHandler, hidePost],
  );

  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet]);

  const handleReport = useCallback(() => {
    if (selectedPost) {
      reportHandler.requestReport(selectedPost.id, "post");
    }
  }, [selectedPost, reportHandler]);

  const handleBlockUser = useCallback(() => {
    if (selectedPost) {
      blockHandler.requestBlockUser(
        selectedPost.author.id,
        selectedPost.author.username,
      );
    }
  }, [selectedPost, blockHandler]);

  const handleHidePost = useCallback(() => {
    if (selectedPost) {
      blockHandler.requestBlockPost(selectedPost.id);
    }
  }, [selectedPost, blockHandler]);

  const handleBlockUserFromCard = useCallback(
    (postId: string, authorId: string, authorUsername: string) => {
      blockHandler.requestBlockUser(authorId, authorUsername);
    },
    [blockHandler],
  );

  const handleBlockPostFromCard = useCallback(
    (postId: string) => {
      blockHandler.requestBlockPost(postId);
    },
    [blockHandler],
  );

  const handleBlockTopicFromCard = useCallback(
    (_postId: string, topic: string) => {
      blockHandler.requestBlockTopic(topic);
    },
    [blockHandler],
  );

  const handleReportFromCard = useCallback(
    (postId: string) => {
      reportHandler.requestReport(postId, "post");
    },
    [reportHandler],
  );

  const handleEditPost = useCallback(() => {
    if (!selectedPost) return;
    navigateToEditPost(router, selectedPost);
  }, [selectedPost, router]);

  const handleDeletePost = useCallback(() => {
    if (selectedPost) {
      deleteHandler.requestDelete(selectedPost.id, "post");
    }
  }, [selectedPost, deleteHandler]);

  const handleSavePost = useCallback(() => {
    if (!selectedPost) return;
    const saved = useSavedPostsStore.getState().toggleSavePost(selectedPost);
    toast.success(
      saved ? "Post saved" : "Post unsaved",
      saved
        ? "You can find it in your saved items."
        : "Removed from saved items.",
    );
  }, [selectedPost, toast]);

  const handleCopyText = useCallback(() => {
    toast.success("Copied", "Text copied to clipboard.");
  }, [toast]);

  const handleFollowTopic = useCallback(() => {
    if (!selectedPost?.topic) return;
    const topic = selectedPost.topic;
    const isCurrentlyFollowed = followedTopics.includes(topic);
    handleFollowTopicFromCard(topic, isCurrentlyFollowed);
  }, [selectedPost?.topic, followedTopics, handleFollowTopicFromCard]);

  const handleFollowUserFromSheet = useCallback(() => {
    if (!selectedPost) return;
    const authorId = selectedPost.author.id;
    const authorUsername = selectedPost.author.username;
    const isCurrentlyFollowing = followedUsers.includes(authorId);
    handleFollowPress(authorId, authorUsername, isCurrentlyFollowing);
  }, [selectedPost, followedUsers, handleFollowPress]);

  const handleShowFewer = useCallback(() => {
    toast.success("Got it", "We'll show fewer posts like this.");
  }, [toast]);

  const handleRevealContent = useCallback(
    (postId: string) => {
      setRevealedPosts((prev) => {
        const nextRevealedPosts = new Set(prev);
        nextRevealedPosts.add(postId);
        revealedPostsRef.current = nextRevealedPosts;
        return nextRevealedPosts;
      });
    },
    [],
  );

  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);

  const queryRef = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
  queryRef.current = { hasNextPage, isFetchingNextPage, fetchNextPage };
  const postsLengthRef = useRef(posts.length);
  postsLengthRef.current = posts.length;

  const handleRefresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      Sentry.addBreadcrumb({ category: "topic-feed", message: "Refresh failed", data: { error: String(error) }, level: "error" });
    } finally {
      setIsManualRefreshing(false);
      dismissNewPostsRef.current?.();
      useTimeTickStore.getState().bump();
    }
  }, [refetch]);

  const handleNewPostsPress = useCallback(async () => {
    setIsBannerLoading(true);
    try {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch {}

    await handleRefresh();

    requestAnimationFrame(() => {
      try {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch {}
    });
    resetBaseline(null);
    setIsBannerLoading(false);
  }, [handleRefresh, resetBaseline]);

  const handleItemVisible = useCallback((index: number) => {
    const totalLoaded = postsLengthRef.current;
    if (index < totalLoaded - 5) return;
    const now = Date.now();
    const q = queryRef.current;
    if (
      q.hasNextPage &&
      !q.isFetchingNextPage &&
      !isFetchingRef.current &&
      now - lastFetchTime.current > 1000
    ) {
      lastFetchTime.current = now;
      isFetchingRef.current = true;
      q.fetchNextPage().finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, []);

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return <PostCardSkeletonList count={5} />;
    }

    if (isError) {
      return (
        <Box flex center p="lg" style={{ paddingTop: 100 }}>
          <Text size="lg" weight="medium" mode="subtle">
            Failed to load posts
          </Text>
          <Text
            size="sm"
            mode="subtle"
            style={{ marginTop: 8, textAlign: "center" }}
          >
            {error?.message || "Something went wrong. Pull to refresh."}
          </Text>
        </Box>
      );
    }

    return (
      <Box flex center p="lg" style={{ paddingTop: 100 }}>
        <Text size="lg" weight="medium" mode="subtle">
          No posts yet
        </Text>
        <Text
          size="sm"
          mode="subtle"
          style={{ marginTop: 8, textAlign: "center" }}
        >
          Be the first to post in #{topicName}!
        </Text>
      </Box>
    );
  }, [isLoading, isError, error, topicName]);

  const ListHeaderComponent = useCallback(() => {
    if (!isManualRefreshing) return null;
    return (
      <Box center p="md">
        <ActivityIndicator
          size="small"
          color={theme.colors.background.emphasis}
        />
      </Box>
    );
  }, [isManualRefreshing, theme.colors.background.emphasis]);

  const ListFooterComponent = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return <PostCardSkeletonList count={1} />;
  }, [isFetchingNextPage]);

  const HEADER_HEIGHT = 52;

  const listContentStyle = useMemo(
    () => ({
      paddingTop: insets.top + HEADER_HEIGHT,
      paddingBottom: insets.bottom + 16,
      flexGrow: posts.length === 0 ? 1 : undefined,
    }),
    [insets.bottom, insets.top, posts.length],
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={false}
        onRefresh={handleRefresh}
        tintColor="transparent"
        progressViewOffset={insets.top + HEADER_HEIGHT}
      />
    ),
    [handleRefresh, insets.top],
  );

  const allowAutoplay = useMemo(
    () =>
      shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType],
  );

  const homePostCardHandlers = useMemo(
    () => ({
      onPostPress: handlePostPress,
      onAuthorPress: handleAuthorPress,
      onTopicPress: handleTopicPress,
      onMorePress: handleMorePress,
      onLikePress: handleUpvote,
      onDislikePress: handleDownvote,
      onCommentPress: handleCommentPress,
      onFollowUser: handleFollowPress,
      onFollowTopic: handleFollowTopicFromCard,
      onRevealContent: handleRevealContent,
      onBlockUser: handleBlockUserFromCard,
      onBlockPost: handleBlockPostFromCard,
      onBlockTopic: handleBlockTopicFromCard,
      onReport: handleReportFromCard,
    }),
    [
      handleAuthorPress,
      handleBlockPostFromCard,
      handleBlockTopicFromCard,
      handleBlockUserFromCard,
      handleCommentPress,
      handleDownvote,
      handleFollowPress,
      handleFollowTopicFromCard,
      handleMorePress,
      handlePostPress,
      handleReportFromCard,
      handleRevealContent,
      handleTopicPress,
      handleUpvote,
    ],
  );

  useHomePostCardBindings({
    currentUserId: currentUser?.id,
    followedUsers,
    followedTopics,
    revealedPosts,
    shareServer,
    allowAutoplay,
    activeFeedScreen: "topic",
    disabledTopicName: topicName,
    handlers: homePostCardHandlers,
  });

  return (
    <Box flex background="base">
      <TopicFeedHeader
        borderBottomColor={theme.colors.border.subtle}
        followBackgroundColor={
          isTopicFollowed ? "transparent" : theme.colors.primary[500]
        }
        followBorderColor={
          isTopicFollowed
            ? theme.colors.border.default
            : theme.colors.primary[500]
        }
        followTextColor={
          isTopicFollowed
            ? theme.colors.text.default
            : theme.colors.background.default
        }
        insetsTop={insets.top}
        isTopicFollowed={isTopicFollowed}
        onBack={() => router.back()}
        onFollowTopic={handleHeaderFollowTopic}
        onSortChange={handleSortChange}
        sortBy={sortBy}
        sortLabel={SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? "Magic"}
        sortOptions={SORT_OPTIONS}
        textColor={theme.colors.text.default}
        subtleTextColor={theme.colors.text.subtle}
        topicName={topicName}
      />

      <HomePostList
        ref={flatListRef}
        data={posts}
        contentContainerStyle={listContentStyle}
        onScroll={() => {}}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        refreshControl={refreshControl}
        feedScreen="topic"
        feedContext={topicFeedSyncContext}
        onItemVisible={handleItemVisible}
      />

      <NewPostsButton
        visible={hasNewPosts}
        onPress={handleNewPostsPress}
        topOffset={insets.top + 52}
        avatars={newPostAvatars}
        newPostCount={newPostCount}
        loading={isBannerLoading}
      />

      <TopicFeedOverlays
        awardPickerSheetRef={awardPickerSheetRef}
        blockCancel={blockHandler.cancelBlock}
        blockConfirm={handleConfirmBlock}
        blockLabel={blockHandler.pendingBlock?.label}
        blockVisible={blockHandler.showConfirmation}
        currentUserId={currentUser?.id}
        deleteCancel={deleteHandler.cancelDelete}
        deleteConfirm={handleConfirmDelete}
        deleteVisible={deleteHandler.showConfirmation}
        followedTopics={followedTopics}
        followedUsers={followedUsers}
        isReporting={reportHandler.isReporting}
        onBlockPost={handleHidePost}
        onBlockUser={handleBlockUser}
        onCopyText={handleCopyText}
        onDelete={handleDeletePost}
        onDismissPostOptions={() => setSelectedPost(null)}
        onEdit={handleEditPost}
        onFollowTopic={handleFollowTopic}
        onFollowUser={handleFollowUserFromSheet}
        onGiveAward={() => {
          if (!selectedPost) return;
          setTimeout(() => awardPickerSheetRef.current?.present(), 300);
        }}
        onHidePost={handleHidePost}
        onReport={handleReport}
        onReportDismiss={reportHandler.cancelReport}
        onReportSubmit={handleReportSubmitWithOptimistic}
        onSave={handleSavePost}
        onShowFewer={handleShowFewer}
        postOptionsSheetRef={postOptionsSheetRef}
        reportSheetRef={reportSheetRef}
        selectedPost={selectedPost}
      />
    </Box>
  );
}

