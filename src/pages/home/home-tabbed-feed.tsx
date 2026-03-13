import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { FlashListRef } from "@shopify/flash-list";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import * as Sentry from "@sentry/react-native";

import {
  getPosts,
  queryKeys,
  transformApiPosts,
  useInfinitePosts,
} from "@/src/api";
import { usePostEditStore } from "@/src/stores/post-edit-store";
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
import { useNewPostsChecker, type NewPostAvatar } from "@/src/hooks/use-new-posts-checker";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";

export type HomeTabbedFeedRef = {
  scrollToTop: (tabIndex?: number, options?: { animated?: boolean }) => void;
  refresh: (options?: { fetchAllNew?: boolean }) => Promise<void>;
  isRefreshing: () => boolean;
  hasNewPosts: () => boolean;
  handleNewPostsPress: () => Promise<void>;
  dismissNewPosts: () => void;
  checkNewPosts: () => void;
};

type HomeTabbedFeedProps = {
  feedType: "home" | "following";
  activeTabIndex?: number;
  ListHeaderExtra?: ReactNode;
  onRefreshingChange?: (refreshing: boolean) => void;
  onNewPostsChange?: (hasNew: boolean, avatars: NewPostAvatar[], count: number) => void;
};

export const HomeTabbedFeed = forwardRef<
  HomeTabbedFeedRef,
  HomeTabbedFeedProps
