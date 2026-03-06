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
  FlatList,
  InteractionManager,
  Platform,
  type ListRenderItem,
  type ViewToken,
} from "react-native";
import Animated from "react-native-reanimated";
import type { Post } from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { HomePostCardItem } from "./home-post-card-item";
import { useHomePostCardStore } from "./home-post-card-store";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Post>);

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
 ref: Ref<FlatList<Post>>
) {
  const setVisiblePostIds = useHomePostCardStore(
    (state) => state.setVisiblePostIds
  );
  const setActiveVideoPostId = useHomePostCardStore(
    (state) => state.setActiveVideoPostId
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
  const deferHandleRef = useRef<ReturnType<typeof setTimeout> | ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);

  const flushViewability = () => {
    const items = pendingViewableRef.current;
    if (!items) return;

    const visibleIds = new Set(
      items
        .filter((item) => item.isViewable && item.item?.id)
        .map((item) => item.item.id)
    );
    setVisiblePostIds(visibleIds);

    const visibleItems = items.filter((item) => item.isViewable && item.item?.id);
    const videoItems = visibleItems.filter(
      (item) => postHasPlayableVideo(item.item)
    );
    if (videoItems.length > 0) {
      const midIdx = Math.floor((visibleItems.length - 1) / 2);
      const midListIndex = visibleItems[midIdx]?.index ?? 0;
      let best = videoItems[0];
      let bestDist = Math.abs((best.index ?? 0) - midListIndex);
      for (let i = 1; i < videoItems.length; i++) {
        const d = Math.abs((videoItems[i].index ?? 0) - midListIndex);
        if (d < bestDist) { best = videoItems[i]; bestDist = d; }
      }
      setActiveVideoPostId(feedScreenRef.current, best.item.id);
    } else {
      setActiveVideoPostId(feedScreenRef.current, null);
    }

    const maxIndex = items.reduce((max, item) => {
      if (item.isViewable && item.index != null && item.index > max) return item.index;
      return max;
    }, -1);
    if (maxIndex >= 0) onItemVisibleRef.current?.(maxIndex);
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      pendingViewableRef.current = viewableItems;

      if (Platform.OS === "android") {
        if (deferHandleRef.current !== null) {
          clearTimeout(deferHandleRef.current as ReturnType<typeof setTimeout>);
        }
        deferHandleRef.current = setTimeout(flushViewability, 150);
      } else {
        if (deferHandleRef.current !== null) {
          (deferHandleRef.current as ReturnType<typeof InteractionManager.runAfterInteractions>).cancel();
        }
        deferHandleRef.current = InteractionManager.runAfterInteractions(flushViewability);
      }
    }
  ).current;

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
      setActiveVideoPostId(feedScreen, firstVideo.id);
    }
  }, [data, feedScreen, setActiveVideoPostId]);

 const renderItem = useCallback<ListRenderItem<Post>>(
    ({ item }) => <HomePostCardItem post={item} feedScreen={feedScreen} />,
    [feedScreen]
 );

  const keyExtractor = useMemo(() => (item: Post) => item.id, []);

  const handleMomentumScrollEnd = useCallback(() => {
    if (deferHandleRef.current !== null) {
      if (Platform.OS === "android") {
        clearTimeout(deferHandleRef.current as ReturnType<typeof setTimeout>);
      } else {
        (deferHandleRef.current as ReturnType<typeof InteractionManager.runAfterInteractions>).cancel();
      }
      deferHandleRef.current = null;
    }
    flushViewability();
  }, []);

  return (
    <AnimatedFlatList
      ref={ref}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onScroll={onScroll}
      scrollEventThrottle={32}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
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
      removeClippedSubviews={true}
      maxToRenderPerBatch={Platform.OS === "android" ? 3 : 5}
      windowSize={Platform.OS === "android" ? 3 : 7}
      initialNumToRender={3}
      updateCellsBatchingPeriod={Platform.OS === "android" ? 150 : 100}
      getItemLayout={undefined}
      maintainVisibleContentPosition={Platform.OS === "android" ? undefined : { minIndexForVisible: 0 }}
    />
  );
};

export const HomePostList = memo(forwardRef(HomePostListInner));
