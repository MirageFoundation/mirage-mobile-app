import { View } from "react-native";
import Animated from "react-native-reanimated";

import {
  ProfileAboutTab,
  ProfileEmptyState,
  ProfilePostsSkeleton,
} from "@/src/components/molecules";
import { PostCardSkeletonList } from "@/src/components/molecules/post-card-skeleton";

type ProfileFooterProps = {
  activeTab: number;
  isLoadingPosts: boolean;
  isFetchingNextPage: boolean;
  hasContent: boolean;
  contentAnimatedStyle: object;
  userAddress?: string | null;
  onBlockedPress: () => void;
  onSettingsPress: () => void;
  bottomSpacerHeight: number;
};

export function ProfileFooter({
  activeTab,
  isLoadingPosts,
  isFetchingNextPage,
  hasContent,
  contentAnimatedStyle,
  userAddress,
  onBlockedPress,
  onSettingsPress,
  bottomSpacerHeight,
}: ProfileFooterProps) {
  if (activeTab === 2) {
    return (
      <Animated.View style={contentAnimatedStyle}>
        <ProfileAboutTab
          userAddress={userAddress ?? undefined}
          isOwnProfile
          onBlockedPress={onBlockedPress}
        />
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

  if (!hasContent) {
    return (
      <Animated.View style={contentAnimatedStyle}>
        <ProfileEmptyState
          tabType={activeTab === 0 ? "posts" : "comments"}
          onSettingsPress={onSettingsPress}
          isOwnProfile
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
      <View style={{ height: bottomSpacerHeight }} />
    </Animated.View>
  );
}
