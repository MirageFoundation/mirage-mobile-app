import { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from "react";
import type { FlatList } from "react-native";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  getPosts,
  queryKeys,
  transformApiPosts,
  useInfinitePosts,
} from "@/src/api";
import {
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

export type HomeTabbedFeedRef = {
  scrollToTop: (tabIndex?: number) => void;
  refresh: () => Promise<void>;
};

type HomeTabbedFeedProps = {
  feedType: "home" | "following";
  activeTabIndex?: number;
};

export const HomeTabbedFeed = forwardRef<HomeTabbedFeedRef, HomeTabbedFeedProps>(
  ({ feedType: baseFeed, activeTabIndex = 0 }, ref) => {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const {
      scrollHandler,
    } = useScrollAnimationContext();

    const [isManualRefreshing, setIsManualRefreshing] = useState(false);
    const magicListRef = useRef<FlatList<Post>>(null);
    const latestListRef = useRef<FlatList<Post>>(null);

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

    useEffect(() => {
      const trimCache = (by: string) => {
        const key = queryKeys.posts({
          limit: 20,
          feed: baseFeed,
          by: by as any,
          allowed_tags: allowedTags || undefined,
          address: currentUser?.walletAddress ?? undefined,
          page: undefined,
        });
        queryClient.setQueryData(key, (old: any) => {
          if (!old?.pages || old.pages.length <= 1) return old;
          return {
            pages: old.pages.slice(0, 1),
            pageParams: old.pageParams.slice(0, 1),
          };
        });
      };
      trimCache("magic");
      trimCache("newest");
    }, []);

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

    const handleRefresh = useCallback(async () => {
      setIsManualRefreshing(true);
      try {
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
    }, [activeTabIndex, baseFeed, allowedTags, currentUser?.walletAddress, queryClient]);

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
    const PAGE_SIZE = 20;

    const magicQueryRef = useRef(magicQuery);
    magicQueryRef.current = magicQuery;
    const magicPostsLengthRef = useRef(magicPosts.length);
    magicPostsLengthRef.current = magicPosts.length;

    const latestQueryRef = useRef(latestQuery);
    latestQueryRef.current = latestQuery;
    const latestPostsLengthRef = useRef(latestPosts.length);
    latestPostsLengthRef.current = latestPosts.length;

    const handleMagicItemVisible = useCallback((index: number) => {
      const totalLoaded = magicPostsLengthRef.current;
      const currentPageStart = Math.max(0, totalLoaded - PAGE_SIZE);
      const indexInCurrentPage = index - currentPageStart;
      if (indexInCurrentPage < PREFETCH_THRESHOLD) return;
      const now = Date.now();
      const q = magicQueryRef.current;
      if (
        q.hasNextPage &&
        !q.isFetchingNextPage &&
        !isMagicFetching.current &&
        now - lastMagicFetchTime.current > 1000
      ) {
        lastMagicFetchTime.current = now;
        isMagicFetching.current = true;
        q.fetchNextPage().finally(() => {
          isMagicFetching.current = false;
        });
      }
    }, []);

    const handleLatestItemVisible = useCallback((index: number) => {
      const totalLoaded = latestPostsLengthRef.current;
      const currentPageStart = Math.max(0, totalLoaded - PAGE_SIZE);
      const indexInCurrentPage = index - currentPageStart;
      if (indexInCurrentPage < PREFETCH_THRESHOLD) return;
      const now = Date.now();
      const q = latestQueryRef.current;
      if (
        q.hasNextPage &&
        !q.isFetchingNextPage &&
        !isLatestFetching.current &&
        now - lastLatestFetchTime.current > 1000
      ) {
        lastLatestFetchTime.current = now;
        isLatestFetching.current = true;
        q.fetchNextPage().finally(() => {
          isLatestFetching.current = false;
        });
      }
    }, []);

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

    const ListHeader = useCallback(() => {
      const showRefreshIndicator = isManualRefreshing;
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
          {baseFeed === "home" && activeTabIndex === 0 && <QuestsSummaryCard />}
        </>
      );
   }, [isManualRefreshing, theme.colors.background.emphasis, baseFeed, activeTabIndex]);

    const ListFooter = useCallback(() => {
      const query = activeTabIndex === 0 ? magicQuery : latestQuery;
      if (query.isFetchingNextPage) {
        return <PostCardSkeleton showMedia={false} showBody={true} />;
      }
      return <Box p="sm" />;
    }, [activeTabIndex, magicQuery.isFetchingNextPage, latestQuery.isFetchingNextPage]);

    const listContentStyle = useMemo(
      () => ({
        paddingTop: insets.top + HEADER_HEIGHT,
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
          progressViewOffset={insets.top + HEADER_HEIGHT}
        />
      ),
      [handleRefresh, insets.top]
    );

    const posts = activeTabIndex === 0 ? magicPosts : latestPosts;
    const query = activeTabIndex === 0 ? magicQuery : latestQuery;
    const listRef = activeTabIndex === 0 ? magicListRef : latestListRef;
    const onItemVisible = activeTabIndex === 0 ? handleMagicItemVisible : handleLatestItemVisible;

    return (
      <HomePostList
        ref={listRef}
        data={posts}
        contentContainerStyle={listContentStyle}
        onScroll={scrollHandler}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={() =>
          createListEmptyComponent(
            query.isLoading,
            query.isError,
            query.error?.message
          )
        }
        ListFooterComponent={ListFooter}
        refreshControl={refreshControl}
        feedScreen={baseFeed}
        onItemVisible={onItemVisible}
      />
    );
  }
);

HomeTabbedFeed.displayName = "HomeTabbedFeed";
