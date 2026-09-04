import { useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/react-native";
import {
  InteractionManager,
  Platform,
} from "react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getPosts,
  queryKeys,
  type PostsResponse,
} from "@/src/api";
import {
  fetchAndMergeInfinitePostsRefresh,
  type InfinitePostsData,
} from "@/src/api/cache/merge-infinite-posts-refresh";
import { invalidateRewardSummary } from "@/src/api/cache/reward-summary-cache";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAndroidPullIndicator } from "@/src/hooks/use-android-pull-indicator";
import { collectPostIdsFromPages } from "@/src/hooks/new-posts-check";
import {
  useNewPostsChecker,
  type NewPostAvatar,
} from "@/src/hooks/use-new-posts-checker";
import { useScrollAnimationContext } from "@/src/providers/scroll-animation-context";
import {
  getAllowedTagsFromContentTypes,
  useFeedScrollStore,
  usePreferencesStore,
  useTimeTickStore,
} from "@/src/stores";
import { useFeedPostCardRuntime } from "./feed-post-card-runtime";
import { scrollFeedListToTop, type FeedListRef } from "./feed-list-scroll";
import {
  createChainedTaskQueue,
  getHomeFeedContext,
  getLatestPostTimestamp,
  INITIAL_PAGE_SIZE,
  NEXT_PAGE_SIZE,
  selectHomeFeedTab,
  shouldAutoFillFollowingFeed,
  shouldPrefetchNextPage,
} from "./home-tabbed-feed-state";
import { useHomeTabbedFeedPosts } from "./use-home-tabbed-feed-posts";

const coldStartCheckedFeedKeys = new Set<string>();

type FeedRefreshOptions = {
  fetchAllNew?: boolean;
  silent?: boolean;
  skipHaptic?: boolean;
  prefetchedFirstPage?: PostsResponse | null;
};

export type HomeTabbedFeedControllerRef = {
  scrollToTop: (tabIndex?: number, options?: { animated?: boolean }) => void;
  refresh: (options?: FeedRefreshOptions) => Promise<void>;
  isRefreshing: () => boolean;
  hasNewPosts: () => boolean;
  handleNewPostsPress: () => Promise<void>;
  dismissNewPosts: () => void;
  checkNewPosts: () => void;
  resetBaseline: (newTimestamp: number | null) => void;
};

type ControllerOptions = {
  baseFeed: "home" | "following";
  activeTabIndex: number;
  onRefreshingChange?: (refreshing: boolean) => void;
  onNewPostsChange?: (
    hasNew: boolean,
    avatars: NewPostAvatar[],
    count: number,
  ) => void;
};

