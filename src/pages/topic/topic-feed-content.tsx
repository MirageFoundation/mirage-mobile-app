import { navigateToEditPost } from "@/src/utils/edit-post";
import { markSeen } from "@/src/services/seen-posts";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect, useIsFocused } from "expo-router/react-navigation";
import type { FlashListRef } from "@shopify/flash-list";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useAndroidPullIndicator } from "@/src/hooks/use-android-pull-indicator";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  RefreshControl,
  View,
} from "react-native";
import { IOSRefreshIndicator } from "@/src/components/atoms/refresh-indicator";
import { useSharedValue, useAnimatedScrollHandler } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector } from "react-native-gesture-handler";
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
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { buildFollowedTopicSet, isTopicFollowed } from "@/src/domain/topics";
import {
  useAuthGuard,
  useNetworkType,
  shouldAutoplayVideo,
  useLatestRef,
} from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import { HomePostList } from "../home/home-post-list";
import { FeedPostCardRuntimeProvider } from "../home/feed-post-card-runtime";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  getAllowedTagsFromContentTypes,
  useAuthStore,
  useContentModerationStore,
  useFeedScrollStore,
  usePreferencesStore,
  useSavedPostsStore,
  useTimeTickStore,
} from "@/src/stores";
import { useNewPostsChecker } from "@/src/hooks/use-new-posts-checker";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";
import { PostActionOverlays } from "../post/post-action-overlays";
import { usePostActionController } from "../post/use-post-action-controller";
import { TopicFeedHeader } from "./topic-feed-header";

