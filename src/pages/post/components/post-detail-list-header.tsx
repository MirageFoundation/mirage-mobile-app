import type { LayoutChangeEvent } from "react-native";
import { View } from "react-native";
import Animated from "react-native-reanimated";

import { PostCard, type Post } from "@/src/components/molecules";
import { PostDetailLoadingHeader } from "./post-detail-loading-header";

type PostDetailListHeaderProps = {
  displayPost: Post | null;
  currentUserId?: string;
  isVideoVisible: boolean;
  isTopicFollowed: boolean;
  screenActive: boolean;
  onAuthorPress: () => void;
  onTopicPress: () => void;
  onLikePress: () => void;
  onDislikePress: () => void;
  onFollowUser: () => void;
  onFollowTopic: () => void;
  onMorePress: () => void;
  onBlockUser: () => void;
  onBlockPost: () => void;
  onReport: () => void;
  onRevealContent: () => void;
  contentRevealed: boolean;
  shareUrl: string;
  videoSyncScope?: string;
  onLayout: (event: LayoutChangeEvent) => void;
  animatedStyle: object;
  dividerColor: string;
  loadingBackgroundColor: string;
};

export function PostDetailListHeader({
  displayPost,
  currentUserId,
  isVideoVisible,
  isTopicFollowed,
  screenActive,
  onAuthorPress,
  onTopicPress,
  onLikePress,
  onDislikePress,
  onFollowUser,
  onFollowTopic,
  onMorePress,
  onBlockUser,
  onBlockPost,
  onReport,
  onRevealContent,
  contentRevealed,
  shareUrl,
  videoSyncScope,
  onLayout,
  animatedStyle,
  dividerColor,
  loadingBackgroundColor,
}: PostDetailListHeaderProps) {
  if (!displayPost) {
    return (
      <PostDetailLoadingHeader
        onLayout={onLayout}
        backgroundColor={loadingBackgroundColor}
      />
    );
  }

  return (
    <Animated.View style={animatedStyle} onLayout={onLayout}>
      <PostCard
        post={displayPost}
        isOwnPost={currentUserId === displayPost.author.id}
        isVisible={isVideoVisible}
        isTopicFollowed={isTopicFollowed}
        screenActive={screenActive}
        onAuthorPress={onAuthorPress}
        onTopicPress={onTopicPress}
        onLikePress={onLikePress}
        onDislikePress={onDislikePress}
        onFollowUser={onFollowUser}
        onFollowTopic={onFollowTopic}
        onMorePress={onMorePress}
        onBlockUser={onBlockUser}
        onBlockPost={onBlockPost}
        onReport={onReport}
        onRevealContent={onRevealContent}
        contentRevealed={contentRevealed}
        shareUrl={shareUrl}
        showUrlCard={false}
        hideCommentAction
        showMoreButton
        isPostDetail
        videoSyncScope={videoSyncScope}
      />
      <View style={{ height: 5, backgroundColor: dividerColor }} />
    </Animated.View>
  );
}
