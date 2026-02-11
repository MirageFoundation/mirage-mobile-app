import { useCallback, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import type { FlatList } from "react-native";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PagerView, { type PagerViewOnPageSelectedEvent } from "react-native-pager-view";
import type { PagerViewOnPageScrollEvent } from "react-native-pager-view";
import Animated, {
  useSharedValue,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  getPosts,
  queryKeys,
  transformApiPosts,
  useInfinitePosts,
} from "@/src/api";
import {
  FeedTypeTabBar,
  FEED_TAB_BAR_HEIGHT,
  PostCardSkeleton,
  PostCardSkeletonList,
  QuestsSummaryCard,
  type Post,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import {
  HEADER_HEIGHT,
  TAB_BAR_HEIGHT,
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { HomePostList } from "./home-post-list";
import { useHomePostCardStore } from "./home-post-card-store";
import {
  getAllowedTagsFromContentTypes,
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
} from "@/src/stores";
import { useQueryClient } from "@tanstack/react-query";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

export type HomeTabbedFeedRef = {
  scrollToTop: (tabIndex?: number) => void;
  refresh: () => Promise<void>;
};

type HomeTabbedFeedProps = {
  feedType: "home" | "following";
};

export const HomeTabbedFeed = forwardRef<HomeTabbedFeedRef, HomeTabbedFeedProps>(
  ({ feedType: baseFeed }, ref) => {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const {
      scrollHandler,
      headerAnimatedStyle,
    } = useScrollAnimationContext();

    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [isManualRefreshing, setIsManualRefreshing] = useState(false);
    const pagerRef = useRef<PagerView>(null);
    const magicListRef = useRef<FlatList<Post>>(null);
    const latestListRef = useRef<FlatList<Post>>(null);
    const scrollProgress = useSharedValue(0);

    const currentUser = useAuthStore((s) => s.user);
   const isInitializing = useAuthStore((s) => s.isInitializing);
    const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
    const hideDownvotedPosts = usePreferencesStore((s) => s.hideDownvotedPosts);
    const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
    const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);

    const allowedTags = useMemo(
      () => getAllowedTagsFromContentTypes(selectedContentTypes),
      [selectedContentTypes]
    );

    const magicQuery = useInfinitePosts({
      limit: 20,
      feed: baseFeed,
      by: "magic",
      allowed_tags: allowedTags || undefined,
    });

    const latestQuery = useInfinitePosts({
      limit: 20,
      feed: baseFeed,
      by: "newest",
      allowed_tags: allowedTags || undefined,
    });

    const transformPosts = useCallback(
      (data: typeof magicQuery.data) => {
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

        const transformedPosts = transformApiPosts(filteredPosts);

        return transformedPosts.filter(
          (post) =>
            !hiddenPostIds.has(post.id) && !blockedUserIds.has(post.author.id)
        );
      },
      [hiddenPostIds, blockedUserIds, hideDownvotedPosts]
    );

    const magicPosts = useMemo(
      () => transformPosts(magicQuery.data),
      [magicQuery.data, transformPosts]
    );

    const latestPosts = useMemo(
      () => transformPosts(latestQuery.data),
      [latestQuery.data, transformPosts]
    );

   const handleTabChange = useCallback((index: number) => {
     setActiveTabIndex(index);
      scrollProgress.value = index;
     pagerRef.current?.setPage(index);
    }, [scrollProgress]);

   const handlePageSelected = useCallback(
     (e: PagerViewOnPageSelectedEvent) => {
       setActiveTabIndex(e.nativeEvent.position);
     },
      []
   );

    const handlePageScroll = useCallback(
      (e: PagerViewOnPageScrollEvent) => {
        const { position, offset } = e.nativeEvent;
        scrollProgress.value = position + offset;
      },
      [scrollProgress]
    );

    const handleRefresh = useCallback(async () => {
      setIsManualRefreshing(true);
      try {
        const query = activeTabIndex === 0 ? magicQuery : latestQuery;
        const sortBy = activeTabIndex === 0 ? "magic" : "newest";

        const newFirstPage = await getPosts({
          limit: 20,
          feed: baseFeed,
          by: sortBy as any,
          allowed_tags: allowedTags || undefined,
          address: currentUser?.walletAddress,
          page: 1,
        });

        const postsQueryKey = queryKeys.posts({
          limit: 20,
          feed: baseFeed,
          by: sortBy as any,
          allowed_tags: allowedTags || undefined,
          address: currentUser?.walletAddress,
          page: undefined,
        });

        queryClient.setQueryData(postsQueryKey, (oldData: any) => {
          if (!oldData) {
            return {
              pages: [newFirstPage],
              pageParams: [1],
            };
          }
          return {
            ...oldData,
            pages: [newFirstPage, ...oldData.pages.slice(1)],
            pageParams: [1, ...oldData.pageParams.slice(1)],
          };
        });

        if (currentUser?.walletAddress) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.dailyQuests(currentUser.walletAddress),
          });
        }
      } catch (error) {
        console.error("Failed to refresh feed:", error);
      } finally {
        setIsManualRefreshing(false);
      }
    }, [activeTabIndex, magicQuery, latestQuery, baseFeed, allowedTags, currentUser?.walletAddress, queryClient]);

    useImperativeHandle(ref, () => ({
      scrollToTop: (tabIndex?: number) => {
        const targetIndex = tabIndex ?? activeTabIndex;
        const listRef = targetIndex === 0 ? magicListRef : latestListRef;
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
      refresh: handleRefresh,
    }), [activeTabIndex, handleRefresh]);

    const lastMagicFetchTime = useRef(0);
    const isMagicFetching = useRef(false);

    const lastLatestFetchTime = useRef(0);
    const isLatestFetching = useRef(false);

    const PREFETCH_THRESHOLD = 14;

    const handleMagicItemVisible = useCallback((index: number) => {
      if (index < PREFETCH_THRESHOLD) return;
      const now = Date.now();
      if (
        magicQuery.hasNextPage &&
        !magicQuery.isFetchingNextPage &&
        !isMagicFetching.current &&
        now - lastMagicFetchTime.current > 1000
      ) {
        lastMagicFetchTime.current = now;
        isMagicFetching.current = true;
        magicQuery.fetchNextPage().finally(() => {
          isMagicFetching.current = false;
        });
      }
    }, [magicQuery]);

    const handleLatestItemVisible = useCallback((index: number) => {
      if (index < PREFETCH_THRESHOLD) return;
      const now = Date.now();
      if (
        latestQuery.hasNextPage &&
        !latestQuery.isFetchingNextPage &&
        !isLatestFetching.current &&
        now - lastLatestFetchTime.current > 1000
      ) {
        lastLatestFetchTime.current = now;
        isLatestFetching.current = true;
        latestQuery.fetchNextPage().finally(() => {
          isLatestFetching.current = false;
        });
      }
    }, [latestQuery]);

    const createListEmptyComponent = useCallback(
      (isLoading: boolean, isError: boolean, errorMessage?: string) => {
       if (isLoading || isInitializing) {
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
                {errorMessage || "Something went wrong. Pull to refresh."}
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
              Be the first to share something interesting!
            </Text>
          </Box>
        );
      },
     [isInitializing]
    );

    const MagicListHeader = useCallback(() => {
      const showRefreshIndicator =
        isManualRefreshing && activeTabIndex === 0;
      return (
        <>
          {showRefreshIndicator && (
            <Box center p="md">
              <ActivityIndicator
                size="small"
                color={theme.colors.background.emphasis}
              />
            </Box>
          )}
          {baseFeed === "home" && <QuestsSummaryCard />}
        </>
      );
   }, [isManualRefreshing, activeTabIndex, theme.colors.background.emphasis, baseFeed]);

    const LatestListHeader = useCallback(() => {
      const showRefreshIndicator =
        isManualRefreshing && activeTabIndex === 1;
      return showRefreshIndicator ? (
        <Box center p="md">
          <ActivityIndicator
            size="small"
            color={theme.colors.background.emphasis}
          />
        </Box>
      ) : null;
    }, [isManualRefreshing, activeTabIndex, theme.colors.background.emphasis]);

    const MagicListFooter = useCallback(() => {
      if (magicQuery.isFetchingNextPage) {
        return <PostCardSkeleton showMedia={false} showBody={true} />;
      }
      return <Box p="sm" />;
    }, [magicQuery.isFetchingNextPage]);

    const LatestListFooter = useCallback(() => {
      if (latestQuery.isFetchingNextPage) {
        return <PostCardSkeleton showMedia={false} showBody={true} />;
      }
      return <Box p="sm" />;
    }, [latestQuery.isFetchingNextPage]);

    const listContentStyle = useMemo(
      () => ({
        paddingTop: insets.top + HEADER_HEIGHT + FEED_TAB_BAR_HEIGHT,
        paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
        flexGrow: 1,
      }),
      [insets.bottom, insets.top]
    );

    const refreshControl = useMemo(
      () => (
        <RefreshControl
          refreshing={false}
          onRefresh={handleRefresh}
          tintColor="transparent"
          progressViewOffset={insets.top + HEADER_HEIGHT + FEED_TAB_BAR_HEIGHT}
        />
      ),
      [handleRefresh, insets.top]
    );

    return (
      <>
       <Animated.View
         style={[
           styles.tabBarContainer,
           { top: insets.top + HEADER_HEIGHT },
            headerAnimatedStyle as any,
         ]}
       >
          <FeedTypeTabBar
            selectedIndex={activeTabIndex}
            onTabChange={handleTabChange}
            scrollProgress={scrollProgress}
          />
        </Animated.View>

       <AnimatedPagerView
         ref={pagerRef}
         style={styles.pager}
         initialPage={0}
         onPageSelected={handlePageSelected}
          onPageScroll={handlePageScroll}
         overdrag={true}
       >
          <View key="magic" style={styles.page}>
            <HomePostList
              ref={magicListRef}
              data={magicPosts}
              contentContainerStyle={listContentStyle}
              onScroll={scrollHandler}
              ListHeaderComponent={MagicListHeader}
              ListEmptyComponent={() =>
                createListEmptyComponent(
                  magicQuery.isLoading,
                  magicQuery.isError,
                  magicQuery.error?.message
                )
              }
              ListFooterComponent={MagicListFooter}
              refreshControl={refreshControl}
              feedScreen={baseFeed}
              onItemVisible={handleMagicItemVisible}
            />
          </View>
          <View key="latest" style={styles.page}>
            <HomePostList
              ref={latestListRef}
              data={latestPosts}
              contentContainerStyle={listContentStyle}
              onScroll={scrollHandler}
              ListHeaderComponent={LatestListHeader}
              ListEmptyComponent={() =>
                createListEmptyComponent(
                  latestQuery.isLoading,
                  latestQuery.isError,
                  latestQuery.error?.message
                )
              }
              ListFooterComponent={LatestListFooter}
              refreshControl={refreshControl}
              feedScreen={baseFeed}
              onItemVisible={handleLatestItemVisible}
            />
          </View>
        </AnimatedPagerView>
      </>
    );
  }
);

HomeTabbedFeed.displayName = "HomeTabbedFeed";

const styles = StyleSheet.create((theme) => ({
  tabBarContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 99,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
}));
