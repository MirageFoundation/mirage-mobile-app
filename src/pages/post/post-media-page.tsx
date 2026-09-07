import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useQueryClient } from "@tanstack/react-query";
import { useComments, useUserFollowed } from "@/src/api/read";
import { Text } from "@/src/components/ui/primitives";
import { PreviewImageItem } from "@/src/components/molecules/preview-image-item";
import { PreviewVideoItem } from "@/src/components/molecules/media-preview-video-item";
import { PreviewYouTubeItem } from "@/src/components/molecules/media-preview-youtube-item";
import { PostActions } from "@/src/components/molecules/post-actions";
import { ModerationProvider } from "@/src/features/moderation/moderation-provider";
import { fullscreenMediaColors } from "@/src/components/molecules/post-actions-appearance";
import { resolvePostContent, shouldBlurMatureMedia } from "@/src/components/molecules/post-card-utils";
import { useAppState, useAuthGuard, useVoteHandler } from "@/src/hooks";
import { getThreadReplyPolicy } from "@/src/domain/content";
import { useRouter } from "@/src/navigation/guarded-router";
import { mediaRouteIndex, postMediaReturnRoute } from "@/src/navigation/post-media-route";
import { getShareBaseUrl, useAuthStore, usePreferencesStore, useSavedPostsStore } from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { usePostDetailActionStateStore } from "@/src/stores/post-detail-action-state-store";
import { usePostDetailResolvedPost } from "./use-post-detail-resolved-post";
import { usePostDetailPostState } from "./use-post-detail-post-state";
import { PostDetailActionSheets, type PostDetailActionSheetsRef } from "./post-detail-action-sheets";
import { shouldAutoplayVideo, useNetworkType } from "@/src/hooks/use-network-state";