export function useHomeTabbedFeedController({
  baseFeed,
  activeTabIndex,
  onRefreshingChange,
  onNewPostsChange,
}: ControllerOptions) {
  const queryClient = useQueryClient();
  const {
    scrollHandler,
    scrollY,
    scrollOffsetY,
    registerRefreshTarget,
    showBars,
  } = useScrollAnimationContext();
  const setContextScrolling = useFeedScrollStore((state) => state.setContextScrolling);
  const selectedContentTypes = usePreferencesStore((state) => state.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((state) => state.adultContentEnabled);
  const apiServer = usePreferencesStore((state) => state.apiServer);
  const allowedTags = useMemo(
    () => getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled),
    [adultContentEnabled, selectedContentTypes],
  );
  const selection = selectHomeFeedTab(activeTabIndex);
  const feedContext = getHomeFeedContext(baseFeed, activeTabIndex);
  const feedRuntime = useFeedPostCardRuntime();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [latestTabActivated, setLatestTabActivated] = useState(activeTabIndex === 1);
  const isRefreshingRef = useRef(false);
  const activeTabIndexRef = useRef(activeTabIndex);
  activeTabIndexRef.current = activeTabIndex;
  const previousTabIndexRef = useRef(activeTabIndex);
  const latestTabRefreshedRef = useRef(false);
  const magicListRef = useRef<FeedListRef>(null);
  const latestListRef = useRef<FeedListRef>(null);
  const activeListRef = useRef<FeedListRef>(null);
  const dismissNewPostsRef = useRef<(() => void) | null>(null);
  const refreshRef = useRef<((options?: FeedRefreshOptions) => Promise<void>) | null>(null);
  const enqueueRefresh = useMemo(() => createChainedTaskQueue(), []);

  const {
    clearTransformedPageCache,
    currentUser,
    latestPosts,
    latestQuery,
    magicPosts,
    magicQuery,
  } = useHomeTabbedFeedPosts({
    baseFeed,
    allowedTags,
    latestTabActivated,
    showBars,
  });
  const posts = activeTabIndex === 0 ? magicPosts : latestPosts;
  const query = activeTabIndex === 0 ? magicQuery : latestQuery;

  const triggerPullRefresh = useCallback(() => {
    Sentry.addBreadcrumb({
      category: "home-feed",
      message: "Android pull-to-refresh triggered",
      level: "info",
      data: {
        feed: baseFeed,
        tab: selectHomeFeedTab(activeTabIndexRef.current).key,
      },
    });
    void refreshRef.current?.();
  }, [baseFeed]);
  const { pullDistance, pullGesture } = useAndroidPullIndicator({
    scrollY: scrollOffsetY,
    refreshing: isRefreshing,
    onTriggerRefresh: triggerPullRefresh,
  });

  useEffect(() => {
    if (previousTabIndexRef.current === activeTabIndex) return;
    const oldContext = getHomeFeedContext(baseFeed, previousTabIndexRef.current);
    feedRuntime.setVideoViewability(new Set(), null);
    setContextScrolling(oldContext, false);
    setContextScrolling(feedContext, false);
    previousTabIndexRef.current = activeTabIndex;
    if (activeTabIndex === 1) setLatestTabActivated(true);
    showBars();
    scrollOffsetY.value = 0;
    requestAnimationFrame(() => {
      void scrollFeedListToTop(activeListRef.current);
    });
    if (activeTabIndex === 1 && !latestTabRefreshedRef.current) {
      latestTabRefreshedRef.current = true;
      setTimeout(() => refreshRef.current?.(), 100);
    }
  }, [
    activeTabIndex,
    baseFeed,
    feedContext,
    feedRuntime,
    scrollOffsetY,
    setContextScrolling,
    showBars,
  ]);

  const runRefresh = useCallback(async (options?: FeedRefreshOptions) => {
    isRefreshingRef.current = true;
    clearTransformedPageCache();
    if (!options?.silent) {
      if (Platform.OS === "android" && !options?.skipHaptic) triggerHaptic("light");
      dismissNewPostsRef.current?.();
      setIsRefreshing(true);
      onRefreshingChange?.(true);
    }
    const activeSelection = selectHomeFeedTab(activeTabIndexRef.current);
    const queryKey = queryKeys.posts({
      limit: INITIAL_PAGE_SIZE,
      feed: baseFeed,
      by: activeSelection.querySort,
      allowed_tags: allowedTags || undefined,
      address: currentUser?.walletAddress,
      page: undefined,
    });
    try {
      Sentry.addBreadcrumb({
        category: "home-feed",
        message: "Feed refresh requested",
        level: "info",
        data: {
          feed: baseFeed,
          sort: activeSelection.querySort,
          fetchAllNew: Boolean(options?.fetchAllNew),
          silent: Boolean(options?.silent),
          hasAddress: Boolean(currentUser?.walletAddress),
        },
      });
      const fetchPage = (page: number) => getPosts({
        limit: page === 1 ? INITIAL_PAGE_SIZE : NEXT_PAGE_SIZE,
        feed: baseFeed,
        by: activeSelection.querySort,
        allowed_tags: allowedTags || undefined,
        address: currentUser?.walletAddress,
        page,
      });
      const existingData = queryClient.getQueryData<InfinitePostsData>(queryKey);
      const refreshMode = activeSelection.querySort === "newest"
        ? "prepend"
        : "replace-top";
      const { data, refreshedPageCount } = await fetchAndMergeInfinitePostsRefresh({
        existing: existingData,
        fetchPage,
        fetchAllNew: Boolean(options?.fetchAllNew),
        mode: refreshMode,
        firstPage: options?.prefetchedFirstPage,
      });
      if (
        refreshMode === "prepend" &&
        (existingData?.pages.length ?? 0) > 1 &&
        data.pages.length < (existingData?.pages.length ?? 0)
      ) {
        Sentry.captureMessage("Stale cached latest feed pages discarded", {
          level: "warning",
          tags: { feature: "home-feed", feed: baseFeed, sort: activeSelection.querySort },
          extra: {
            cachedPageCount: existingData?.pages.length ?? 0,
            refreshedPageCount,
            firstPagePostCount: data.pages[0]?.posts.length ?? 0,
            hasAddress: Boolean(currentUser?.walletAddress),
          },
        });
      }
      queryClient.setQueryData(queryKey, data);
      const newFirstPage = data.pages[0];
      if (currentUser?.walletAddress) {
        void invalidateRewardSummary(queryClient, currentUser.walletAddress);
      }
      Sentry.addBreadcrumb({
        category: "home-feed",
        message: "Feed refresh completed",
        level: "info",
        data: {
          feed: baseFeed,
          sort: activeSelection.querySort,
          firstPagePostCount: newFirstPage?.posts.length ?? 0,
          refreshedPageCount,
          hasMore: newFirstPage?.has_more ?? false,
        },
      });
    } catch (error) {
      Sentry.addBreadcrumb({
        category: "home-feed",
        message: "Feed refresh failed",
        data: { error: String(error) },
        level: "error",
      });
      Sentry.captureException(error, {
        tags: { feature: "home-feed", operation: "feed-refresh" },
      });
    } finally {
      isRefreshingRef.current = false;
      useTimeTickStore.getState().bump();
      if (!options?.silent) {
        setIsRefreshing(false);
        onRefreshingChange?.(false);
      }
    }
  }, [
    allowedTags,
    baseFeed,
    clearTransformedPageCache,
    currentUser?.walletAddress,
    onRefreshingChange,
    queryClient,
  ]);
  const handleRefresh = useCallback((options?: FeedRefreshOptions) => {
    // Never drop a concurrent pull-refresh or New Posts tap; serialize them
    // so the latest explicit refresh still runs (BUG-012).
    return enqueueRefresh(() => runRefresh(options));
  }, [enqueueRefresh, runRefresh]);
  refreshRef.current = handleRefresh;

  const scrollToTop = useCallback((
    _tabIndex?: number,
    options?: { animated?: boolean },
  ) => {
    void scrollFeedListToTop(activeListRef.current, {
      animated: options?.animated ?? true,
    });
  }, []);
  const scrollToTopAndRefresh = useCallback(async () => {
    await scrollFeedListToTop(activeListRef.current);
    dismissNewPostsRef.current?.();
    await refreshRef.current?.();
    await scrollFeedListToTop(activeListRef.current);
  }, []);
  useEffect(() => {
    return registerRefreshTarget(baseFeed, scrollToTopAndRefresh);
  }, [baseFeed, registerRefreshTarget, scrollToTopAndRefresh]);

  const latestPostTimestamp = useMemo(
    () => getLatestPostTimestamp(query.data?.pages),
    [query.data?.pages],
  );
  const knownPostIds = useMemo(
    () => collectPostIdsFromPages(query.data?.pages),
    [query.data?.pages],
  );
  const {
    hasNewPosts,
    newPostAvatars,
    newPostCount,
    dismiss: dismissNewPosts,
    resetBaseline,
    checkNow,
    getPrefetchedNewPostsResponse,
  } = useNewPostsChecker({
    feed: baseFeed,
    by: selection.querySort,
    allowed_tags: allowedTags || undefined,
    enabled: true,
    latestPostTimestamp,
    knownPostIds,
  });
  dismissNewPostsRef.current = dismissNewPosts;
  useEffect(() => {
    onNewPostsChange?.(hasNewPosts, newPostAvatars, newPostCount);
  }, [hasNewPosts, newPostAvatars, newPostCount, onNewPostsChange]);

  const applyNewPosts = useCallback(async (options?: { scrollToTop?: boolean }) => {
    const shouldScrollToTop = options?.scrollToTop !== false;
    if (shouldScrollToTop) {
      showBars();
    }
    const prefetchedFirstPage = getPrefetchedNewPostsResponse();
    await refreshRef.current?.({
      silent: true,
      fetchAllNew: true,
      prefetchedFirstPage,
    });
    if (shouldScrollToTop) {
      await scrollFeedListToTop(activeListRef.current);
      showBars();
    }
    resetBaseline(null);
  }, [getPrefetchedNewPostsResponse, resetBaseline, showBars]);
  const handleNewPostsPress = useCallback(
    () => applyNewPosts({ scrollToTop: true }),
    [applyNewPosts],
  );

  const fetchStateRef = useRef({
    magic: { lastFetchTime: 0, fetching: false },
    latest: { lastFetchTime: 0, fetching: false },
  });
  const magicQueryRef = useRef(magicQuery);
  magicQueryRef.current = magicQuery;
  const latestQueryRef = useRef(latestQuery);
  latestQueryRef.current = latestQuery;
  const postLengthsRef = useRef({ magic: magicPosts.length, latest: latestPosts.length });
  postLengthsRef.current = { magic: magicPosts.length, latest: latestPosts.length };
  const createItemVisibleHandler = useCallback((tab: "magic" | "latest") => (
    index: number,
  ) => {
    if (!shouldPrefetchNextPage(index, postLengthsRef.current[tab])) return;
    const state = fetchStateRef.current[tab];
    const activeQuery = tab === "magic" ? magicQueryRef.current : latestQueryRef.current;
    const now = Date.now();
    if (
      !activeQuery.hasNextPage || activeQuery.isFetchingNextPage || state.fetching ||
      now - state.lastFetchTime <= 1000
    ) return;
    state.lastFetchTime = now;
    state.fetching = true;
    const latestQueryState = tab === "magic"
      ? magicQueryRef.current
      : latestQueryRef.current;
    if (!latestQueryState.hasNextPage || latestQueryState.isFetchingNextPage) {
      state.fetching = false;
      return;
    }
    latestQueryState.fetchNextPage().finally(() => {
      state.fetching = false;
    });
  }, []);
  const onItemVisible = useMemo(
    () => createItemVisibleHandler(selection.key),
    [createItemVisibleHandler, selection.key],
  );

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current || query.isLoading) return;
    initialLoadDone.current = true;
    requestAnimationFrame(() => {
      void scrollFeedListToTop(activeListRef.current);
      showBars();
    });
  }, [activeTabIndex, query.isLoading, showBars]);

  useEffect(() => {
    if (baseFeed !== "following") return;
    if (!shouldAutoFillFollowingFeed({
      renderedPostCount: posts.length,
      loadedPageCount: query.data?.pages.length ?? 0,
      hasNextPage: Boolean(query.hasNextPage),
      isFetching: query.isFetching,
      isFetchingNextPage: query.isFetchingNextPage,
    })) return;
    void query.fetchNextPage();
  }, [baseFeed, posts.length, query]);

  const coldStartCheckKey = `${feedContext}:${allowedTags ?? "all"}:${currentUser?.walletAddress ?? "anon"}`;
  useEffect(() => {
    if (coldStartCheckedFeedKeys.has(coldStartCheckKey)) return;
    if (posts.length === 0 || query.isPending || query.isFetching || query.isFetchedAfterMount) return;
    coldStartCheckedFeedKeys.add(coldStartCheckKey);
    Sentry.addBreadcrumb({
      category: "home-feed",
      message: "Cold-start cached feed new-post check started",
      level: "info",
      data: {
        feed: baseFeed,
        sort: selection.key,
        postCount: posts.length,
        dataUpdatedAt: query.dataUpdatedAt,
        hasAddress: Boolean(currentUser?.walletAddress),
      },
    });
    const timer = setTimeout(checkNow, 300);
    return () => clearTimeout(timer);
  }, [
    baseFeed,
    checkNow,
    coldStartCheckKey,
    currentUser?.walletAddress,
    posts.length,
    query.dataUpdatedAt,
    query.isFetchedAfterMount,
    query.isFetching,
    query.isPending,
    selection.key,
  ]);

  const seededFeedContextRef = useRef<string | null>(null);
  useEffect(() => {
    const seedKey = `${feedContext}:${apiServer}`;
    if (posts.length === 0) {
      if (seededFeedContextRef.current === seedKey) seededFeedContextRef.current = null;
      return;
    }
    if (seededFeedContextRef.current === seedKey) return;
    feedRuntime.setVideoViewability(new Set(), null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        const initialVisiblePosts = posts.slice(0, 5).filter(postHasPlayableVideo);
        seededFeedContextRef.current = seedKey;
        feedRuntime.setVideoViewability(
          new Set(initialVisiblePosts.map((post) => post.id)),
          initialVisiblePosts[0]?.id ?? null,
        );
      }, 1200);
    });
    return () => {
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [apiServer, feedContext, feedRuntime, posts]);

  const tabListRef = activeTabIndex === 0 ? magicListRef : latestListRef;
  const listRef = useCallback((instance: FeedListRef | null) => {
    tabListRef.current = instance;
    activeListRef.current = instance;
  }, [tabListRef]);

  return {
    apiServer,
    dismissNewPosts,
    checkNow,
    feedContext,
    handleNewPostsPress,
    handleRefresh,
    hasNewPosts,
    isRefreshing,
    isRefreshingRef,
    listRef,
    onItemVisible,
    posts,
    pullDistance,
    pullGesture,
    query,
    resetBaseline,
    scrollHandler,
    scrollToTop,
    scrollY,
  };
}
