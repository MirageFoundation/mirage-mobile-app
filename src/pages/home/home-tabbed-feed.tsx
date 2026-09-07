import type { ReactNode } from "react";
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import { Platform, RefreshControl, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IOSRefreshIndicator } from "@/src/components/atoms/refresh-indicator";
import type { NewPostAvatar } from "@/src/hooks/use-new-posts-checker";
import {
  HEADER_HEIGHT,
  TAB_BAR_HEIGHT,
} from "@/src/providers/scroll-animation-context";
import {
  HomeFeedListEmpty,
  HomeFeedListHeader,
  useHomeFeedListFooter,
} from "./home-tabbed-feed-accessories";
import { HomePostList } from "./home-post-list";
import {
  useHomeTabbedFeedController,
  type HomeTabbedFeedControllerRef,
} from "./use-home-tabbed-feed-controller";

export type HomeTabbedFeedRef = HomeTabbedFeedControllerRef;

type HomeTabbedFeedProps = {
  feedType: "home" | "following";
  activeTabIndex?: number;
  ListHeaderExtra?: ReactNode;
  onRefreshingChange?: (refreshing: boolean) => void;
  onNewPostsChange?: (
    hasNew: boolean,
    avatars: NewPostAvatar[],
    count: number,
  ) => void;
};

export const HomeTabbedFeed = forwardRef<
  HomeTabbedFeedRef,
  HomeTabbedFeedProps
>(({
  feedType,
  activeTabIndex = 0,
  ListHeaderExtra,
  onRefreshingChange,
  onNewPostsChange,
}, ref) => {
  const insets = useSafeAreaInsets();
  const controller = useHomeTabbedFeedController({
    baseFeed: feedType,
    activeTabIndex,
    onRefreshingChange,
    onNewPostsChange,
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: controller.scrollToTop,
      refresh: controller.handleRefresh,
      isRefreshing: () => controller.isRefreshingRef.current,
      hasNewPosts: () => controller.hasNewPosts,
      handleNewPostsPress: controller.handleNewPostsPress,
      dismissNewPosts: controller.dismissNewPosts,
      checkNewPosts: controller.checkNow,
      resetBaseline: controller.resetBaseline,
    }),
    [
      controller.checkNow,
      controller.dismissNewPosts,
      controller.handleNewPostsPress,
      controller.handleRefresh,
      controller.hasNewPosts,
      controller.isRefreshingRef,
      controller.resetBaseline,
      controller.scrollToTop,
    ],
  );

  const listContentStyle = useMemo(
    () => ({
      paddingTop: insets.top + HEADER_HEIGHT,
      paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
      flexGrow: 1,
    }),
    [insets.bottom, insets.top],
  );
  const progressViewOffset = insets.top + HEADER_HEIGHT;
  const refreshControl = useMemo(() => {
    if (Platform.OS !== "ios") return null;
    return (
      <RefreshControl
        refreshing={false}
        onRefresh={controller.handleRefresh}
        tintColor="transparent"
        colors={["transparent"]}
        progressBackgroundColor="transparent"
        progressViewOffset={progressViewOffset}
      />
    );
  }, [controller.handleRefresh, progressViewOffset]);
  const listHeader = useMemo(
    () => (
      <HomeFeedListHeader extra={ListHeaderExtra} />
    ),
    [ListHeaderExtra],
  );
  const listEmpty = useMemo(
    () => (
      <HomeFeedListEmpty
        feedType={feedType}
        isLoading={controller.query.isPending && controller.posts.length === 0}
        isError={controller.query.isError}
        errorMessage={controller.query.error?.message}
      />
    ),
    [
      controller.query.error?.message,
      controller.query.isError,
      controller.query.isPending,
      controller.posts.length,
      feedType,
    ],
  );
  const listFooter = useHomeFeedListFooter(
    controller.query.isFetchingNextPage,
    controller.posts.length,
  );

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={controller.pullGesture}>
        <View style={{ flex: 1 }} collapsable={false}>
          <HomePostList
            key={`${controller.feedContext}:${controller.apiServer}`}
            ref={controller.listRef}
            data={controller.posts}
            contentContainerStyle={listContentStyle}
            onScroll={controller.scrollHandler}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            ListFooterComponent={listFooter}
            refreshControl={refreshControl}
            feedScreen={feedType}
            feedContext={controller.feedContext}
            onItemVisible={controller.onItemVisible}
          />
        </View>
      </GestureDetector>
      <IOSRefreshIndicator
        visible={controller.isRefreshing && !controller.query.isLoading}
        topOffset={insets.top + HEADER_HEIGHT + 8}
        scrollY={controller.scrollY}
        pullDistance={controller.pullDistance}
      />
    </View>
  );
});

HomeTabbedFeed.displayName = "HomeTabbedFeed";