>(({ feedType: baseFeed, activeTabIndex = 0, ListHeaderExtra, onRefreshingChange, onNewPostsChange }, ref) => {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { scrollHandler, registerHomeRefresh, registerFollowingRefresh, showBars } = useScrollAnimationContext();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const prevTabIndexRef = useRef(activeTabIndex);
  const activeTabIndexRef = useRef(activeTabIndex);
  activeTabIndexRef.current = activeTabIndex;
  const [latestTabActivated, setLatestTabActivated] = useState(activeTabIndex === 1);
  const latestTabRefreshedRef = useRef(false);

  const magicListRef = useRef<FlashListRef<Post>>(null);
  const latestListRef = useRef<FlashListRef<Post>>(null);
  const activeListRef = useRef<FlashListRef<Post>>(null);
  const dismissNewPostsRef = useRef<(() => void) | null>(null);
  const handleRefreshRef = useRef<((options?: { fetchAllNew?: boolean; silent?: boolean }) => Promise<void>) | null>(null);

  useEffect(() => {
    if (prevTabIndexRef.current !== activeTabIndex) {
      prevTabIndexRef.current = activeTabIndex;
      if (activeTabIndex === 1) {
        setLatestTabActivated(true);
      }
      showBars();
      requestAnimationFrame(() => {
        activeListRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
      if (activeTabIndex === 1 && !latestTabRefreshedRef.current) {
        latestTabRefreshedRef.current = true;
        setTimeout(() => handleRefreshRef.current?.(), 100);
      }
    }
  }, [activeTabIndex, showBars]);

  const currentUser = useAuthStore((s) => s.user);
  const selectedContentTypes = usePreferencesStore(
    (s) => s.selectedContentTypes,
  );
  const hideDownvotedPosts = usePreferencesStore((s) => s.hideDownvotedPosts);
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);
  const blockedTopicNames = useContentModerationStore((s) => s.blockedTopicNames);

  const followedUsers = useHomePostCardStore((s) => s.followedUsers);
  const followedTopics = useHomePostCardStore((s) => s.followedTopics);

  const allowedTags = useMemo(
    () => getAllowedTagsFromContentTypes(selectedContentTypes),
    [selectedContentTypes],
  );

  const INITIAL_PAGE_SIZE = 10;
  const NEXT_PAGE_SIZE = 12;

  const currentUserId = currentUser?.id;
  const currentUsername = currentUser?.username ?? null;

  const magicQuery = useInfinitePosts({
    limit: INITIAL_PAGE_SIZE,
    feed: baseFeed,
    by: "magic",
    allowed_tags: allowedTags || undefined,
  }, { pageLimit: NEXT_PAGE_SIZE });

  const latestQuery = useInfinitePosts({
    limit: INITIAL_PAGE_SIZE,
    feed: baseFeed,
    by: "newest",
    allowed_tags: allowedTags || undefined,
  }, { enabled: latestTabActivated, pageLimit: NEXT_PAGE_SIZE });

  const postEditOverrides = usePostEditStore((s) => s.overrides);
  const transformedPageCacheRef = useRef(new WeakMap<object, Post[]>());

  const feedRefreshParamsList = useMemo(() => [
    {
      feed: baseFeed,
      by: "magic" as const,
      allowed_tags: allowedTags || undefined,
      limit: INITIAL_PAGE_SIZE,
      address: currentUser?.walletAddress,
    },
    ...(latestTabActivated ? [{
      feed: baseFeed as "home" | "following",
      by: "newest" as const,
      allowed_tags: allowedTags || undefined,
      limit: INITIAL_PAGE_SIZE,
      address: currentUser?.walletAddress,
    }] : []),
  ], [baseFeed, allowedTags, currentUser?.walletAddress, latestTabActivated]);

  const handleRefreshComplete = useCallback(() => {
    transformedPageCacheRef.current = new WeakMap();
  }, []);

  usePostDataRefresher({
    feedParamsList: feedRefreshParamsList,
    onRefreshComplete: handleRefreshComplete,
  });

  const applyPostEditOverrides = useCallback(
    (posts: any[]) => {
      if (Object.keys(postEditOverrides).length === 0) return posts;
      return posts.map((post: any) => {
        const ov = postEditOverrides[post.post_id];
        if (!ov) return post;
        return { ...post, title: ov.title, content: ov.content, topic: ov.topic ?? post.topic, media: ov.media ?? post.media };
      });
    },
    [postEditOverrides],
  );

  useEffect(() => {
    transformedPageCacheRef.current = new WeakMap();
  }, [
    applyPostEditOverrides,
    blockedTopicNames,
    blockedUserIds,
    currentUserId,
    currentUsername,
    hiddenPostIds,
    hideDownvotedPosts,
  ]);

  const transformPosts = useCallback(
    (data: { pages?: { posts: any[] }[] } | undefined) => {
      if (!data?.pages) return [];
      const uniquePostIds = new Set<string>();
      const transformedPosts: Post[] = [];

      for (const page of data.pages) {
        let cachedPagePosts = transformedPageCacheRef.current.get(page);

        if (!cachedPagePosts) {
          const pagePosts = hideDownvotedPosts
            ? page.posts.filter((post) => post.user_vote !== -1)
            : page.posts;

          const patchedPosts = applyPostEditOverrides(pagePosts);

          cachedPagePosts = transformApiPosts(patchedPosts, {
            currentUser: currentUserId
              ? { id: currentUserId, username: currentUsername }
              : undefined,
          }).filter(
            (post) =>
              !hiddenPostIds.has(post.id) &&
              !blockedUserIds.has(post.author.id) &&
              !(post.topic && blockedTopicNames.has(post.topic.toLowerCase())),
          );

          transformedPageCacheRef.current.set(page, cachedPagePosts);
        }

        for (const post of cachedPagePosts) {
          if (uniquePostIds.has(post.id)) continue;
          uniquePostIds.add(post.id);
          transformedPosts.push(post);
        }
      }

      return transformedPosts;
    },
    [
      applyPostEditOverrides,
      blockedTopicNames,
      blockedUserIds,
      currentUserId,
      currentUsername,
      hiddenPostIds,
      hideDownvotedPosts,
    ],
  );

  const magicPosts = useMemo(
    () => {
      const posts = transformPosts(magicQuery.data);
      if (baseFeed !== "following") return posts;
      return posts.filter(
        (post) =>
          followedUsers.has(post.author.id) ||
          (post.topic && followedTopics.has(post.topic)),
      );
    },
    [magicQuery.data, transformPosts, baseFeed, followedUsers, followedTopics],
  );

  const latestPosts = useMemo(
    () => {
      const posts = transformPosts(latestQuery.data);
      if (baseFeed !== "following") return posts;
      return posts.filter(
        (post) =>
          followedUsers.has(post.author.id) ||
          (post.topic && followedTopics.has(post.topic)),
      );
    },
    [latestQuery.data, transformPosts, baseFeed, followedUsers, followedTopics],
  );

  const handleRefresh = useCallback(async (options?: { fetchAllNew?: boolean; silent?: boolean }) => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    if (!options?.silent) {
      dismissNewPostsRef.current?.();
      setIsRefreshing(true);
      onRefreshingChange?.(true);
    }
    try {
      const sortBy = activeTabIndexRef.current === 0 ? "magic" : "newest";

      const postsQueryKey = queryKeys.posts({
        limit: INITIAL_PAGE_SIZE,
        feed: baseFeed,
        by: sortBy as any,
        allowed_tags: allowedTags || undefined,
        address: currentUser?.walletAddress,
        page: undefined,
      });

      const fetchPage = (page: number) =>
        getPosts({
          limit: page === 1 ? INITIAL_PAGE_SIZE : NEXT_PAGE_SIZE,
          feed: baseFeed,
          by: sortBy as any,
          allowed_tags: allowedTags || undefined,
          address: currentUser?.walletAddress,
          page,
        });

      const newFirstPage = await fetchPage(1);

      if (options?.fetchAllNew) {
        const existingData: any = queryClient.getQueryData(postsQueryKey);
        const existingIds = new Set<string>();
        if (existingData?.pages) {
          for (const page of existingData.pages) {
            for (const post of page.posts) {
              existingIds.add(post.post_id);
            }
          }
        }

        if (existingIds.size === 0) {
          queryClient.setQueryData(postsQueryKey, {
            pages: [newFirstPage],
            pageParams: [1],
          });
        } else {
        const newPages = [newFirstPage];
        const newPageParams = [1];
        let hasOverlap = newFirstPage.posts.some((p: any) => existingIds.has(p.post_id));
        let nextPage = 2;
        const MAX_PAGES = 10;

        while (!hasOverlap && newFirstPage.has_more && nextPage <= MAX_PAGES) {
          const page = await fetchPage(nextPage);
          newPages.push(page);
          newPageParams.push(nextPage);
          hasOverlap = page.posts.some((p: any) => existingIds.has(p.post_id));
          if (!page.has_more) break;
          nextPage++;
        }

        queryClient.setQueryData(postsQueryKey, {
          pages: newPages,
          pageParams: newPageParams,
        });
        }
      } else {
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
      }

      if (currentUser?.walletAddress) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.rewardSummary(currentUser.walletAddress),
        });
      }
    } catch (error) {
      Sentry.addBreadcrumb({ category: "home-feed", message: "Feed refresh failed", data: { error: String(error) }, level: "error" });
    } finally {
      isRefreshingRef.current = false;
      if (!options?.silent) {
        setIsRefreshing(false);
        onRefreshingChange?.(false);
      }
    }
  }, [
    baseFeed,
    allowedTags,
    currentUser?.walletAddress,
    INITIAL_PAGE_SIZE,
    NEXT_PAGE_SIZE,
    queryClient,
    onRefreshingChange,
  ]);
  handleRefreshRef.current = handleRefresh;

  const scrollToTop = useCallback((tabIndex?: number, options?: { animated?: boolean }) => {
    try {
      activeListRef.current?.scrollToOffset({ offset: 0, animated: options?.animated ?? true });
    } catch {}
    if (Platform.OS === "android") {
      requestAnimationFrame(() => {
        try {
          activeListRef.current?.scrollToOffset({ offset: 0, animated: false });
        } catch {}
      });
    }
  }, []);

  const scrollToTopAndRefresh = useCallback(async () => {
    try {
      activeListRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch {}
    dismissNewPostsRef.current?.();
    await handleRefreshRef.current?.();
    requestAnimationFrame(() => {
      try {
        activeListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch {}
      setTimeout(() => {
        try {
          activeListRef.current?.scrollToOffset({ offset: 0, animated: false });
        } catch {}
      }, 100);
    });
  }, []);

  useEffect(() => {
    const register = baseFeed === "home" ? registerHomeRefresh : registerFollowingRefresh;
    register(scrollToTopAndRefresh);
  }, [baseFeed, registerHomeRefresh, registerFollowingRefresh, scrollToTopAndRefresh]);

  const activeSortBy = activeTabIndex === 0 ? "magic" : "newest";
  const activeQuery = activeTabIndex === 0 ? magicQuery : latestQuery;

  const latestPostTimestamp = useMemo(() => {
    const pages = activeQuery.data?.pages;
    if (!pages || pages.length === 0) return null;
    const firstPage = pages[0];
    if (!firstPage.posts || firstPage.posts.length === 0) return null;
    let maxTs = 0;
    for (const post of firstPage.posts) {
      if (post.timestamp > maxTs) maxTs = post.timestamp;
    }
    return maxTs > 0 ? maxTs : null;
  }, [activeQuery.data?.pages]);

  const { hasNewPosts, newPostAvatars, newPostCount, dismiss: dismissNewPosts, resetBaseline, checkNow } = useNewPostsChecker({
    feed: baseFeed,
    by: activeSortBy as "magic" | "newest",
    allowed_tags: allowedTags || undefined,
    enabled: true,
    latestPostTimestamp,
  });
  dismissNewPostsRef.current = dismissNewPosts;

  useEffect(() => {
    onNewPostsChange?.(hasNewPosts, newPostAvatars, newPostCount);
  }, [hasNewPosts, newPostAvatars, newPostCount, onNewPostsChange]);

  const handleNewPostsPress = useCallback(async () => {
    try {
      activeListRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch {}

    showBars();

    const minDelay = new Promise<void>((r) => setTimeout(r, 600));
    await Promise.all([handleRefreshRef.current?.({ silent: true, fetchAllNew: true }), minDelay]);

    requestAnimationFrame(() => {
      try {
        activeListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } catch {}
      showBars();
    });
    resetBaseline(null);
  }, [showBars, resetBaseline]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop,
      refresh: handleRefresh,
      isRefreshing: () => isRefreshingRef.current,
      hasNewPosts: () => hasNewPosts,
      handleNewPostsPress,
      dismissNewPosts,
      checkNewPosts: checkNow,
    }),
    [scrollToTop, handleRefresh, hasNewPosts, handleNewPostsPress, dismissNewPosts, checkNow],
  );

  const lastMagicFetchTime = useRef(0);
  const isMagicFetching = useRef(false);
  const magicFetchTaskRef = useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);

  const lastLatestFetchTime = useRef(0);
  const isLatestFetching = useRef(false);
  const latestFetchTaskRef = useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);

  const PREFETCH_THRESHOLD = 6;
  const PAGE_SIZE = NEXT_PAGE_SIZE;

  const magicQueryRef = useRef(magicQuery);
  magicQueryRef.current = magicQuery;
  const magicPostsLengthRef = useRef(magicPosts.length);
  magicPostsLengthRef.current = magicPosts.length;

  const latestQueryRef = useRef(latestQuery);
  latestQueryRef.current = latestQuery;
  const latestPostsLengthRef = useRef(latestPosts.length);
  latestPostsLengthRef.current = latestPosts.length;

  useEffect(() => {
    return () => {
      magicFetchTaskRef.current?.cancel();
      latestFetchTaskRef.current?.cancel();
    };
  }, []);

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
      const runFetch = () => {
        magicFetchTaskRef.current = null;
        const latestQuery = magicQueryRef.current;
        if (!latestQuery.hasNextPage || latestQuery.isFetchingNextPage) {
          isMagicFetching.current = false;
          return;
        }
        latestQuery.fetchNextPage().finally(() => {
          isMagicFetching.current = false;
        });
      };

      magicFetchTaskRef.current?.cancel();
      runFetch();
    }
  }, [PAGE_SIZE, PREFETCH_THRESHOLD]);

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
      const runFetch = () => {
        latestFetchTaskRef.current = null;
        const latestQuery = latestQueryRef.current;
        if (!latestQuery.hasNextPage || latestQuery.isFetchingNextPage) {
          isLatestFetching.current = false;
          return;
        }
        latestQuery.fetchNextPage().finally(() => {
          isLatestFetching.current = false;
        });
      };

      latestFetchTaskRef.current?.cancel();
      runFetch();
    }
  }, [PAGE_SIZE, PREFETCH_THRESHOLD]);

  const createListEmptyComponent = useCallback(
    (isLoading: boolean, isError: boolean, errorMessage?: string) => {
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
              {errorMessage || "Something went wrong. Pull to refresh."}
            </Text>
          </Box>
        );
      }

      return (
        <Box flex center p="lg" style={{ paddingTop: 100 }}>
          <Text size="xxl" weight="medium" mode="subtle">
            {baseFeed === "following" ? "No posts available" : "No posts yet"}
          </Text>
          <Text
            size="md"
            mode="subtle"
            style={{ marginTop: 8, textAlign: "center" }}
          >
            {baseFeed === "following" ? (
              <>
                <Text size="md" weight="bold">
                  Only posts from topics and people you follow.
                </Text>
                {
                  " A focused view of your communities without discovery content."
                }
              </>
            ) : (
              "Be the first to share something interesting!"
            )}
          </Text>
        </Box>
      );
    },
    [baseFeed],
  );

  const activeQueryLoading = activeTabIndex === 0 ? magicQuery.isLoading : latestQuery.isLoading;
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!initialLoadDone.current && !activeQueryLoading) {
      initialLoadDone.current = true;
      requestAnimationFrame(() => {
        try {
          activeListRef.current?.scrollToOffset({ offset: 0, animated: false });
        } catch {}
        showBars();
      });
    }
  }, [activeQueryLoading, activeTabIndex, showBars]);

  const showHeaderSpinner = isRefreshing && !activeQueryLoading;
  const showQuests = baseFeed === "home" && activeTabIndex === 0;

  const ListHeader = useMemo(() => (
    <>
      {ListHeaderExtra}
      {showHeaderSpinner && (
        <Box center p="md">
          <ActivityIndicator
            size="small"
            color={theme.colors.text.subtle}
          />
        </Box>
      )}
      {showQuests && <QuestsSummaryCard />}
    </>
  ), [
    ListHeaderExtra,
    showHeaderSpinner,
    showQuests,
    theme.colors.text.subtle,
  ]);

  const isFetchingNext = activeTabIndex === 0 ? magicQuery.isFetchingNextPage : latestQuery.isFetchingNextPage;

  const ListFooter = useMemo(() => {
    if (isFetchingNext) {
      return <PostCardSkeleton showMedia={false} showBody={true} />;
    }
    return <Box p="sm" />;
  }, [isFetchingNext]);

  const listContentStyle = useMemo(
    () => ({
      paddingTop: insets.top + HEADER_HEIGHT,
      paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
      flexGrow: 1,
    }),
    [insets.bottom, insets.top],
  );

  const progressViewOffset = insets.top + HEADER_HEIGHT;

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        tintColor="transparent"
        colors={["transparent"]}
        progressViewOffset={progressViewOffset}
      />
    ),
    [handleRefresh, progressViewOffset, isRefreshing],
  );

  const posts = activeTabIndex === 0 ? magicPosts : latestPosts;
  const query = activeTabIndex === 0 ? magicQuery : latestQuery;
  const tabListRef = activeTabIndex === 0 ? magicListRef : latestListRef;
  const combinedRefCallback = useCallback((instance: FlashListRef<Post> | null) => {
    tabListRef.current = instance;
    activeListRef.current = instance;
  }, [tabListRef]);
  const onItemVisible =
    activeTabIndex === 0 ? handleMagicItemVisible : handleLatestItemVisible;

  const ListEmpty = useMemo(
    () =>
      createListEmptyComponent(
        query.isLoading,
        query.isError,
        query.error?.message,
      ),
    [createListEmptyComponent, query.isLoading, query.isError, query.error?.message],
  );

  return (
    <HomePostList
      ref={combinedRefCallback}
      data={posts}
      contentContainerStyle={listContentStyle}
      onScroll={scrollHandler}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      ListFooterComponent={ListFooter}
      refreshControl={refreshControl}
      feedScreen={baseFeed}
      onItemVisible={onItemVisible}
    />
  );
});

HomeTabbedFeed.displayName = "HomeTabbedFeed";
