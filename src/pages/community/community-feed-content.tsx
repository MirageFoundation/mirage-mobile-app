import * as Sentry from "@sentry/react-native";
import { useFocusEffect, useIsFocused } from "expo-router/react-navigation";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useAndroidPullIndicator } from "@/src/hooks/use-android-pull-indicator";
import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Pressable, RefreshControl, View } from "react-native";
import { IOSRefreshIndicator } from "@/src/components/atoms/refresh-indicator";
import { useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector } from "react-native-gesture-handler";
import { triggerHaptic } from "@/src/components/utils/haptics";

import { PostCardSkeletonList } from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { communityLabel } from "@/src/domain/communities";
import {
  shouldAutoplayVideo,
  useLatestRef,
  useNetworkType,
} from "@/src/hooks";
import { HomePostList } from "../home/home-post-list";
import type { FeedListRef } from "../home/feed-list-scroll";
import { FeedPostCardRuntimeProvider } from "../home/feed-post-card-runtime";
import { usePreferencesStore, useTimeTickStore } from "@/src/stores";
import { PostActionOverlays } from "../post/post-action-overlays";
import { CommunityFeedHeader } from "./community-feed-header";
import { refreshCommunityFeed } from "./community-feed-refresh";
import { useCommunityFeedController } from "./use-community-feed-controller";

const SORT_OPTIONS = [
  { label: "Best", value: "magic" as const },
  { label: "New", value: "newest" as const },
];

