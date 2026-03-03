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
  Platform,
  type ListRenderItem,
  type ViewToken,
} from "react-native";
import Animated from "react-native-reanimated";
import type { Post } from "@/src/components/molecules";
import { HomePostCardItem } from "./home-post-card-item";
import { useHomePostCardStore } from "./home-post-card-store";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Post>);

const isPlayableMedia = (m: { type?: string; uri?: string }) =>
  m.type === "video" ||
  m.type === "youtube" ||
  (m.type === "gif" && typeof m.uri === "string" && m.uri.includes("redgifs.com"));

const hasPlayableVideo = (post?: { media?: Array<{ type?: string; uri?: string }> }) =>
  !!post?.media?.some(isPlayableMedia);

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
    viewAreaCoveragePercentThreshold: 11,
    minimumViewTime: 100,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const visibleIds = new Set(
        viewableItems
          .filter((item) => item.isViewable && item.item?.id)
          .map((item) => item.item.id)
      );
      setVisiblePostIds(visibleIds);

      const visibleItems = viewableItems.filter((item) => item.isViewable && item.item?.id);
      const videoItems = visibleItems.filter(
        (item) => hasPlayableVideo(item.item)
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

     const maxIndex = viewableItems.reduce((max, item) => {
       if (item.isViewable && item.index != null && item.index > max) return item.index;
       return max;
     }, -1);
     if (maxIndex >= 0) onItemVisibleRef.current?.(maxIndex);
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
          hasPlayableVideo(p)
      )
    ) {
      return;
    }
    const firstVideo = data.find(
      (p) => hasPlayableVideo(p)
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

  return (
    <AnimatedFlatList
      ref={ref}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onScroll={onScroll}
      scrollEventThrottle={16}
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
      removeClippedSubviews={true}
      maxToRenderPerBatch={3}
      windowSize={5}
      initialNumToRender={4}
      updateCellsBatchingPeriod={100}
      getItemLayout={undefined}
      maintainVisibleContentPosition={Platform.OS === "android" ? undefined : { minIndexForVisible: 0 }}
    />
  );
};

export const HomePostList = memo(forwardRef(HomePostListInner));
