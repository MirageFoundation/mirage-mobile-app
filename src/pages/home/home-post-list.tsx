import {
  memo,
  useCallback,
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

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
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

      const firstVisible = viewableItems.find((item) => item.isViewable && item.item?.id);
      setActiveVideoPostId(firstVisible?.item?.id ?? null);

     const maxIndex = viewableItems.reduce((max, item) => {
       if (item.isViewable && item.index != null && item.index > max) return item.index;
       return max;
     }, -1);
     if (maxIndex >= 0) onItemVisibleRef.current?.(maxIndex);
    }
  ).current;

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
      removeClippedSubviews={Platform.OS !== "android"}
      maxToRenderPerBatch={5}
      windowSize={11}
      initialNumToRender={7}
      getItemLayout={undefined}
      maintainVisibleContentPosition={Platform.OS === "android" ? undefined : { minIndexForVisible: 0 }}
    />
  );
};

export const HomePostList = memo(forwardRef(HomePostListInner));
