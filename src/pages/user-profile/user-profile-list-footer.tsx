import { View } from "react-native";
import Animated from "react-native-reanimated";

import {
  PostCardSkeletonList,
  ProfileAboutTab,
  ProfileEmptyState,
  ProfilePostsSkeleton,
} from "@/src/components/molecules";

interface UserProfileListFooterProps {
  activeTab: number;
  contentAnimatedStyle: any;
  handleSettingsPress: () => void;
  handleUnblockUser: () => void;
  isBlocked: boolean;
  isFetchingNextPage: boolean;
  isLoadingPosts: boolean;
  isOwnProfile: boolean;
  listDataLength: number;
  userAddress: string | null;
}

export function UserProfileListFooter({
  activeTab,
  contentAnimatedStyle,
  handleSettingsPress,
  handleUnblockUser,
  isBlocked,
  isFetchingNextPage,
  isLoadingPosts,
  isOwnProfile,
  listDataLength,
  userAddress,
}: UserProfileListFooterProps) {
  if (isBlocked) {
    const tabType = activeTab === 0 ? "posts" : activeTab === 1 ? "comments" : "about";
    return (
      <Animated.View style={contentAnimatedStyle}>
        <ProfileEmptyState
          tabType={tabType}
          isOwnProfile={false}
          isBlocked
          onUnblock={handleUnblockUser}
        />
      </Animated.View>
    );
  }

  if (activeTab === 2) {
    return (
      <Animated.View style={contentAnimatedStyle}>
        <ProfileAboutTab userAddress={userAddress} isOwnProfile={isOwnProfile} />
      </Animated.View>
    );
  }

  if (isLoadingPosts) {
    return activeTab === 0 ? (
      <Animated.View style={contentAnimatedStyle}>
        <PostCardSkeletonList count={3} />
      </Animated.View>
    ) : (
      <Animated.View style={contentAnimatedStyle}>
        <ProfilePostsSkeleton count={5} type="comments" />
      </Animated.View>
    );
  }

  if (listDataLength <= 2) {
    const tabType = activeTab === 0 ? "posts" : "comments";
    return (
      <Animated.View style={contentAnimatedStyle}>
        <ProfileEmptyState
          tabType={tabType}
          onSettingsPress={handleSettingsPress}
          isOwnProfile={isOwnProfile}
        />
      </Animated.View>
    );
  }

  if (isFetchingNextPage) {
    return activeTab === 0 ? (
      <Animated.View style={contentAnimatedStyle}>
        <PostCardSkeletonList count={1} />
      </Animated.View>
    ) : (
      <Animated.View style={contentAnimatedStyle}>
        <ProfilePostsSkeleton count={2} type="comments" />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={contentAnimatedStyle}>
      <View style={{ height: 80 }} />
    </Animated.View>
  );
}
