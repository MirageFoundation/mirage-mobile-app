import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  type Ref,
  type ReactElement,
  type ComponentType,
} from "react";
import {
  Platform,
  type LayoutChangeEvent,
  type ListRenderItem,
  type ViewToken,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useComposedEventHandler,
} from "react-native-reanimated";
import type { Post } from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { useAppState } from "@/src/hooks";
import { HomePostCardItem } from "./home-post-card-item";
import { useFeedScrollStore, useTimeTickStore } from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import {
  recordViewableItems,
  pauseAllDwellTimers,
  resumeDwellTimers,
  resetSeenPostTracking,
  type SeenPostVisibility,
} from "@/src/services/seen-posts-tracker";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as ComponentType<any>,
);

const ESTIMATED_ITEM_SIZE = 420;
const ACTIVE_ZONE_TOP_RATIO = 0.08;
const ACTIVE_ZONE_BOTTOM_RATIO = 0.15;
const GLANCE_VISIBLE_RATIO = 0.4;
const DWELL_VISIBLE_RATIO = 0.4;

type HomePostListProps = {
  data: Post[];
  contentContainerStyle: object;
  onScroll?: (event: any) => void;
  ListHeaderComponent?: ComponentType<any> | ReactElement | null;
  ListEmptyComponent?: ComponentType<any> | ReactElement | null;
  ListFooterComponent?: ComponentType<any> | ReactElement | null;
  refreshControl?: ReactElement | null;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  feedScreen: "home" | "following" | "topic";
  feedContext: string;
  onItemVisible?: (index: number) => void;
};

