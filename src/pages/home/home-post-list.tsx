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
  type ListRenderItem,
  type ViewToken,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import Animated from "react-native-reanimated";
import type { Post } from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { useAppState } from "@/src/hooks";
import { HomePostCardItem } from "./home-post-card-item";
import { useFeedScrollStore } from "@/src/stores";
import { useHomePostCardStore } from "./home-post-card-store";
import { recordViewableItems, pauseAllDwellTimers, resumeDwellTimers } from "@/src/services/seen-posts-tracker";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as ComponentType<any>,
);

const ESTIMATED_ITEM_SIZE = 420;

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
  feedScreen: 'home' | 'following' | 'topic';
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
 ref: Ref<FlashListRef<Post>>
) {
  const setVideoViewability = useHomePostCardStore(
    (state) => state.setVideoViewability
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
  const deferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const flushViewability = useCallback(() => {
    const items = pendingViewableRef.current;
    if (!items) return;

    const visibleItems = items.filter((item) => item.isViewable && item.item?.id);
    if (visibleItems.length === 0) {
      if (!hasReportedVisibleItemsRef.current) return;
      setVideoViewability(feedScreenRef.current, new Set(), null);
      return;
    }
    hasReportedVisibleItemsRef.current = true;
    const videoItems = visibleItems.filter(
      (item) => postHasPlayableVideo(item.item)
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
        if (d < bestDist) { best = videoItems[i]; bestDist = d; }
      }
      activeId = bestDist <= maxDist ? best.item.id : null;
    }

    setVideoViewability(feedScreenRef.current, visibleVideoIds, activeId);

    const maxIndex = items.reduce((max, item) => {
      if (item.isViewable && item.index != null && item.index > max) return item.index;
      return max;
    }, -1);
    if (maxIndex >= 0) onItemVisibleRef.current?.(maxIndex);
  }, [setVideoViewability]);

  const itemVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      pendingViewableRef.current = viewableItems;

      const viewableIds = viewableItems
        .filter((v) => v.isViewable && v.item?.id)
        .map((v) => v.item.id);
      recordViewableItems(viewableIds);

      const currentActive = useHomePostCardStore.getState().activeVideoPostIds[feedScreenRef.current];
      if (currentActive) {
        const stillVisible = viewableItems.some(
          (v) => v.isViewable && v.item?.id === currentActive
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
    }
  ).current;

  useEffect(() => {
    return () => {
      cancelDeferredFlush();
      cancelScrollStop();
      setFeedScrolling(false);
      if (itemVisibleTimerRef.current) {
        clearTimeout(itemVisibleTimerRef.current);
      }
    };
  }, [cancelDeferredFlush, cancelScrollStop, setFeedScrolling]);

  useEffect(() => {
    if (data.length !== 0) return;
    hasReportedVisibleItemsRef.current = false;
    setVideoViewability(feedContext, new Set(), null);
  }, [data, feedContext, setVideoViewability]);

  const prevFeedContextRef = useRef(feedContext);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (prevFeedContextRef.current === feedContext) return;
    prevFeedContextRef.current = feedContext;
    pendingViewableRef.current = null;
    hasReportedVisibleItemsRef.current = false;

    const timer = setTimeout(() => {
      if (pendingViewableRef.current) {
        flushViewability();
        return;
      }
      const currentData = dataRef.current;
      if (currentData.length === 0) return;
      const firstItems = currentData.slice(0, 5);
      const videoItems = firstItems.filter(item => postHasPlayableVideo(item));
      if (videoItems.length === 0) return;
      const visibleVideoIds = new Set(videoItems.map(item => item.id));
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
    ({ item }) => <HomePostCardItem post={item} feedScreen={feedScreen} feedContext={feedContext} />,
    [feedScreen, feedContext]
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
      onScroll={onScroll}
      scrollEventThrottle={onScroll ? (Platform.OS === "ios" ? 64 : 32) : undefined}
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