export function TopicFeedScreen() {
  const { id: topicName } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const toast = useToast();
  const { requireAuth } = useAuthGuard();

  const flatListRef = useRef<FlashListRef<Post>>(null);

  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
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

  const setContextScrolling = useFeedScrollStore((state) => state.setContextScrolling);

  const handleSortChange = useCallback((value: "magic" | "newest") => {
    triggerHaptic("light");
    const oldFeedContext = `topic:${topicName ?? "unknown"}:${sortBy}`;
    const newFeedContext = `topic:${topicName ?? "unknown"}:${value}`;
    setContextScrolling(oldFeedContext, false);
    setContextScrolling(newFeedContext, false);
    setSortBy(value);
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [setContextScrolling, sortBy, topicName]);

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
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const shareServer = usePreferencesStore((s) => s.apiServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore(
    (s) => s.videoAutoplayNetwork,
  );
  const hideDownvotedPosts = usePreferencesStore((s) => s.hideDownvotedPosts);
  const currentUser = useAuthStore((s) => s.user);

  const networkType = useNetworkType();

  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData],
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData],
  );
  const [followUserOverrides, setFollowUserOverrides] = useState<Record<string, boolean>>({});
  const setFollowUserOverride = useCallback((userId: string, isFollowing: boolean) => {
    setFollowUserOverrides((current) => ({ ...current, [userId]: isFollowing }));
  }, []);
  const clearFollowUserOverride = useCallback((userId: string) => {
    setFollowUserOverrides((current) => {
      const { [userId]: _, ...rest } = current;
      return rest;
    });
  }, []);
  const displayFollowedUsers = useMemo(() => {
    const overrides = Object.entries(followUserOverrides);
    if (overrides.length === 0) return followedUsers;

    const next = new Set(followedUsers);
    overrides.forEach(([userId, isFollowing]) => {
      if (isFollowing) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
    });
    return Array.from(next);
  }, [followedUsers, followUserOverrides]);

  const [optimisticFollowedTopic, setOptimisticFollowedTopic] = useState<
    boolean | null
  >(null);

  const isCurrentTopicFollowed =
    optimisticFollowedTopic ?? isTopicFollowed(followedTopics, topicName);

  useEffect(() => {
    setOptimisticFollowedTopic(null);
  }, [followedTopics]);

  const allowedTags = useMemo(
    () => getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled),
    [selectedContentTypes, adultContentEnabled],
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
  const visibleTrackerKeys = useMemo(
    () => [`topic:${topicName ?? "unknown"}:${sortBy}`],
    [topicName, sortBy],
  );

  usePostDataRefresher({
    feedParamsList: feedRefreshParamsList,
    visibleTrackerKeys,
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

    return transformApiPosts(patchedPosts, {
      currentUser: currentUser ? { id: currentUser.id, username: currentUser.username } : undefined,
    }).filter(
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
  const savedPostIds = useMemo(
    () => new Set(savedPosts.map((post) => post.id)),
    [savedPosts],
  );
  const postActions = usePostActionController({
    currentUserId: currentUser?.id,
    followedUsers: displayFollowedUsers,
    followedTopics,
    savedPostIds,
    onFollowUserOptimistic: setFollowUserOverride,
    onFollowUserRollback: clearFollowUserOverride,
    onFollowTopicOptimistic: useCallback((_topic: string, isFollowing: boolean) => {
      setOptimisticFollowedTopic(isFollowing);
    }, []),
    onFollowTopicRollback: useCallback(() => {
      setOptimisticFollowedTopic(null);
    }, []),
    onVoteOptimistic: useCallback(
      (targetId, result) => {
        markSeen(targetId, "vote");
        setVoteOverride(targetId, {
          hasLiked: result.hasLiked,
          hasDisliked: result.hasDisliked,
          likes: result.newLikes,
        });
      },
      [setVoteOverride],
    ),
    onVoteRollback: useCallback(
      (targetId) => {
        clearVoteOverride(targetId);
      },
      [clearVoteOverride],
    ),
    onBlockConfirmed: useCallback((pending) => {
      if (pending.type === "user") blockUser(pending.id);
      else if (pending.type === "post") hidePost(pending.id);
      else if (pending.type === "topic") blockTopicOptimistic(pending.id);
    }, [blockTopicOptimistic, blockUser, hidePost]),
    onDeleteConfirmed: hidePost,
    onDeleteRollback: unhidePost,
    onReportSubmitted: hidePost,
    onEditPost: useCallback((post) => navigateToEditPost(router, post), [router]),
    onToggleSave: useCallback(
      (post) => useSavedPostsStore.getState().toggleSavePost(post),
      [],
    ),
    onSaveChanged: useCallback((saved) => {
      toast.success(
        saved ? "Post saved" : "Post unsaved",
        saved ? "You can find it in your saved items." : "Removed from saved items.",
      );
    }, [toast]),
    onCopyText: useCallback(() => {
      toast.success("Copied", "Text copied to clipboard.");
    }, [toast]),
    onShowFewer: useCallback(() => {
      toast.success("Got it", "We'll show fewer posts like this.");
    }, [toast]),
  });
  const {
    openOptions: openPostOptions,
    followUser: handleFollowPress,
    followTopic: handleFollowTopicFromCard,
    upvote: handleUpvote,
    downvote: handleDownvote,
    blockUser: handleBlockUserFromCard,
    blockPost: handleBlockPostFromCard,
    blockTopic: handleBlockTopicFromCard,
    report: handleReportFromCard,
  } = postActions.cardActions;

  const handleHeaderFollowTopic = useCallback(() => {
    if (!topicName) return;
    handleFollowTopicFromCard(topicName, isCurrentTopicFollowed);
  }, [topicName, isCurrentTopicFollowed, handleFollowTopicFromCard]);

  const revealedPostsRef = useRef<Set<string>>(new Set());
  const topicFeedSyncContext = `topic:${topicName ?? "unknown"}:${sortBy}`;

  const handlePostPress = useCallback(
    (postId: string) => {
      markSeen(postId, "open");
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
    requireAuth(() => {
      openPostOptions(post);
    });
  }, [openPostOptions, requireAuth]);

  const handleCommentPress = useCallback(
    (postId: string) => {
      markSeen(postId, "open");
      router.push(`/post/${postId}?syncContext=${encodeURIComponent(topicFeedSyncContext)}`);
    },
    [router, topicFeedSyncContext],
  );

  const handleRevealContent = useCallback(
    (postId: string) => {
      setRevealedPosts((prev) => {
        const newSet = new Set(prev);
        newSet.add(postId);
        revealedPostsRef.current = newSet;
        return newSet;
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
    if (Platform.OS === "android") triggerHaptic("light");
    Sentry.addBreadcrumb({
      category: "topic-feed",
      message: "Refresh requested",
      level: "info",
      data: {
        platform: Platform.OS,
        topic: topicName,
      },
    });
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
  }, [refetch, topicName]);

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

  const isIOS = Platform.OS === "ios";

  const ListFooterComponent = useCallback(() => {
    if (!isFetchingNextPage || posts.length === 0) return null;
    return <PostCardSkeletonList count={1} />;
  }, [isFetchingNextPage, posts.length]);

  const HEADER_HEIGHT = 52;

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const { pullDistance, pullGesture } = useAndroidPullIndicator({
    scrollY,
    refreshing: isManualRefreshing,
    onTriggerRefresh: handleRefresh,
  });

  const listContentStyle = useMemo(
    () => ({
      paddingTop: insets.top + HEADER_HEIGHT,
      paddingBottom: insets.bottom + 16,
      flexGrow: posts.length === 0 ? 1 : undefined,
    }),
    [insets.bottom, insets.top, posts.length],
  );

  const refreshControl = useMemo(() => {
    if (!isIOS) return null;

    return (
      <RefreshControl
        refreshing={false}
        onRefresh={handleRefresh}
        tintColor="transparent"
        colors={["transparent"]}
        progressBackgroundColor="transparent"
        progressViewOffset={insets.top + HEADER_HEIGHT}
      />
    );
  }, [handleRefresh, insets.top, isIOS]);

  const followedUsersSet = useMemo(
    () => new Set(followedUsers),
    [followedUsers],
  );
  const followedTopicsSet = useMemo(
    () => buildFollowedTopicSet(followedTopics),
    [followedTopics],
  );

  const allowAutoplay = useMemo(
    () =>
      shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType],
  );

  useFocusEffect(
    useCallback(() => {
      useTimeTickStore.getState().bump();
    }, []),
  );

  const handlersRef = useLatestRef({
    handlePostPress,
    handleAuthorPress,
    handleTopicPress,
    handleMorePress,
    handleUpvote,
    handleDownvote,
    handleCommentPress,
    handleFollowPress,
    handleFollowTopicFromCard,
    handleRevealContent,
    handleBlockUserFromCard,
    handleBlockPostFromCard,
    handleBlockTopicFromCard,
    handleReportFromCard,
  });

  const feedRuntimeConfig = useMemo(() => ({
    currentUserId: currentUser?.id,
    followedUsers: followedUsersSet,
    followedTopics: followedTopicsSet,
    followUserOverrides,
    revealedPosts,
    shareServer,
    allowAutoplay,
    // Unlike the home/following feeds, the side menu lives inside the tab
    // layout and can never overlay this screen (topic routes are pushed on
    // the root stack), so sideMenuOpen must not gate playback here — it
    // stays true when a topic is opened from the side menu.
    active: isFocused,
    disabledTopicName: topicName,
    handlers: {
      onPostPress: handlersRef.current.handlePostPress,
      onAuthorPress: handlersRef.current.handleAuthorPress,
      onTopicPress: handlersRef.current.handleTopicPress,
      onMorePress: handlersRef.current.handleMorePress,
      onLikePress: handlersRef.current.handleUpvote,
      onDislikePress: handlersRef.current.handleDownvote,
      onCommentPress: handlersRef.current.handleCommentPress,
      onFollowUser: handlersRef.current.handleFollowPress,
      onFollowTopic: handlersRef.current.handleFollowTopicFromCard,
      onRevealContent: handlersRef.current.handleRevealContent,
      onBlockUser: handlersRef.current.handleBlockUserFromCard,
      onBlockPost: handlersRef.current.handleBlockPostFromCard,
      onBlockTopic: handlersRef.current.handleBlockTopicFromCard,
      onReport: handlersRef.current.handleReportFromCard,
    },
  }), [
    allowAutoplay,
    currentUser?.id,
    followedTopicsSet,
    followedUsersSet,
    followUserOverrides,
    handlersRef,
    isFocused,
    revealedPosts,
    shareServer,
    topicName,
  ]);

  return (
    <FeedPostCardRuntimeProvider config={feedRuntimeConfig}>
    <Box flex background="base">
      <TopicFeedHeader
        insetsTop={insets.top}
        isTopicFollowed={isCurrentTopicFollowed}
        onBack={router.back}
        onFollowTopic={handleHeaderFollowTopic}
        onSortChange={handleSortChange}
        sortBy={sortBy}
        sortOptions={SORT_OPTIONS}
        topicName={topicName}
      />

      <GestureDetector gesture={pullGesture}>
        <View style={{ flex: 1 }} collapsable={false}>
          <HomePostList
            key={topicFeedSyncContext}
            ref={flatListRef}
            data={posts}
            contentContainerStyle={listContentStyle}
            ListEmptyComponent={ListEmptyComponent}
            ListFooterComponent={ListFooterComponent}
            refreshControl={refreshControl}
            feedScreen="topic"
            feedContext={topicFeedSyncContext}
            onItemVisible={handleItemVisible}
            onScroll={scrollHandler}
          />
        </View>
      </GestureDetector>

      <IOSRefreshIndicator
        visible={isManualRefreshing}
        topOffset={insets.top + HEADER_HEIGHT + 8}
        scrollY={scrollY}
        pullDistance={pullDistance}
      />

      <NewPostsButton
        visible={hasNewPosts && isFocused}
        onPress={handleNewPostsPress}
        topOffset={insets.top + 52}
        avatars={newPostAvatars}
        newPostCount={newPostCount}
        loading={isBannerLoading}
      />

      <PostActionOverlays controller={postActions} />
    </Box>
    </FeedPostCardRuntimeProvider>
  );
}
