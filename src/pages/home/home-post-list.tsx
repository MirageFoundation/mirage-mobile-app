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
import { HomePostCardItem } from "./home-post-card-item";
import { useHomePostCardStore } from "./home-post-card-store";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as ComponentType<any>,
);

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
   onItemVisible,
 }: HomePostListProps,
 ref: Ref<FlashListRef<Post>>
) {
  const setVideoViewability = useHomePostCardStore(
    (state) => state.setVideoViewability
  );

  const onItemVisibleRef = useRef(onItemVisible);
  onItemVisibleRef.current = onItemVisible;

  const feedScreenRef = useRef(feedScreen);
  feedScreenRef.current = feedScreen;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 30,
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
    const videoItems = visibleItems.filter(
      (item) => postHasPlayableVideo(item.item)
    );
    if (visibleItems.length === 0) return;

    const visibleVideoIds = new Set(videoItems.map((item) => item.item.id));
    let activeId: string | null = null;

    if (videoItems.length > 0) {
      const midIdx = Math.floor((visibleItems.length - 1) / 2);
      const midListIndex = visibleItems[midIdx]?.index ?? 0;
      let best = videoItems[0];
      let bestDist = Math.abs((best.index ?? 0) - midListIndex);
      for (let i = 1; i < videoItems.length; i++) {
        const d = Math.abs((videoItems[i].index ?? 0) - midListIndex);
        if (d < bestDist) { best = videoItems[i]; bestDist = d; }
      }
      activeId = best.item.id;
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

      const maxIndex = viewableItems.reduce((max, item) => {
        if (item.isViewable && item.index != null && item.index > max) return item.index;
        return max;
      }, -1);

      if (Platform.OS === "ios") {
        if (itemVisibleTimerRef.current) clearTimeout(itemVisibleTimerRef.current);
        itemVisibleTimerRef.current = setTimeout(() => {
          itemVisibleTimerRef.current = null;
          if (maxIndex >= 0) onItemVisibleRef.current?.(maxIndex);
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
    };
  }, [cancelDeferredFlush]);

  useEffect(() => {
    if (!data || data.length === 0) return;
    const currentActive = useHomePostCardStore.getState().activeVideoPostIds[feedScreen];
    if (
      currentActive &&
      data.some(
        (p) =>
          p.id === currentActive &&
          postHasPlayableVideo(p)
      )
    ) {
      return;
    }
    const firstVideo = data.find(
      (p) => postHasPlayableVideo(p)
    );
    if (firstVideo) {
      setVideoViewability(feedScreen, new Set([firstVideo.id]), firstVideo.id);
    }
  }, [data, feedScreen, setVideoViewability]);

 const renderItem = useCallback<ListRenderItem<Post>>(
    ({ item }) => <HomePostCardItem post={item} feedScreen={feedScreen} />,
    [feedScreen]
 );

  const keyExtractor = useMemo(() => (item: Post) => item.id, []);
  const getItemType = useCallback(
    (item: Post) => (item.media?.length ? "media-post" : "text-post"),
    [],
  );

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
      estimatedItemSize={420}
      drawDistance={Platform.OS === "android" ? 500 : 600}
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
    />
  );
};

export const HomePostList = memo(forwardRef(HomePostListInner));
