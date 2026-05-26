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
  InteractionManager,
  Platform,
  RefreshControl,
  View,
} from "react-native";
import { IOSRefreshIndicator } from "@/src/components/atoms/refresh-indicator";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAndroidPullIndicator } from "@/src/hooks/use-android-pull-indicator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureDetector } from "react-native-gesture-handler";
import * as Sentry from "@sentry/react-native";

import {
  getPosts,
  queryKeys,
  transformApiPosts,
  useInfinitePosts,
} from "@/src/api";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
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
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  getAllowedTagsFromContentTypes,
  useAuthStore,
  useContentModerationStore,
  useFeedScrollStore,
  usePreferencesStore,
  useTimeTickStore,
} from "@/src/stores";
import { useQueryClient } from "@tanstack/react-query";
import { useNewPostsChecker, type NewPostAvatar } from "@/src/hooks/use-new-posts-checker";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";

const APP_STARTED_AT = Date.now();
const COLD_START_FEED_REFRESH_WINDOW_MS = 30_000;
const coldStartPromptedFeedKeys = new Set<string>();

type FeedRefreshOptions = {
  fetchAllNew?: boolean;
  silent?: boolean;
  skipHaptic?: boolean;
};

export type HomeTabbedFeedRef = {
  scrollToTop: (tabIndex?: number, options?: { animated?: boolean }) => void;
  refresh: (options?: FeedRefreshOptions) => Promise<void>;
  isRefreshing: () => boolean;
  hasNewPosts: () => boolean;
  handleNewPostsPress: () => Promise<void>;
  handleRefreshFeedPress: () => Promise<void>;
  dismissNewPosts: () => void;
  checkNewPosts: () => void;
  resetBaseline: (newTimestamp: number | null) => void;
};

type HomeTabbedFeedProps = {
  feedType: "home" | "following";
  activeTabIndex?: number;
  ListHeaderExtra?: ReactNode;
  onRefreshingChange?: (refreshing: boolean) => void;
  onNewPostsChange?: (hasNew: boolean, avatars: NewPostAvatar[], count: number) => void;
  onRefreshPromptChange?: (visible: boolean) => void;
};

export const HomeTabbedFeed = forwardRef<
  HomeTabbedFeedRef,
  HomeTabbedFeedProps
