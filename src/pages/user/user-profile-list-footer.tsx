import Animated from "react-native-reanimated";
import { ProfileEmptyState } from "@/src/components/molecules";
import { PostCardSkeletonList } from "@/src/components/molecules/post-card-skeleton";
import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { ProfileAboutTab } from "@/src/pages/profile/profile-about-tab";
import { View } from "react-native";
import { styles } from "./user-profile-styles";

type UserProfileListFooterProps = {
  activeTab: number;
  contentAnimatedStyle: unknown;
  isBlocked: boolean;
  isFetchingNextPage: boolean;
  isLoadingPosts: boolean;
  isOwnProfile: boolean;
  listDataLength: number;
  userAddress: string | null;
  onSettingsPress: () => void;
  onUnblock: () => void;
};

export function UserProfileListFooter({
  activeTab,
  contentAnimatedStyle,
  isBlocked,
  isFetchingNextPage,
  isLoadingPosts,
  isOwnProfile,
  listDataLength,
  userAddress,
  onSettingsPress,
  onUnblock,
}: UserProfileListFooterProps) {
  if (isBlocked) {
    const tabType = activeTab === 0 ? "posts" : activeTab === 1 ? "comments" : "about";
    return (
      <Animated.View style={contentAnimatedStyle as never}>
        <ProfileEmptyState
          tabType={tabType}
          isOwnProfile={false}
          isBlocked
          onUnblock={onUnblock}
        />
      </Animated.View>
    );
  }

  if (activeTab === 2) {
    return (
      <Animated.View style={contentAnimatedStyle as never}>
        <ProfileAboutTab userAddress={userAddress} isOwnProfile={isOwnProfile} />
      </Animated.View>
    );
  }

  if (isLoadingPosts) {
    return activeTab === 0 ? (
      <Animated.View style={contentAnimatedStyle as never}>
        <PostCardSkeletonList count={3} />
      </Animated.View>
    ) : (
      <Animated.View style={contentAnimatedStyle as never}>
        <ProfilePostsSkeleton count={5} type="comments" />
      </Animated.View>
    );
  }

  if (listDataLength <= 2) {
    const tabType = activeTab === 0 ? "posts" : "comments";
    return (
      <Animated.View style={contentAnimatedStyle as never}>
        <ProfileEmptyState
          tabType={tabType}
          onSettingsPress={onSettingsPress}
          isOwnProfile={false}
        />
      </Animated.View>
    );
  }

  if (isFetchingNextPage) {
    return activeTab === 0 ? (
      <Animated.View style={contentAnimatedStyle as never}>
        <PostCardSkeletonList count={1} />
      </Animated.View>
    ) : (
      <Animated.View style={contentAnimatedStyle as never}>
        <ProfilePostsSkeleton count={2} type="comments" />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={contentAnimatedStyle as never}>
      <View style={styles.bottomSpacer} />
    </Animated.View>
  );
}
