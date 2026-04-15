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
  Dimensions,
  Platform,
  type LayoutChangeEvent,
  type ListRenderItem,
  type ViewToken,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import * as Sentry from "@sentry/react-native";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useComposedEventHandler,
  useSharedValue,
} from "react-native-reanimated";
import type { Post } from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { useAppState } from "@/src/hooks";
import { HomePostCardItem } from "./home-post-card-item";
import { useFeedScrollStore } from "@/src/stores";
import { useHomePostCardStore } from "./home-post-card-store";
import {
  recordViewableItems,
  pauseAllDwellTimers,
  resumeDwellTimers,
  type SeenPostVisibility,
} from "@/src/services/seen-posts-tracker";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as ComponentType<any>,
);

const ESTIMATED_ITEM_SIZE = 420;
const ACTIVE_ZONE_TOP_EXCLUDE = 0.08;
const ACTIVE_ZONE_BOTTOM_EXCLUDE = 0.15;
const GLANCE_VISIBILITY_PERCENT = 30;
const DWELL_VISIBILITY_PERCENT = 40;

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

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 20,
    minimumViewTime: 150,
  }).current;

  const pendingViewableRef = useRef<ViewToken[] | null>(null);
  const postLayoutMapRef = useRef(new Map<string, { y: number; height: number }>());
  const missingLayoutReportedRef = useRef(new Set<string>());
  const scrollOffsetRef = useRef(0);
  const deferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const VIDEO_NEARBY_BUFFER = 3;
  const scrollStopHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMomentumScrollingRef = useRef(false);
  const hasReportedVisibleItemsRef = useRef(false);
  const lastSeenSyncTs = useSharedValue(0);

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

  const computeSeenVisibility = useCallback((postId: string): SeenPostVisibility | null => {
    const layout = postLayoutMapRef.current.get(postId);
    if (!layout || layout.height <= 0) {
      if (!missingLayoutReportedRef.current.has(postId)) {
        missingLayoutReportedRef.current.add(postId);
        Sentry.addBreadcrumb({
          category: "seen-posts",
          message: "Skipped seen visibility sync due to missing post layout",
          level: "warning",
          data: {
            feedContext,
            feedScreen,
            postIdPrefix: postId.slice(0, 12),
          },
        });
      }
      return null;
    }

    const viewportHeight = Dimensions.get("window").height;
    const activeZoneTop = viewportHeight * ACTIVE_ZONE_TOP_EXCLUDE;
    const activeZoneBottom = viewportHeight * (1 - ACTIVE_ZONE_BOTTOM_EXCLUDE);
    const itemTop = layout.y - scrollOffsetRef.current;
    const itemBottom = itemTop + layout.height;
    const visibleHeight = Math.max(
      0,
      Math.min(itemBottom, activeZoneBottom) - Math.max(itemTop, activeZoneTop),
    );
    const visiblePercent = (visibleHeight / layout.height) * 100;

    return {
      id: postId,
      glanceVisible: visiblePercent >= GLANCE_VISIBILITY_PERCENT,
      dwellVisible: visiblePercent >= DWELL_VISIBILITY_PERCENT,
    };
  }, [feedContext, feedScreen]);

  const syncSeenViewability = useCallback((items: ViewToken[], scrollOffset?: number) => {
    if (typeof scrollOffset === "number") {
      scrollOffsetRef.current = scrollOffset;
    }

    const seenVisibility = items
      .filter((item) => item.isViewable && item.item?.id)
      .map((item) => computeSeenVisibility(item.item.id))
      .filter((item): item is SeenPostVisibility => item !== null);

    recordViewableItems(seenVisibility);
  }, [computeSeenVisibility]);

  const handleTrackedScroll = useCallback((scrollOffset: number) => {
    scrollOffsetRef.current = scrollOffset;
    if (pendingViewableRef.current) {
      syncSeenViewability(pendingViewableRef.current, scrollOffset);
    }
  }, [syncSeenViewability]);

  const trackingScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const nextOffset = event.contentOffset.y;
      const timeStamp = Date.now();
      if (timeStamp - lastSeenSyncTs.value < 80) {
        return;
      }
      lastSeenSyncTs.value = timeStamp;
      runOnJS(handleTrackedScroll)(nextOffset);
    },
  });

  const composedScrollHandler = useComposedEventHandler(
    onScroll ? [trackingScrollHandler, onScroll as any] : [trackingScrollHandler],
  );

  const handlePostLayout = useCallback((postId: string, event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    postLayoutMapRef.current.set(postId, { y, height });
    missingLayoutReportedRef.current.delete(postId);

    if (pendingViewableRef.current) {
      syncSeenViewability(pendingViewableRef.current);
    }
  }, [syncSeenViewability]);

  const flushViewability = useCallback(() => {
    const items = pendingViewableRef.current;
    if (!items) return;

    syncSeenViewability(items);

    const visibleItems = items.filter((item) => item.isViewable && item.item?.id);
    if (visibleItems.length === 0) {
      if (!hasReportedVisibleItemsRef.current) return;
      recordViewableItems([]);
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
  }, [setVideoViewability, syncSeenViewability]);

  const itemVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      pendingViewableRef.current = viewableItems;
      syncSeenViewability(viewableItems);

      const currentActive = useHomePostCardStore.getState().activeVideoPostIds[feedScreenRef.current];
      if (currentActive) {
        const stillVisible = viewableItems.some(
          (v) => v.isViewable && v.item?.id === currentActive,
        );
        if (!stillVisible) {
          useHomePostCardStore.getState().setActiveVideoPostId(feedScreenRef.current, null);
        }
      }

      const maxIndex = viewableItems.reduce((max, item) => {
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
      cancelDeferredFlush();
      cancelScrollStop();
      setFeedScrolling(false);
      recordViewableItems([]);
      if (itemVisibleTimerRef.current) {
        clearTimeout(itemVisibleTimerRef.current);
      }
    };
  }, [cancelDeferredFlush, cancelScrollStop, setFeedScrolling]);

  useEffect(() => {
    if (data.length !== 0) return;
    hasReportedVisibleItemsRef.current = false;
    postLayoutMapRef.current.clear();
    missingLayoutReportedRef.current.clear();
    recordViewableItems([]);
    setVideoViewability(feedContext, new Set(), null);
  }, [data, feedContext, setVideoViewability]);

  useEffect(() => {
    const postIds = new Set(data.map((item) => item.id));
    for (const postId of postLayoutMapRef.current.keys()) {
      if (!postIds.has(postId)) {
        postLayoutMapRef.current.delete(postId);
      }
    }
    for (const postId of missingLayoutReportedRef.current) {
      if (!postIds.has(postId)) {
        missingLayoutReportedRef.current.delete(postId);
      }
    }
  }, [data]);

  const prevFeedContextRef = useRef(feedContext);

  useEffect(() => {
    if (prevFeedContextRef.current === feedContext) return;
    prevFeedContextRef.current = feedContext;
    pendingViewableRef.current = null;
    hasReportedVisibleItemsRef.current = false;
    postLayoutMapRef.current.clear();
    missingLayoutReportedRef.current.clear();
    recordViewableItems([]);

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
      pauseAllDwellTimers();
    },
    onForeground: () => {
      cancelDeferredFlush();
      resumeDwellTimers();
      if (itemVisibleTimerRef.current) {
        clearTimeout(itemVisibleTimerRef.current);
        itemVisibleTimerRef.current = null;
      }
      requestAnimationFrame(() => {
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
  }, [scheduleScrollStop]);

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
      ref={ref}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      estimatedItemSize={ESTIMATED_ITEM_SIZE}
      drawDistance={Platform.OS === "android" ? 1500 : 1200}
      onScroll={composedScrollHandler}
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
