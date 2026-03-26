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
import Animated from "react-native-reanimated";
import type { Post } from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { useAppState } from "@/src/hooks";
import { HomePostCardItem } from "./home-post-card-item";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as ComponentType<any>,
);

const ESTIMATED_ITEM_SIZE = 420;

type HomePostListProps = {
 data: Post[];
 contentContainerStyle: object;
 onScroll: (event: any) => void;
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

  const dataRef = useRef(data);
  dataRef.current = data;

  const feedScreenRef = useRef(feedContext);
  feedScreenRef.current = feedContext;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 300,
  }).current;

  const pendingViewableRef = useRef<ViewToken[] | null>(null);
  const deferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDeferredFlush = useCallback(() => {
    if (deferHandleRef.current === null) return;
    clearTimeout(deferHandleRef.current as ReturnType<typeof setTimeout>);
    deferHandleRef.current = null;
  }, []);

  const flushViewability = useCallback(() => {
    const items = pendingViewableRef.current;
    if (!items) return;

    const visibleItems = items.filter((item) => item.isViewable && item.item?.id);
    if (visibleItems.length === 0) {
      setVideoViewability(feedScreenRef.current, new Set(), new Set(), null);
      return;
    }
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

      let best = videoItems[0];
      let bestDist = Math.abs((best.index ?? 0) - centerIndex);
      for (let i = 1; i < videoItems.length; i++) {
        const d = Math.abs((videoItems[i].index ?? 0) - centerIndex);
        if (d < bestDist) {
          best = videoItems[i];
          bestDist = d;
        }
      }
      activeId = best.item.id;
    }

    const warmVideoIds = new Set<string>(visibleVideoIds);
    const warmMinIndex = Math.max(0, Math.min(...visibleItems.map((v) => v.index ?? 0)) - 2);
    const warmMaxIndex = Math.min(dataRef.current.length - 1, Math.max(...visibleItems.map((v) => v.index ?? 0)) + 2);
    for (let i = warmMinIndex; i <= warmMaxIndex; i++) {
      const post = dataRef.current[i];
      if (post && postHasPlayableVideo(post)) {
        warmVideoIds.add(post.id);
      }
    }

    setVideoViewability(feedScreenRef.current, visibleVideoIds, warmVideoIds, activeId);

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
      if (itemVisibleTimerRef.current) {
        clearTimeout(itemVisibleTimerRef.current);
      }
    };
  }, [cancelDeferredFlush]);

  useEffect(() => {
    if (data.length !== 0) return;
    setVideoViewability(feedContext, new Set(), new Set(), null);
  }, [data, feedContext, setVideoViewability]);

  useAppState({
    onBackground: () => {
      cancelDeferredFlush();
      if (itemVisibleTimerRef.current) {
        clearTimeout(itemVisibleTimerRef.current);
        itemVisibleTimerRef.current = null;
      }
      setVideoViewability(feedScreenRef.current, new Set(), new Set(), null);
    },
    onForeground: () => {
      cancelDeferredFlush();
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

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    console.log('[HomePostList] layout height:', e.nativeEvent.layout.height);
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    cancelDeferredFlush();
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
  }, [cancelDeferredFlush, flushViewability]);

  return (
    <AnimatedFlashList
      ref={ref}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      estimatedItemSize={ESTIMATED_ITEM_SIZE}
      drawDistance={Platform.OS === "android" ? 900 : 1200}
      onScroll={onScroll}
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
      onMomentumScrollEnd={handleMomentumScrollEnd}
      onLayout={handleLayout}
    />
  );
};

export const HomePostList = memo(forwardRef(HomePostListInner));