const HomePostListInner = function HomePostListInner(
  {
    data,
    contentContainerStyle,
    onScroll,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
    refreshControl,
    onEndReached,
    onEndReachedThreshold,
    feedScreen,
    feedContext,
    onItemVisible,
  }: HomePostListProps,
  ref: Ref<FlashListRef<Post>>,
) {
  const setVideoViewability = useHomePostCardStore(
    (state) => state.setVideoViewability,
  );
  const onItemVisibleRef = useRef(onItemVisible);
  onItemVisibleRef.current = onItemVisible;

  const feedScreenRef = useRef(feedContext);
  feedScreenRef.current = feedContext;

  const listRef = useRef<FlashListRef<Post> | null>(null);
  const setListRef = useCallback((instance: FlashListRef<Post> | null) => {
    listRef.current = instance;
    if (typeof ref === "function") {
      ref(instance);
      return;
    }
    if (ref) {
      (ref as { current: FlashListRef<Post> | null }).current = instance;
    }
  }, [ref]);

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 20,
    minimumViewTime: 0,
  }).current;

  const pendingViewableRef = useRef<ViewToken[] | null>(null);
  const currentViewableTokensRef = useRef<Map<string, ViewToken>>(new Map());
  const scrollOffsetRef = useRef(0);
  const seenSyncFrameRef = useRef<number | null>(null);
  const deferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const retryRafRef = useRef<number | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const VIDEO_NEARBY_BUFFER = 3;
  const scrollStopHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMomentumScrollingRef = useRef(false);
  const hasReportedVisibleItemsRef = useRef(false);

  const cancelDeferredFlush = useCallback(() => {
    if (deferHandleRef.current === null) return;
    clearTimeout(deferHandleRef.current as ReturnType<typeof setTimeout>);
    deferHandleRef.current = null;
  }, []);

  const setFeedScrolling = useCallback((isScrolling: boolean) => {
    useFeedScrollStore.getState().setContextScrolling(feedContext, isScrolling);
  }, [feedContext]);

  const cancelScrollStop = useCallback(() => {
    if (scrollStopHandleRef.current === null) return;
    clearTimeout(scrollStopHandleRef.current);
    scrollStopHandleRef.current = null;
  }, []);

  const scheduleScrollStop = useCallback((delay = 140) => {
    cancelScrollStop();
    scrollStopHandleRef.current = setTimeout(() => {
      scrollStopHandleRef.current = null;
      if (!isMomentumScrollingRef.current) {
        setFeedScrolling(false);
      }
    }, delay);
  }, [cancelScrollStop, setFeedScrolling]);

  const computeSeenVisibility = useCallback((items: ViewToken[]): SeenPostVisibility[] => {
    const currentListRef = listRef.current;
    if (!currentListRef) return [];

    const windowSize = currentListRef.getWindowSize();
    const viewportHeight = windowSize.height;
    if (!viewportHeight) return [];

    const activeTop = viewportHeight * ACTIVE_ZONE_TOP_RATIO;
    const activeBottom = viewportHeight * (1 - ACTIVE_ZONE_BOTTOM_RATIO);
    const scrollOffset = currentListRef.getAbsoluteLastScrollOffset();
    scrollOffsetRef.current = scrollOffset;

    return items.flatMap((item) => {
      const id = item.item?.id;
      if (!item.isViewable || !id || item.index == null) return [];

      const layout = currentListRef.getLayout(item.index);
      if (!layout || layout.height <= 0) return [];

      const itemTop = layout.y - scrollOffset;
      const itemBottom = itemTop + layout.height;
      const overlap = Math.max(
        0,
        Math.min(itemBottom, activeBottom) - Math.max(itemTop, activeTop),
      );
      const visibleRatio = overlap / layout.height;

      return [{
        id,
        title: item.item.title,
        glanceVisible: visibleRatio >= GLANCE_VISIBLE_RATIO,
        dwellVisible: visibleRatio >= DWELL_VISIBLE_RATIO,
      }];
    });
  }, []);

  const syncSeenViewability = useCallback((items: ViewToken[]) => {
    recordViewableItems(computeSeenVisibility(items), feedContext);
  }, [computeSeenVisibility, feedContext]);

  const cancelSeenSync = useCallback(() => {
    if (seenSyncFrameRef.current === null) return;
    cancelAnimationFrame(seenSyncFrameRef.current);
    seenSyncFrameRef.current = null;
  }, []);

  const scheduleSeenSync = useCallback(() => {
    if (seenSyncFrameRef.current !== null) return;
    seenSyncFrameRef.current = requestAnimationFrame(() => {
      seenSyncFrameRef.current = null;
      syncSeenViewability(Array.from(currentViewableTokensRef.current.values()));
    });
  }, [syncSeenViewability]);

  const handleSeenScroll = useCallback((offsetY: number) => {
    scrollOffsetRef.current = offsetY;
    scheduleSeenSync();
  }, [scheduleSeenSync]);

  const localScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      runOnJS(handleSeenScroll)(event.contentOffset.y);
    },
  });

  const composedScrollHandler = useComposedEventHandler(
    onScroll ? [localScrollHandler, onScroll as any] : [localScrollHandler],
  );

  const handlePostLayout = useCallback((_postId: string, _event: LayoutChangeEvent) => {}, []);

  const flushViewability = useCallback(() => {
    const items = pendingViewableRef.current;
    if (!items) return;

    syncSeenViewability(items);

    const visibleItems = items.filter((item) => item.isViewable && item.item?.id);
    if (visibleItems.length === 0) {
      if (!hasReportedVisibleItemsRef.current) return;
      recordViewableItems([], feedContext);
      setVideoViewability(feedScreenRef.current, new Set(), null);
      return;
    }

    hasReportedVisibleItemsRef.current = true;
    const videoItems = visibleItems.filter(
      (item) => postHasPlayableVideo(item.item),
    );

    const visibleVideoIds = new Set(videoItems.map((item) => item.item.id));
    let activeId: string | null = null;

    if (videoItems.length > 0) {
      const sortedIndices = visibleItems
        .map((v) => v.index ?? 0)
        .sort((a, b) => a - b);
      const mid = Math.floor((sortedIndices.length - 1) / 2);
      const centerIndex = sortedIndices[mid] ?? 0;
      const visibleSpan = (sortedIndices[sortedIndices.length - 1] ?? 0) - (sortedIndices[0] ?? 0);
      const maxDist = Math.max(1, visibleSpan * 0.35);

      let best = videoItems[0];
      let bestDist = Math.abs((best.index ?? 0) - centerIndex);
      for (let i = 1; i < videoItems.length; i++) {
        const d = Math.abs((videoItems[i].index ?? 0) - centerIndex);
        if (d < bestDist) {
          best = videoItems[i];
          bestDist = d;
        }
      }
      activeId = bestDist <= maxDist ? best.item.id : null;
    }

    const allData = dataRef.current;
    const nearbyVideoIds = new Set(visibleVideoIds);
    if (allData.length > 0 && visibleItems.length > 0) {
      const indices = visibleItems.map((v) => v.index ?? 0);
      const minIdx = Math.min(...indices);
      const maxIdx = Math.max(...indices);
      const lo = Math.max(0, minIdx - VIDEO_NEARBY_BUFFER);
      const hi = Math.min(allData.length - 1, maxIdx + VIDEO_NEARBY_BUFFER);
      for (let i = lo; i <= hi; i++) {
        const p = allData[i];
        if (p && postHasPlayableVideo(p)) nearbyVideoIds.add(p.id);
      }
    }

    setVideoViewability(feedScreenRef.current, visibleVideoIds, activeId, nearbyVideoIds);

    const maxIndex = items.reduce((max, item) => {
      if (item.isViewable && item.index != null && item.index > max) return item.index;
      return max;
    }, -1);
    if (maxIndex >= 0) onItemVisibleRef.current?.(maxIndex);
  }, [feedContext, setVideoViewability, syncSeenViewability]);

  const itemVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems, changed }: { viewableItems: ViewToken[]; changed?: ViewToken[] }) => {
      let currentViewableItems: ViewToken[];

      if (changed && changed.length > 0) {
        const nextTokens = new Map(currentViewableTokensRef.current);
        for (const token of changed) {
          const id = token.item?.id;
          if (!id) continue;
          if (token.isViewable) {
            nextTokens.set(id, token);
          } else {
            nextTokens.delete(id);
          }
        }
        currentViewableTokensRef.current = nextTokens;
        currentViewableItems = Array.from(nextTokens.values());
      } else {
        const nextTokens = new Map<string, ViewToken>();
        for (const token of viewableItems) {
          const id = token.item?.id;
          if (!id || !token.isViewable) continue;
          nextTokens.set(id, token);
        }
        currentViewableTokensRef.current = nextTokens;
        currentViewableItems = Array.from(nextTokens.values());
      }

      pendingViewableRef.current = currentViewableItems;
      syncSeenViewability(currentViewableItems);

      const currentActive = useHomePostCardStore.getState().activeVideoPostIds[feedScreenRef.current];
      if (currentActive) {
        const stillVisible = currentViewableItems.some(
          (v) => v.isViewable && v.item?.id === currentActive,
        );
        if (!stillVisible) {
          useHomePostCardStore.getState().setActiveVideoPostId(feedScreenRef.current, null);
        }
      }

      const maxIndex = currentViewableItems.reduce((max, item) => {
        if (item.isViewable && item.index != null && item.index > max) return item.index;
        return max;
      }, -1);

      if (Platform.OS === "ios") {
        if (itemVisibleTimerRef.current) clearTimeout(itemVisibleTimerRef.current);
        itemVisibleTimerRef.current = setTimeout(() => {
          itemVisibleTimerRef.current = null;
          if (maxIndex >= 0) onItemVisibleRef.current?.(maxIndex);
          flushViewability();
        }, 200);
      } else {
        if (maxIndex >= 0) onItemVisibleRef.current?.(maxIndex);
        cancelDeferredFlush();
        deferHandleRef.current = setTimeout(() => {
          deferHandleRef.current = null;
          flushViewability();
        }, 150);
      }
    },
  ).current;

  useEffect(() => {
    return () => {
      cancelSeenSync();
      cancelDeferredFlush();
      cancelScrollStop();
      setFeedScrolling(false);
      resetSeenPostTracking(feedContext);
      if (itemVisibleTimerRef.current) {
        clearTimeout(itemVisibleTimerRef.current);
      }
    };
  }, [cancelDeferredFlush, cancelScrollStop, cancelSeenSync, feedContext, setFeedScrolling]);

  useEffect(() => {
    if (data.length !== 0) return;
    hasReportedVisibleItemsRef.current = false;
    currentViewableTokensRef.current = new Map();
    resetSeenPostTracking(feedContext);
    setVideoViewability(feedContext, new Set(), null);
  }, [data, feedContext, setVideoViewability]);

  const recomputeViewableFromLayout = useCallback(() => {
    const list = listRef.current;
    if (!list) return false;
    const windowSize = list.getWindowSize();
    const viewportHeight = windowSize.height;
    if (!viewportHeight) return false;
    const scrollOffset = list.getAbsoluteLastScrollOffset();
    scrollOffsetRef.current = scrollOffset;
    const currentData = dataRef.current;
    const nextTokens = new Map<string, ViewToken>();
    for (let index = 0; index < currentData.length; index++) {
      const item = currentData[index];
      if (!item?.id) continue;
      const layout = list.getLayout(index);
      if (!layout || layout.height <= 0) continue;
      const itemTop = layout.y - scrollOffset;
      const itemBottom = itemTop + layout.height;
      const overlapTop = Math.max(0, itemTop);
      const overlapBottom = Math.min(viewportHeight, itemBottom);
      const overlap = Math.max(0, overlapBottom - overlapTop);
      const ratio = overlap / layout.height;
      if (ratio >= 0.2) {
        nextTokens.set(item.id, {
          item,
          index,
          isViewable: true,
          key: item.id,
        } as unknown as ViewToken);
      }
    }
    currentViewableTokensRef.current = nextTokens;
    pendingViewableRef.current = Array.from(nextTokens.values());
    return true;
  }, []);

  useEffect(() => {
    if (data.length === 0) return;
    const validIds = new Set(data.map((post) => post.id));
    let removedStale = false;
    currentViewableTokensRef.current.forEach((_token, id) => {
      if (!validIds.has(id)) removedStale = true;
    });
    const activeId = useHomePostCardStore.getState().activeVideoPostIds[feedScreenRef.current];
    const activeMissing = !!activeId && !validIds.has(activeId);
    if (!removedStale && !activeMissing) return;

    cancelDeferredFlush();
    const tryRecompute = () => {
      if (recomputeViewableFromLayout()) {
        flushViewability();
        return true;
      }
      return false;
    };
    const raf1 = requestAnimationFrame(() => {
      if (tryRecompute()) return;
      const raf2 = requestAnimationFrame(() => {
        tryRecompute();
      });
      retryRafRef.current = raf2;
    });
    rafRef.current = raf1;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (retryRafRef.current != null) cancelAnimationFrame(retryRafRef.current);
      rafRef.current = null;
      retryRafRef.current = null;
    };
  }, [data, cancelDeferredFlush, flushViewability, recomputeViewableFromLayout]);

  const prevFeedContextRef = useRef(feedContext);

  useEffect(() => {
    if (prevFeedContextRef.current === feedContext) return;
    const previousFeedContext = prevFeedContextRef.current;
    prevFeedContextRef.current = feedContext;
    pendingViewableRef.current = null;
    currentViewableTokensRef.current = new Map();
    hasReportedVisibleItemsRef.current = false;
    resetSeenPostTracking(previousFeedContext);
    resetSeenPostTracking(feedContext);

    const timer = setTimeout(() => {
      if (pendingViewableRef.current) {
        flushViewability();
        return;
      }
      const currentData = dataRef.current;
      if (currentData.length === 0) return;
      const firstItems = currentData.slice(0, 5);
      const videoItems = firstItems.filter((item) => postHasPlayableVideo(item));
      if (videoItems.length === 0) return;
      const visibleVideoIds = new Set(videoItems.map((item) => item.id));
      setVideoViewability(feedContext, visibleVideoIds, videoItems[0].id);
    }, 300);
    return () => clearTimeout(timer);
  }, [feedContext, flushViewability, setVideoViewability]);

  useAppState({
    onBackground: () => {
      cancelDeferredFlush();
      cancelScrollStop();
      isMomentumScrollingRef.current = false;
      setFeedScrolling(false);
      if (itemVisibleTimerRef.current) {
        clearTimeout(itemVisibleTimerRef.current);
        itemVisibleTimerRef.current = null;
      }
      setVideoViewability(feedScreenRef.current, new Set(), null);
      pauseAllDwellTimers(feedContext);
      cancelSeenSync();
    },
    onForeground: () => {
      cancelDeferredFlush();
      resumeDwellTimers(feedContext);
      useTimeTickStore.getState().bump();
      if (itemVisibleTimerRef.current) {
        clearTimeout(itemVisibleTimerRef.current);
        itemVisibleTimerRef.current = null;
      }
      requestAnimationFrame(() => {
        scheduleSeenSync();
        flushViewability();
      });
    },
  });

  const renderItem = useCallback<ListRenderItem<Post>>(
    ({ item }) => (
      <HomePostCardItem
        post={item}
        feedScreen={feedScreen}
        feedContext={feedContext}
        onLayout={handlePostLayout}
      />
    ),
    [feedScreen, feedContext, handlePostLayout],
  );

  const keyExtractor = useMemo(() => (item: Post) => item.id, []);
  const getItemType = useCallback(
    (item: Post) => (item.media?.length ? "media-post" : "text-post"),
    [],
  );

  const handleScrollBeginDrag = useCallback(() => {
    cancelScrollStop();
    setFeedScrolling(true);
  }, [cancelScrollStop, setFeedScrolling]);

  const handleScrollEndDrag = useCallback(() => {
    scheduleScrollStop();
    requestAnimationFrame(() => {
      if (isMomentumScrollingRef.current) return;
      if (recomputeViewableFromLayout()) {
        flushViewability();
      }
    });
  }, [flushViewability, recomputeViewableFromLayout, scheduleScrollStop]);

  const handleMomentumScrollBegin = useCallback(() => {
    cancelScrollStop();
    isMomentumScrollingRef.current = true;
    setFeedScrolling(true);
  }, [cancelScrollStop, setFeedScrolling]);

  const handleMomentumScrollEnd = useCallback(() => {
    cancelDeferredFlush();
    cancelScrollStop();
    isMomentumScrollingRef.current = false;
    setFeedScrolling(false);
    if (Platform.OS === "ios") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          flushViewability();
        });
      });
    } else {
      deferHandleRef.current = setTimeout(() => {
        deferHandleRef.current = null;
        requestAnimationFrame(() => {
          flushViewability();
        });
      }, 50);
    }
  }, [cancelDeferredFlush, cancelScrollStop, flushViewability, setFeedScrolling]);

  return (
    <AnimatedFlashList
      ref={setListRef}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      estimatedItemSize={ESTIMATED_ITEM_SIZE}
      drawDistance={Platform.OS === "android" ? 1500 : 1200}
      onScroll={composedScrollHandler || onScroll}
      scrollEventThrottle={Platform.OS === "ios" ? 64 : 32}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle as any}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      refreshControl={refreshControl}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      onMomentumScrollBegin={handleMomentumScrollBegin}
      onMomentumScrollEnd={handleMomentumScrollEnd}
    />
  );
};

export const HomePostList = memo(forwardRef(HomePostListInner));
