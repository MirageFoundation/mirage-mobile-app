import { View } from "react-native";
import Animated from "react-native-reanimated";

import type { Post as ApiPost } from "@/src/api/types";
import {
  type Post,
  ProfileContentAnimated,
  ProfileTabBar,
} from "@/src/components/molecules";

import {
  AnimatedPostWrapper,
  MemoizedCommentWrapper,
} from "./profile-list-items";

type ProfileContentItemProps = {
  item: Post | ApiPost | "header" | "tabs";
  username: string;
  walletAddress?: string | null;
  avatarUrl: string | null;
  balance: number;
  reserve: number;
  accountAgeDays: number;
  gradientColors: string[];
  scrollY: any;
  onFollowersPress: () => void;
  onEditUsernamePress: () => void;
  isLoading: boolean;
  headerHeight: number;
  isTabsSticky: boolean;
  activeTab: number;
  onTabChange: (tab: number) => void;
  onTabDoubleTap: () => void;
  animatedTabIndex: any;
  tabWidth: number;
  contentAnimatedStyle: object;
  postsWithoutWarnings: Map<string, Post>;
  visibleVideoPostIds: Set<string>;
  warmVideoPostIds: Set<string>;
  activeVideoPostId: string | null;
  screenActive: boolean;
  onPostPress: (postId: string) => void;
  onAuthorPress: (authorId: string) => void;
  onMorePress: (postId: string) => void;
  onCommentPress: (commentId: string, rootPostId: string) => void;
  onTopicPress: (topic: string) => void;
};

export function ProfileContentItem(props: ProfileContentItemProps) {
  const {
    item,
    username,
    walletAddress,
    avatarUrl,
    balance,
    reserve,
    accountAgeDays,
    gradientColors,
    scrollY,
    onFollowersPress,
    onEditUsernamePress,
    isLoading,
    headerHeight,
    isTabsSticky,
    activeTab,
    onTabChange,
    onTabDoubleTap,
    animatedTabIndex,
    tabWidth,
    contentAnimatedStyle,
    postsWithoutWarnings,
    visibleVideoPostIds,
    warmVideoPostIds,
    activeVideoPostId,
    screenActive,
    onPostPress,
    onAuthorPress,
    onMorePress,
    onCommentPress,
    onTopicPress,
  } = props;

  if (item === "header") {
    return (
      <ProfileContentAnimated
        username={username}
        avatarSeed={walletAddress || username}
        avatarUrl={avatarUrl}
        walletAddress={walletAddress || "0x0000...0000"}
        balance={balance}
        reserve={reserve}
        accountAgeDays={accountAgeDays}
        gradientColors={gradientColors}
        scrollY={scrollY}
        onFollowersPress={onFollowersPress}
        onEditUsernamePress={onEditUsernamePress}
        isLoading={isLoading}
        headerHeight={headerHeight}
      />
    );
  }

  if (item === "tabs") {
    if (isTabsSticky) {
      return <View style={{ height: 56 }} />;
    }

    return (
      <View>
        <ProfileTabBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          onTabDoubleTap={onTabDoubleTap}
          tabWidth={tabWidth}
          animatedIndex={animatedTabIndex}
        />
      </View>
    );
  }

  if (activeTab === 0 && "id" in item) {
    const cleanPost = postsWithoutWarnings.get(item.id) || item;
    return (
      <Animated.View style={contentAnimatedStyle}>
        <AnimatedPostWrapper
          post={cleanPost}
          isVisible={visibleVideoPostIds.has(item.id)}
          isFocused={activeVideoPostId === item.id}
          preloadNearby={warmVideoPostIds.has(item.id)}
          screenActive={screenActive}
          onPostPress={onPostPress}
          onAuthorPress={onAuthorPress}
          onCommentPress={onPostPress}
          onMorePress={onMorePress}
          onTopicPress={onTopicPress}
        />
      </Animated.View>
    );
  }

  if (activeTab === 1 && "post_id" in item) {
    return (
      <Animated.View style={contentAnimatedStyle}>
        <MemoizedCommentWrapper comment={item} onPress={onCommentPress} />
      </Animated.View>
    );
  }

  return null;
}