>(({ feedType: baseFeed, activeTabIndex = 0, ListHeaderExtra, onRefreshingChange, onNewPostsChange, onRefreshPromptChange }, ref) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { scrollHandler, scrollY, registerHomeRefresh, registerFollowingRefresh, showBars } = useScrollAnimationContext();
  const setContextScrolling = useFeedScrollStore((state) => state.setContextScrolling);

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
  const handleRefreshRef = useRef<((options?: FeedRefreshOptions) => Promise<void>) | null>(null);
  const triggerPullRefresh = useCallback(() => {
    handleRefreshRef.current?.();
  }, []);

  const { pullDistance, pullGesture } = useAndroidPullIndicator({
    scrollY,
    refreshing: isRefreshing,
    onTriggerRefresh: triggerPullRefresh,
  });

  useEffect(() => {
    if (prevTabIndexRef.current !== activeTabIndex) {
      const oldFeedContext = `${baseFeed}:${prevTabIndexRef.current === 0 ? "magic" : "latest"}`;
      const newFeedContext = `${baseFeed}:${activeTabIndex === 0 ? "magic" : "latest"}`;
      useHomePostCardStore.getState().setVideoViewability(oldFeedContext, new Set(), null);
      setContextScrolling(oldFeedContext, false);
      setContextScrolling(newFeedContext, false);

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
  }, [activeTabIndex, showBars, baseFeed, setContextScrolling]);

  const currentUser = useAuthStore((s) => s.user);
  const selectedContentTypes = usePreferencesStore(
    (s) => s.selectedContentTypes,
  );
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const hideDownvotedPosts = usePreferencesStore((s) => s.hideDownvotedPosts);
  const apiServer = usePreferencesStore((s) => s.apiServer);
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);
  const blockedTopicNames = useContentModerationStore((s) => s.blockedTopicNames);

  const allowedTags = useMemo(
    () => getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled),
    [selectedContentTypes, adultContentEnabled],
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

  const visibleTrackerKeys = useMemo(
    () => [`${baseFeed}:magic`, `${baseFeed}:latest`],
    [baseFeed],
  );

  const handleRefreshComplete = useCallback(() => {
    transformedPageCacheRef.current = new WeakMap();
  }, []);

  usePostDataRefresher({
    feedParamsList: feedRefreshParamsList,
    onRefreshComplete: handleRefreshComplete,
    visibleTrackerKeys,
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
    () => transformPosts(magicQuery.data),
    [magicQuery.data, transformPosts],
  );

  const latestPosts = useMemo(
    () => transformPosts(latestQuery.data),
    [latestQuery.data, transformPosts],
  );

  const handleRefresh = useCallback(async (options?: FeedRefreshOptions) => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    transformedPageCacheRef.current = new WeakMap();
    if (!options?.silent) {
      if (Platform.OS === "android" && !options?.skipHaptic) triggerHaptic("light");
      dismissNewPostsRef.current?.();
      onRefreshPromptChange?.(false);
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
          if (!oldData || sortBy === "magic") {
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
      useTimeTickStore.getState().bump();
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
    onRefreshPromptChange,
  ]);
  handleRefreshRef.current = handleRefresh;

  const scrollToTop = useCallback((tabIndex?: number, options?: { animated?: boolean }) => {
    try {
      activeListRef.current?.scrollToOffset({ offset: 0, animated: options?.animated ?? true });
    } catch {}
    // Some FlashList instances drop scroll commands while the screen is
    // unfocused (e.g. when arriving from another tab). Issuing a tiny
    // non-zero offset followed by 0 forces the list to re-layout its
    // viewport so the user doesn't see a blank screen until they touch it.
    requestAnimationFrame(() => {
      try {
        activeListRef.current?.scrollToOffset({ offset: 1, animated: false });
      } catch {}
      requestAnimationFrame(() => {
        try {
          activeListRef.current?.scrollToOffset({ offset: 0, animated: false });
          activeListRef.current?.recordInteraction();
        } catch {}
      });
    });
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
  const feedContext = `${baseFeed}:${activeTabIndex === 0 ? "magic" : "latest"}`;
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

  const handleRefreshFeedPress = useCallback(async () => {
    onRefreshPromptChange?.(false);
    await handleNewPostsPress();
  }, [handleNewPostsPress, onRefreshPromptChange]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop,
      refresh: handleRefresh,
      isRefreshing: () => isRefreshingRef.current,
      hasNewPosts: () => hasNewPosts,
      handleNewPostsPress,
      handleRefreshFeedPress,
      dismissNewPosts,
      checkNewPosts: checkNow,
      resetBaseline,
    }),
    [scrollToTop, handleRefresh, hasNewPosts, handleNewPostsPress, handleRefreshFeedPress, dismissNewPosts, checkNow, resetBaseline],
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

  const isIOS = Platform.OS === "ios";

  const ListHeader = useMemo(() => (
    <>
      {ListHeaderExtra}
      {showQuests && <QuestsSummaryCard />}
    </>
  ), [
    ListHeaderExtra,
    showQuests,
  ]);

  const isFetchingNext = activeTabIndex === 0 ? magicQuery.isFetchingNextPage : latestQuery.isFetchingNextPage;

  const activeTabPostsLen = activeTabIndex === 0 ? magicPosts.length : latestPosts.length;
  const ListFooter = useMemo(() => {
    if (isFetchingNext && activeTabPostsLen > 0) {
      return <PostCardSkeleton showMedia={false} showBody={true} />;
    }
    return <Box p="sm" />;
  }, [isFetchingNext, activeTabPostsLen]);

  const listContentStyle = useMemo(
    () => ({
      paddingTop: insets.top + HEADER_HEIGHT,
      paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
      flexGrow: 1,
    }),
    [insets.bottom, insets.top],
  );

  const progressViewOffset = insets.top + HEADER_HEIGHT;

  const refreshControl = useMemo(() => {
    if (!isIOS) return null;

    return (
      <RefreshControl
        refreshing={false}
        onRefresh={handleRefresh}
        tintColor="transparent"
        colors={["transparent"]}
        progressBackgroundColor="transparent"
        progressViewOffset={progressViewOffset}
      />
    );
  }, [handleRefresh, progressViewOffset, isIOS]);

  const posts = activeTabIndex === 0 ? magicPosts : latestPosts;
  const query = activeTabIndex === 0 ? magicQuery : latestQuery;
  const coldStartRefreshKey = `${feedContext}:${allowedTags ?? "all"}:${currentUser?.walletAddress ?? "anon"}`;
  const seededFeedContextRef = useRef<string | null>(null);

  useEffect(() => {
    if (baseFeed !== "following") return;
    if (posts.length >= INITIAL_PAGE_SIZE) return;
    if (!query.hasNextPage || query.isFetching || query.isFetchingNextPage) return;

    void query.fetchNextPage();
  }, [
    baseFeed,
    posts.length,
    query,
    query.hasNextPage,
    query.isFetching,
    query.isFetchingNextPage,
  ]);

  useEffect(() => {
    if (Date.now() - APP_STARTED_AT > COLD_START_FEED_REFRESH_WINDOW_MS) return;
    if (coldStartPromptedFeedKeys.has(coldStartRefreshKey)) return;
    if (posts.length === 0 || query.isPending || query.isFetching || query.isFetchedAfterMount) return;

    coldStartPromptedFeedKeys.add(coldStartRefreshKey);
    onRefreshPromptChange?.(true);

    Sentry.addBreadcrumb({
      category: "home-feed",
      message: "Cold-start cached feed refresh prompt shown",
      level: "info",
      data: {
        feed: baseFeed,
        sort: activeTabIndex === 0 ? "magic" : "latest",
        postCount: posts.length,
      },
    });
  }, [
    activeTabIndex,
    baseFeed,
    coldStartRefreshKey,
    onRefreshPromptChange,
    posts.length,
    query.isFetchedAfterMount,
    query.isFetching,
    query.isPending,
  ]);

  useEffect(() => {
    // Include apiServer in the seed key so visibility is re-seeded after a
    // server switch (posts get fully replaced with new IDs but feedContext
    // doesn't change, which would otherwise short-circuit seeding and leave
    // every feed video with isVisible/isActive=false → "stuck").
    const seedKey = `${feedContext}:${apiServer}`;
    if (posts.length === 0) {
      if (seededFeedContextRef.current === seedKey) {
        seededFeedContextRef.current = null;
      }
      return;
    }

    if (seededFeedContextRef.current === seedKey) return;
    seededFeedContextRef.current = seedKey;

    const initialVisiblePosts = posts.slice(0, 5).filter(postHasPlayableVideo);
    const visibleVideoIds = new Set(initialVisiblePosts.map((post) => post.id));
    const activeVideoId = initialVisiblePosts[0]?.id ?? null;

    useHomePostCardStore.getState().setVideoViewability(
      feedContext,
      visibleVideoIds,
      activeVideoId,
    );
  }, [feedContext, posts, apiServer]);

  const tabListRef = activeTabIndex === 0 ? magicListRef : latestListRef;
  const combinedRefCallback = useCallback((instance: FlashListRef<Post> | null) => {
    tabListRef.current = instance;
    activeListRef.current = instance;
  }, [tabListRef]);
  const onItemVisible =
    activeTabIndex === 0 ? handleMagicItemVisible : handleLatestItemVisible;

  const isStillFetchingInitial = query.isPending;
  const ListEmpty = useMemo(
    () =>
      createListEmptyComponent(
        isStillFetchingInitial,
        query.isError,
        query.error?.message,
      ),
    [createListEmptyComponent, isStillFetchingInitial, query.isError, query.error?.message],
  );

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={pullGesture}>
        <View style={{ flex: 1 }} collapsable={false}>
          <HomePostList
            key={`${feedContext}:${apiServer}`}
            ref={combinedRefCallback}
            data={posts}
            contentContainerStyle={listContentStyle}
            onScroll={scrollHandler}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={ListEmpty}
            ListFooterComponent={ListFooter}
            refreshControl={refreshControl}
            feedScreen={baseFeed}
            feedContext={feedContext}
            onItemVisible={onItemVisible}
          />
        </View>
      </GestureDetector>
      <IOSRefreshIndicator
        visible={showHeaderSpinner}
        topOffset={insets.top + HEADER_HEIGHT + 8}
        scrollY={scrollY}
        pullDistance={pullDistance}
      />
    </View>
  );
});

HomeTabbedFeed.displayName = "HomeTabbedFeed";
