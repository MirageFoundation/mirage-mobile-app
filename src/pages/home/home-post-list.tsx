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
    viewAreaCoveragePercentThreshold: 20,
    minimumViewTime: 150,
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
      estimatedItemSize={ESTIMATED_ITEM_SIZE}
      drawDistance={Platform.OS === "android" ? 1500 : 2000}
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