export function CommunityFeedScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>();
  const slugParam = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const controller = useCommunityFeedController(slugParam);
  const flatListRef = useRef<FeedListRef>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const networkType = useNetworkType();
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((s) => s.videoAutoplayNetwork);
  const shareServer = usePreferencesStore((s) => s.apiServer);
  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType],
  );

  const {
    slug,
    isValidSlug,
    isDetailLoading,
    isDetailError,
    detailError,
    refetchDetail,
    posts,
    isFeedLoading,
    isFeedError,
    feedError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetchFeed,
    sortBy,
    handleSortChange,
    isJoined,
    lensChoice,
    teamOptions,
    handleLensChange,
    handleJoinToggle,
    handleTeamsPress,
    handleCommunityPress,
    handlePostPress,
    handleAuthorPress,
    handleRevealContent,
    handleMorePress,
    revealedPosts,
    followUserOverrides,
    followedUsers,
    joinedCommunities,
    postActions,
    queryClient,
    allowedTags,
    currentUser,
  } = controller;

  const feedContext = `community:${slug}:${sortBy}`;
  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);
  const queryRef = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage });
  queryRef.current = { hasNextPage, isFetchingNextPage, fetchNextPage };
  const postsLengthRef = useRef(posts.length);
  postsLengthRef.current = posts.length;

  const handleRefresh = useCallback(async () => {
    if (Platform.OS === "android") triggerHaptic("light");
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        refetchDetail(),
        refreshCommunityFeed({
          queryClient,
          community: slug,
          sortBy,
          allowedTags: allowedTags || undefined,
          address: currentUser?.walletAddress,
          lens: lensChoice.lens,
          teamId: lensChoice.team_id,
        }),
      ]);
    } catch (error) {
      Sentry.addBreadcrumb({
        category: "community-feed",
        message: "Refresh failed",
        data: { error: String(error) },
        level: "error",
      });
    } finally {
      setIsManualRefreshing(false);
      useTimeTickStore.getState().bump();
    }
  }, [allowedTags, currentUser?.walletAddress, lensChoice, queryClient, refetchDetail, slug, sortBy]);

  const handleItemVisible = useCallback((index: number) => {
    if (index < postsLengthRef.current - 5) return;
    const now = Date.now();
    const q = queryRef.current;
    if (q.hasNextPage && !q.isFetchingNextPage && !isFetchingRef.current && now - lastFetchTime.current > 1000) {
      lastFetchTime.current = now;
      isFetchingRef.current = true;
      q.fetchNextPage().finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, []);

  const ListEmptyComponent = useCallback(() => {
    if (!isValidSlug) {
      return (
        <Box flex center p="lg" style={{ paddingTop: 100 }}>
          <Text size="lg" weight="medium">Community not found</Text>
        </Box>
      );
    }
    if (isDetailLoading && isFeedLoading) {
      return <PostCardSkeletonList count={5} />;
    }
    if (isDetailError && !isDetailLoading) {
      return (
        <Box flex center p="lg" style={{ paddingTop: 100 }}>
          <Text size="lg" weight="medium" mode="subtle">Failed to load community</Text>
          <Text size="sm" mode="subtle" style={{ marginTop: 8, textAlign: "center" }}>
            {detailError?.message || "Something went wrong."}
          </Text>
          <Pressable onPress={() => void refetchDetail()} style={{ marginTop: 16 }}>
            <Text size="sm" weight="semibold">Retry</Text>
          </Pressable>
        </Box>
      );
    }
    if (isFeedLoading) return <PostCardSkeletonList count={5} />;
    if (isFeedError) {
      return (
        <Box flex center p="lg" style={{ paddingTop: 100 }}>
          <Text size="lg" weight="medium" mode="subtle">Failed to load posts</Text>
          <Text size="sm" mode="subtle" style={{ marginTop: 8, textAlign: "center" }}>
            {feedError?.message || "Something went wrong. Pull to refresh."}
          </Text>
          <Pressable onPress={() => void refetchFeed()} style={{ marginTop: 16 }}>
            <Text size="sm" weight="semibold">Retry</Text>
          </Pressable>
        </Box>
      );
    }
    return (
      <Box flex center p="lg" style={{ paddingTop: 100 }}>
        <Text size="lg" weight="medium" mode="subtle">No posts yet</Text>
        <Text size="sm" mode="subtle" style={{ marginTop: 8, textAlign: "center" }}>
          Be the first to post in {communityLabel(slug)}!
        </Text>
      </Box>
    );
  }, [
    detailError?.message,
    feedError?.message,
    isDetailError,
    isDetailLoading,
    isFeedError,
    isFeedLoading,
    isValidSlug,
    refetchDetail,
    refetchFeed,
    slug,
  ]);

  const isIOS = Platform.OS === "ios";
  const HEADER_HEIGHT = 48;
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

  const handlersRef = useLatestRef({
    handlePostPress,
    handleAuthorPress,
    handleCommunityPress,
    handleMorePress,
    handleRevealContent,
    ...postActions.cardActions,
  });

  const feedRuntimeConfig = useMemo(() => ({
    currentUserId: currentUser?.id,
    followedUsers: new Set(followedUsers),
    joinedCommunities,
    followUserOverrides,
    revealedPosts,
    shareServer,
    allowAutoplay,
    active: isFocused,
    disabledCommunityName: slug,
    handlers: {
      onPostPress: handlersRef.current.handlePostPress,
      onAuthorPress: handlersRef.current.handleAuthorPress,
      onCommunityPress: handlersRef.current.handleCommunityPress,
      onMorePress: handlersRef.current.handleMorePress,
      onLikePress: handlersRef.current.upvote,
      onDislikePress: handlersRef.current.downvote,
      onCommentPress: handlersRef.current.handlePostPress,
      onFollowUser: handlersRef.current.followUser,
      onToggleCommunityMembership: handlersRef.current.toggleCommunityMembership,
      onRevealContent: handlersRef.current.handleRevealContent,
      onBlockUser: handlersRef.current.blockUser,
      onBlockPost: handlersRef.current.blockPost,
      onBlockCommunity: handlersRef.current.blockCommunity,
      onReport: handlersRef.current.report,
    },
  }), [
    allowAutoplay,
    currentUser?.id,
    followUserOverrides,
    followedUsers,
    handlersRef,
    isFocused,
    joinedCommunities,
    revealedPosts,
    shareServer,
    slug,
  ]);

  useFocusEffect(
    useCallback(() => {
      useTimeTickStore.getState().bump();
    }, []),
  );

  return (
    <FeedPostCardRuntimeProvider config={feedRuntimeConfig}>
      <Box flex background="base">
        <CommunityFeedHeader
          insetsTop={insets.top}
          communityName={slug}
          isJoined={!!isJoined}
          onBack={router.back}
          onJoinToggle={handleJoinToggle}
          onSortChange={handleSortChange}
          sortBy={sortBy}
          sortOptions={SORT_OPTIONS}
          lensChoice={lensChoice}
          teamOptions={teamOptions}
          onLensChange={handleLensChange}
          onTeamsPress={handleTeamsPress}
        />
        <GestureDetector gesture={pullGesture}>
          <View style={{ flex: 1 }} collapsable={false}>
            <HomePostList
              key={feedContext}
              ref={flatListRef}
              data={posts}
              contentContainerStyle={listContentStyle}
              ListEmptyComponent={ListEmptyComponent}
              ListFooterComponent={
                isFetchingNextPage && posts.length > 0
                  ? () => <PostCardSkeletonList count={1} />
                  : null
              }
              refreshControl={refreshControl}
              feedScreen="community"
              feedContext={feedContext}
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
        <PostActionOverlays controller={postActions} />
      </Box>
    </FeedPostCardRuntimeProvider>
  );
}
