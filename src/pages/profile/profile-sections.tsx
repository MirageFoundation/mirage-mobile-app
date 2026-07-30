import type { Post as ApiPost } from "@/src/api/types";
import {
  ProfileEmptyState,
  ProfileTabBar,
  type Post,
} from "@/src/components/molecules";
import { PostCardItem } from "@/src/components/molecules/post-card-item";
import { PostCardSkeletonList } from "@/src/components/molecules/post-card-skeleton";
import { ProfileCommentItem } from "@/src/components/molecules/profile-comment-item";
import { ProfileContentAnimated } from "@/src/components/molecules/profile-content-animated";
import { ProfilePostsSkeleton } from "@/src/components/molecules/profile-posts-skeleton";
import { getShareBaseUrl } from "@/src/stores";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import { memo } from "react";
import { Dimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { ProfileAboutTab } from "./profile-about-tab";
import type { OwnProfileListItem } from "./profile-state";
import { styles } from "./profile-styles";
import {
  PROFILE_POSTS_FEED_CONTEXT,
  type ProfileController,
} from "./use-profile-controller";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const MemoizedPostCardItem = memo(PostCardItem, (previous, next) => {
  const oldPost = previous.post;
  const newPost = next.post;
  return oldPost.id === newPost.id
    && oldPost.title === newPost.title
    && oldPost.body === newPost.body
    && oldPost.likes === newPost.likes
    && oldPost.dislikes === newPost.dislikes
    && oldPost.comments === newPost.comments
    && oldPost.hasLiked === newPost.hasLiked
    && oldPost.hasDisliked === newPost.hasDisliked
    && oldPost.awards?.length === newPost.awards?.length
    && previous.isVisible === next.isVisible
    && previous.isFocused === next.isFocused
    && previous.isNearVisible === next.isNearVisible
    && previous.screenActive === next.screenActive;
});
const MemoizedProfileCommentItem = memo(ProfileCommentItem, (previous, next) =>
  previous.comment.post_id === next.comment.post_id
  && previous.comment.content === next.comment.content
  && previous.comment.points === next.comment.points,
);

const OwnProfilePost = memo(function OwnProfilePost({
  post,
  controller,
}: {
  post: Post;
  controller: ProfileController;
}) {
  const editOverride = usePostEditStore((state) => state.overrides[post.id]);
  const displayPost = editOverride ? {
    ...post,
    title: editOverride.title,
    body: editOverride.content || undefined,
    topic: editOverride.topic ?? post.topic,
    media: editOverride.media
      ? editOverride.media.map((url: string) => ({ uri: url, type: "image" as const }))
      : post.media,
  } : post;
  return (
    <MemoizedPostCardItem
      post={displayPost}
      isOwnPost
      isVisible={controller.visibleVideoPostIds.has(post.id)}
      isFocused={controller.activeVideoPostId === post.id}
      isNearVisible={controller.nearbyVideoPostIds.has(post.id)}
      screenActive={controller.isFocused}
      showUrlCard={false}
      videoSyncScope={PROFILE_POSTS_FEED_CONTEXT}
      shareUrl={`${getShareBaseUrl(controller.shareServer)}/p/${post.id}`}
      onPostPress={controller.handlePostPress}
      onAuthorPress={controller.handleAuthorPress}
      onCommentPress={controller.handlePostPress}
      onMorePress={controller.handlePostMorePress}
      onLikePress={controller.handleUpvote}
      onDislikePress={controller.handleDownvote}
      onTopicPress={controller.handleTopicPress}
    />
  );
});

function OwnProfileComment({
  comment,
  onPress,
}: {
  comment: ApiPost;
  onPress: (commentId: string, rootPostId: string) => void;
}) {
  return <MemoizedProfileCommentItem comment={comment} onPress={onPress} />;
}

export function ProfileSectionRenderer({
  item,
  controller,
}: {
  item: OwnProfileListItem;
  controller: ProfileController;
}) {
  if (item === "header") {
    return (
      <ProfileContentAnimated
        username={controller.username}
        avatarSeed={controller.walletAddress || controller.username}
        avatarUrl={controller.avatarUrl}
        walletAddress={controller.walletAddress || "0x0000...0000"}
        balance={controller.profileData.balance}
        reserve={controller.profileData.reserve}
        accountAgeDays={controller.profileData.accountAgeDays}
        gradientColors={controller.gradientColors}
        scrollY={controller.scrollY}
        onFollowersPress={controller.handleFollowersPress}
        onEditUsernamePress={controller.handleEditUsernamePress}
        isLoading={controller.isLoading}
        headerHeight={controller.headerHeight}
        userLevel={controller.userStatus?.user_level ?? 0}
      />
    );
  }
  if (item === "tabs") {
    if (controller.isTabsSticky) return <View style={styles.inlineTabPlaceholder} />;
    return (
      <View>
        <ProfileTabBar
          activeTab={controller.activeTab}
          onTabChange={controller.handleTabChange}
          onTabDoubleTap={controller.handleTabDoubleTap}
          tabWidth={SCREEN_WIDTH}
          animatedIndex={controller.animatedTabIndex}
        />
      </View>
    );
  }
  if (controller.activeTab === 0 && "id" in item) {
    const post = controller.postsWithoutWarnings.get(item.id) || item;
    return (
      <Animated.View style={controller.contentAnimatedStyle}>
        <OwnProfilePost post={post} controller={controller} />
      </Animated.View>
    );
  }
  if (controller.activeTab === 1 && "post_id" in item) {
    return (
      <Animated.View style={controller.contentAnimatedStyle}>
        <OwnProfileComment comment={item} onPress={controller.handleCommentPress} />
      </Animated.View>
    );
  }
  return null;
}

export function ProfileSectionsFooter({ controller }: { controller: ProfileController }) {
  if (controller.activeTab === 2) {
    return (
      <Animated.View style={controller.contentAnimatedStyle}>
        <ProfileAboutTab
          userAddress={controller.walletAddress ?? undefined}
          isOwnProfile
          onBlockedPress={controller.handleBlockedPress}
        />
      </Animated.View>
    );
  }
  if (controller.isLoadingPosts) {
    return (
      <Animated.View style={controller.contentAnimatedStyle}>
        {controller.activeTab === 0
          ? <PostCardSkeletonList count={3} />
          : <ProfilePostsSkeleton count={5} type="comments" />}
      </Animated.View>
    );
  }
  if (controller.listData.length <= 2) {
    return (
      <Animated.View style={controller.contentAnimatedStyle}>
        <ProfileEmptyState
          tabType={controller.activeTab === 0 ? "posts" : "comments"}
          onSettingsPress={controller.handleSettingsPress}
          isOwnProfile
        />
      </Animated.View>
    );
  }
  if (controller.isFetchingNextPage) {
    return (
      <Animated.View style={controller.contentAnimatedStyle}>
        {controller.activeTab === 0
          ? <PostCardSkeletonList count={1} />
          : <ProfilePostsSkeleton count={2} type="comments" />}
      </Animated.View>
    );
  }
  return (
    <Animated.View style={controller.contentAnimatedStyle}>
      <View style={styles.bottomSpacer} />
    </Animated.View>
  );
}