export default function PostMediaPage() {
  const { id, index, syncContext, reveal, fromDetail } = useLocalSearchParams<{ id: string; index?: string; syncContext?: string; reveal?: string; fromDetail?: string }>();
  const router = useRouter();
  const blurSensitiveMedia = usePreferencesStore((state) => state.blurSensitiveMedia);
  const autoPlayVideos = usePreferencesStore((state) => state.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((state) => state.videoAutoplayNetwork);
  const networkType = useNetworkType();
  const [revealed, setRevealed] = useState(reveal === "true");
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const focused = useIsFocused();
  const { currentState } = useAppState();
  const active = focused && currentState === "active";
  const currentUser = useAuthStore((state) => state.user);
  const shareServer = usePreferencesStore((state) => state.apiServer);
  const { requireAuth } = useAuthGuard();
  const { data, isLoading } = useComments(id, { enabled: focused });
  const { data: followed } = useUserFollowed();
  const followedUsers = followed?.followed_users ?? [];
  const { post } = usePostDetailResolvedPost({ id, commentsData: data, currentUser, followedUsers, isViewingComment: false, queryClient });
  const { displayPost } = usePostDetailPostState({ id, post });
  const content = useMemo(() => resolvePostContent(post?.body, post?.media), [post?.body, post?.media]);
  const gated = shouldBlurMatureMedia(blurSensitiveMedia, post?.contentWarnings, revealed);
  const media = content.resolvedMediaList ?? (content.resolvedMedia ? [content.resolvedMedia] : []);
  const initialIndex = mediaRouteIndex(index, media.length);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selected = mediaRouteIndex(String(selectedIndex ?? initialIndex), media.length);
  const actionSheetsRef = useRef<PostDetailActionSheetsRef>(null);
  const saved = useSavedPostsStore((state) => state.savedPosts.some((item) => item.id === id));
  const votes = useVoteHandler({
    onOptimisticUpdate: (targetId, result) => useHomePostCardStore.getState().setVoteOverride(targetId, { hasLiked: result.hasLiked, hasDisliked: result.hasDisliked, likes: result.newLikes }),
    onRollback: (targetId) => useHomePostCardStore.getState().clearVoteOverride(targetId),
  });
  const close = () => router.canGoBack() ? router.back() : router.replace(postMediaReturnRoute(id));
  const policy = getThreadReplyPolicy(data?.root ?? { protocol_version: displayPost?.protocolVersion, thread_locked: displayPost?.threadLocked });
  const showComments = () => {
    usePostDetailActionStateStore.getState().requestComments(id);
    if (fromDetail === "true" && router.canGoBack()) router.back();
    else router.replace(postMediaReturnRoute(id));
  };
  const mediaHeight = Math.max(1, height - insets.top - insets.bottom - 112);

  return (
    <ModerationProvider fullscreen>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: fullscreenMediaColors.background, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ height: 48, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close fullscreen media" onPress={close} hitSlop={12}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={{ color: "#fff" }}>{media.length > 0 ? `${selected + 1} / ${media.length}` : "Media"}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Post options" onPress={() => requireAuth(() => actionSheetsRef.current?.presentPostOptions())} hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </Pressable>
      </View>
      {gated ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Reveal sensitive media" onPress={() => setRevealed(true)} style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: "#fff" }}>Sensitive content - tap to reveal</Text>
        </Pressable>
      ) : media.length > 0 ? (
        <FlatList
          key={width}
          data={media}
          horizontal
          pagingEnabled
          initialScrollIndex={selected}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          keyExtractor={(item, itemIndex) => `${item.uri}:${itemIndex}`}
          onMomentumScrollEnd={(event) => setSelectedIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: itemIndex }) => item.type === "video" ? (
            <PreviewVideoItem playbackControls allowAutoplay={shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType)} onDismiss={close} postId={id} item={item} width={width} height={mediaHeight} isActive={active && selected === itemIndex} shouldPrepare={active && selected === itemIndex} videoSyncScope={syncContext ?? `post:${id}`} />
          ) : item.type === "youtube" ? (
            <PreviewYouTubeItem item={item} width={width} height={mediaHeight} isActive={active && selected === itemIndex} videoSyncScope={syncContext ?? `post:${id}`} />
          ) : (
            <PreviewImageItem uri={item.uri} width={width} height={mediaHeight} onDismiss={close} />
          )}
        />
      ) : <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>{isLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Media unavailable</Text>}</View>}
      {displayPost ? (
        <View style={{ backgroundColor: fullscreenMediaColors.background, paddingHorizontal: 12, minHeight: 64, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <PostActions appearance="fullscreen" likes={displayPost.likes} dislikes={displayPost.dislikes} comments={displayPost.comments} hasLiked={displayPost.hasLiked} hasDisliked={displayPost.hasDisliked}
              moderationTarget={{ postId: id, authorId: displayPost.author.id, community: displayPost.rootCommunity || displayPost.community, lens: displayPost.lens, rootHash: data?.root ? data.root.root_post_id || data.root.post_id : null }}
              onLikePress={() => votes.handleUpvote(id, displayPost.hasLiked ?? false, displayPost.hasDisliked ?? false, displayPost.likes)}
              onDislikePress={() => votes.handleDownvote(id, displayPost.hasLiked ?? false, displayPost.hasDisliked ?? false, displayPost.likes)}
              onCommentPress={showComments} hideCommentAction={!policy.canReply}
              shareUrl={`${getShareBaseUrl(shareServer)}/p/${id}`} shareTitle={displayPost.title} postId={id}
              isOwnPost={currentUser?.id === displayPost.author.id} authorUsername={displayPost.author.username}
              onBlockPost={() => actionSheetsRef.current?.requestBlockPost()} onBlockUser={() => actionSheetsRef.current?.requestBlockPostAuthor()} onReport={() => actionSheetsRef.current?.requestReportPost()} onHidePost={close}
              style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={saved ? "Unsave post" : "Save post"} onPress={() => requireAuth(() => useSavedPostsStore.getState().toggleSavePost(displayPost))} hitSlop={10} style={{ padding: 8 }}>
              <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={22} color={fullscreenMediaColors.text} />
            </Pressable>
          </View>
          {!policy.canReply ? <Text size="xs" style={{ color: fullscreenMediaColors.subtleText }}>{policy.notice}</Text> : null}
        </View>
      ) : null}
      <PostDetailActionSheets ref={actionSheetsRef} id={id} actualRootPostId={id} currentUserId={currentUser?.id} post={displayPost} rootPost={data?.root} followedUsers={followedUsers} joinedCommunities={followed?.joined_communities ?? []} />
    </GestureHandlerRootView>
    </ModerationProvider>
  );
}
