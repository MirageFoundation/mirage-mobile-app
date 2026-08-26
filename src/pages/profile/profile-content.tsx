import { ProfileHeaderBar, ProfileTabBar } from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import { useCallback, useMemo } from "react";
import { Dimensions, FlatList, Platform, useWindowDimensions } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { ProfilePostActionSheets } from "./profile-post-action-sheets";
import {
  ProfileSectionRenderer,
  ProfileSectionsFooter,
} from "./profile-sections";
import { getOwnProfileListItemKey, type OwnProfileListItem } from "./profile-state";
import { styles } from "./profile-styles";
import { useProfileController } from "./use-profile-controller";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<OwnProfileListItem>);

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { theme } = useUnistyles();
  const controller = useProfileController(insets.top, windowHeight);
  const renderItem = useCallback(
    ({ item }: { item: OwnProfileListItem }) => (
      <ProfileSectionRenderer item={item} controller={controller} />
    ),
    [controller],
  );
  const listFooter = useMemo(
    () => <ProfileSectionsFooter controller={controller} />,
    [controller],
  );
  const contentContainerStyle = useMemo(() => ({
    paddingTop: controller.headerHeight,
    paddingBottom: insets.bottom + 20,
    flexGrow: 1,
    minHeight: controller.minimumContentHeight,
  }), [controller.headerHeight, controller.minimumContentHeight, insets.bottom]);

  return (
    <Box flex background="base">
      <ProfileHeaderBar
        username={controller.username}
        userLevel={controller.userStatus?.user_level ?? 0}
        gradientColors={controller.gradientColors}
        scrollY={controller.scrollY}
        isRefreshing={controller.isRefreshing}
        isLoading={controller.isLoading}
        isOwnProfile
        onBackPress={controller.handleBackPress}
      />
      <Animated.View
        style={[
          styles.stickyTabBar,
          {
            top: controller.headerHeight,
            backgroundColor: theme.colors.background.default,
          },
          controller.stickyTabsAnimatedStyle,
        ]}
        pointerEvents={controller.isTabsSticky ? "auto" : "none"}
      >
        <ProfileTabBar
          activeTab={controller.activeTab}
          onTabChange={controller.handleTabChange}
          onTabDoubleTap={controller.handleTabDoubleTap}
          tabWidth={SCREEN_WIDTH}
          animatedIndex={controller.animatedTabIndex}
        />
      </Animated.View>
      <GestureDetector gesture={controller.swipeGesture}>
        <AnimatedFlatList
          style={styles.list}
          ref={controller.flatListRef}
          data={controller.listData}
          renderItem={renderItem}
          keyExtractor={getOwnProfileListItemKey}
          onScroll={controller.scrollHandler}
          scrollEventThrottle={Platform.OS === "ios" ? 64 : 16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={contentContainerStyle}
          onEndReached={controller.handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={listFooter}
          extraData={controller.focusVersion}
          removeClippedSubviews
          maxToRenderPerBatch={Platform.OS === "android" ? 5 : 9}
          windowSize={Platform.OS === "android" ? 7 : 13}
          initialNumToRender={5}
          updateCellsBatchingPeriod={Platform.OS === "android" ? 100 : 50}
          bounces
          viewabilityConfig={controller.profileViewabilityConfig}
          onViewableItemsChanged={controller.onProfileViewableItemsChanged}
          onScrollBeginDrag={() => controller.setFeedScrolling(true)}
          onScrollEndDrag={() => controller.setFeedScrolling(false)}
          onMomentumScrollBegin={() => controller.setFeedScrolling(true)}
          onMomentumScrollEnd={() => {
            controller.setFeedScrolling(false);
            controller.handleProfileMomentumScrollEnd();
          }}
        />
      </GestureDetector>
      <ProfilePostActionSheets ref={controller.postActionSheetsRef} isOwnPost />
    </Box>
  );
}
