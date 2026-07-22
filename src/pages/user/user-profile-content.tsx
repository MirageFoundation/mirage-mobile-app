import { getShareBaseUrl } from "@/src/stores";
import {
  ProfileHeaderBar,
  ProfileTabBar,
} from "@/src/components/molecules";
import { UserProfileContentAnimated } from "@/src/components/molecules/user-profile-content-animated";
import { Box } from "@/src/components/ui/primitives";
import { useCallback, useMemo } from "react";
import {
  Dimensions,
  FlatList,
  type ListRenderItem,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import {
  UserProfileCommentWrapper,
  UserProfilePostWrapper,
} from "./user-profile-feed-items";
import { UserProfileListFooter } from "./user-profile-list-footer";
import { UserProfileOverlays } from "./user-profile-overlays";
import { styles } from "./user-profile-styles";
import type { UserProfileListItem } from "./user-profile-state";
import { useUserProfileController } from "./use-user-profile-controller";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const AnimatedFlatList = Animated.createAnimatedComponent(
  FlatList<UserProfileListItem>,
);

export function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { theme } = useUnistyles();
  const controller = useUserProfileController(insets.top, windowHeight);
  const {
    activeTab,
    activeVideoPostId,
    animatedTabIndex,
    avatarUrl,
    contentAnimatedStyle,
    flatListRef,
    gradientColors,
    handleAuthorPress,
    handleBackPress,
    handleBlockPostFromCard,
    handleBlockUserFromCard,
    handleCommentPress,
    handleDownvote,
    handleEndReached,
    handleFollow,
    handleFollowersPress,
    handleMenuPress,
    handlePostMorePress,
    handlePostPress,
    handleProfileMomentumScrollEnd,
    handleReportFromCard,
    handleRevealContent,
    handleSettingsPress,
    handleTabChange,
    handleTabDoubleTap,
    handleTopicPress,
    handleUnblockUser,
    handleUnfollow,
    handleUpvote,
    headerHeight,
    isBlocked,
    isFetchingNextPage,
    isFocused,
    isFollowing,
    isLoading,
    isLoadingPosts,
    isOwnProfile,
    isRefreshing,
    isTabsSticky,
    listData,
    minimumContentHeight,
    nearbyVideoPostIds,
    onProfileViewableItemsChanged,
    profileData,
    profileViewabilityConfig,
    revealedPosts,
    scrollHandler,
    scrollY,
    setFeedScrolling,
    shareServer,
    stickyTabsAnimatedStyle,
    swipeGesture,
    userAddress,
    userProfileFeedContext,
    userStatus,
    username,
    visibleVideoPostIds,
  } = controller;

  const keyExtractor = useCallback((item: UserProfileListItem) => {
    if (item === "header" || item === "tabs") return item;
    return "id" in item ? item.id : item.post_id;
  }, []);

  const renderItem: ListRenderItem<UserProfileListItem> = useCallback(({ item }) => {
    if (item === "header") {
      return (
        <UserProfileContentAnimated
          username={username}
          avatarSeed={userAddress || username}
          avatarUrl={avatarUrl}
          walletAddress={userAddress || "0x0000...0000"}
          balance={profileData.balance}
          reserve={profileData.reserve}
          accountAgeDays={profileData.accountAgeDays}
          gradientColors={gradientColors}
          scrollY={scrollY}
          onFollowersPress={handleFollowersPress}
          isLoading={isLoading}
          headerHeight={headerHeight}
        />
      );
    }
    if (item === "tabs") {
      if (isTabsSticky) return <View style={styles.inlineTabPlaceholder} />;
      return (
        <View style={{ backgroundColor: theme.colors.background.default }}>
          <ProfileTabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onTabDoubleTap={handleTabDoubleTap}
            tabWidth={SCREEN_WIDTH}
            animatedIndex={animatedTabIndex}
          />
        </View>
      );
    }
    if (activeTab === 0 && "id" in item) {
      return (
        <Animated.View style={contentAnimatedStyle}>
          <UserProfilePostWrapper
            post={item}
            isOwnProfile={isOwnProfile}
            isVisible={visibleVideoPostIds.has(item.id)}
            isFocused={activeVideoPostId === item.id}
            isNearVisible={nearbyVideoPostIds.has(item.id)}
            screenActive={isFocused}
            contentRevealed={revealedPosts.has(item.id)}
            videoSyncScope={userProfileFeedContext}
            shareUrl={`${getShareBaseUrl(shareServer)}/p/${item.id}`}
            onPostPress={handlePostPress}
            onAuthorPress={handleAuthorPress}
            onCommentPress={handlePostPress}
            onMorePress={handlePostMorePress}
            onLikePress={handleUpvote}
            onDislikePress={handleDownvote}
            onBlockUser={handleBlockUserFromCard}
            onBlockPost={handleBlockPostFromCard}
            onReport={handleReportFromCard}
            onRevealContent={handleRevealContent}
            onTopicPress={handleTopicPress}
          />
        </Animated.View>
      );
    }
    if (activeTab === 1 && "post_id" in item) {
      return (
        <Animated.View style={contentAnimatedStyle}>
          <UserProfileCommentWrapper
            comment={item}
            onPress={handleCommentPress}
          />
        </Animated.View>
      );
    }
    return null;
  }, [
    activeTab, activeVideoPostId, animatedTabIndex, avatarUrl,
    contentAnimatedStyle, gradientColors, handleAuthorPress,
    handleBlockPostFromCard, handleBlockUserFromCard, handleCommentPress,
    handleDownvote, handleFollowersPress, handlePostMorePress, handlePostPress,
    handleReportFromCard, handleRevealContent, handleTabChange,
    handleTabDoubleTap, handleTopicPress, handleUpvote, headerHeight, isFocused,
    isLoading, isOwnProfile, isTabsSticky, nearbyVideoPostIds, profileData,
    revealedPosts, scrollY, shareServer, theme.colors.background.default,
    userAddress, userProfileFeedContext, username, visibleVideoPostIds,
  ]);

  const listFooter = useMemo(() => (
    <UserProfileListFooter
      activeTab={activeTab}
      contentAnimatedStyle={contentAnimatedStyle}
      isBlocked={isBlocked}
      isFetchingNextPage={isFetchingNextPage}
      isLoadingPosts={isLoadingPosts}
      isOwnProfile={isOwnProfile}
      listDataLength={listData.length}
      userAddress={userAddress}
      onSettingsPress={handleSettingsPress}
      onUnblock={handleUnblockUser}
    />
  ), [
    activeTab, contentAnimatedStyle, handleSettingsPress, handleUnblockUser,
    isBlocked, isFetchingNextPage, isLoadingPosts, isOwnProfile,
    listData.length, userAddress,
  ]);
  const contentContainerStyle = useMemo(() => ({
    paddingTop: headerHeight,
    paddingBottom: insets.bottom + 20,
    flexGrow: 1,
    minHeight: minimumContentHeight,
  }), [headerHeight, insets.bottom, minimumContentHeight]);

  return (
    <Box flex background="base">
      <ProfileHeaderBar
        username={username}
        userLevel={userStatus?.user_level ?? 0}
        gradientColors={gradientColors}
        scrollY={scrollY}
        isRefreshing={isRefreshing}
        isLoading={isLoading}
        isOwnProfile={isOwnProfile}
        isFollowing={isFollowing}
        onBackPress={handleBackPress}
        onFollowPress={handleFollow}
        onUnfollowPress={handleUnfollow}
        onMenuPress={handleMenuPress}
      />
      <Animated.View
        style={[
          styles.stickyTabBar,
          { top: headerHeight, backgroundColor: theme.colors.background.default },
          stickyTabsAnimatedStyle,
        ]}
        pointerEvents={isTabsSticky ? "auto" : "none"}
      >
        <ProfileTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onTabDoubleTap={handleTabDoubleTap}
          tabWidth={SCREEN_WIDTH}
          animatedIndex={animatedTabIndex}
        />
      </Animated.View>
      <GestureDetector gesture={swipeGesture}>
        <AnimatedFlatList
          style={styles.list}
          ref={flatListRef}
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onScroll={scrollHandler}
          scrollEventThrottle={Platform.OS === "ios" ? 64 : 16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={contentContainerStyle}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={listFooter}
          removeClippedSubviews
          maxToRenderPerBatch={Platform.OS === "android" ? 5 : 9}
          windowSize={Platform.OS === "android" ? 7 : 13}
          initialNumToRender={5}
          updateCellsBatchingPeriod={Platform.OS === "android" ? 100 : 50}
          bounces
          viewabilityConfig={profileViewabilityConfig}
          onViewableItemsChanged={onProfileViewableItemsChanged}
          onScrollBeginDrag={() => setFeedScrolling(true)}
          onScrollEndDrag={() => setFeedScrolling(false)}
          onMomentumScrollBegin={() => setFeedScrolling(true)}
          onMomentumScrollEnd={() => {
            setFeedScrolling(false);
            handleProfileMomentumScrollEnd();
          }}
          extraData={revealedPosts}
        />
      </GestureDetector>
      <UserProfileOverlays controller={controller} />
    </Box>
  );
}
