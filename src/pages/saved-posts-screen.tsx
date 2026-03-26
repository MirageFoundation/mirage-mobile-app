import { navigateToEditPost } from "@/src/utils/edit-post";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import { useIsFocused } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  type Post,
  type SavedComment,
} from "@/src/stores";
import {
  type Comment,
  CommentOptionsSheet,
  type CommentOptionsSheetRef,
  PostOptionsSheet,
  type PostOptionsSheetRef,
  PostCardItem,
} from "@/src/components/molecules";
import { Text } from "@/src/components/ui/primitives";
import {
  useAuthGuard,
  useNetworkState,
  useVoteHandler,
  type VoteResult,
} from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import {
  useAuthStore,
  useContentModerationStore,
  useSavedPostsStore,
  usePreferencesStore,
  getShareBaseUrl,
} from "@/src/stores";

import { SavedCommentItem } from "./saved/saved-posts-comment-item";
import { SavedPostsEmptyState } from "./saved/saved-posts-empty-state";
import {
  SAVED_POSTS_SCREEN_WIDTH,
  SAVED_TABS,
  SAVED_TAB_VELOCITY_THRESHOLD,
  SavedTabBar,
} from "./saved/saved-posts-tab-bar";
import { useSavedPostsViewability } from "./saved/use-saved-posts-viewability";

const TAB_COUNT = SAVED_TABS.length;

type VoteOverride = {
  hasLiked: boolean;
  hasDisliked: boolean;
  likeDelta: number;
};

export function SavedPostsScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const toast = useToast();
  const { requireAuth } = useAuthGuard();

  const [activeTab, setActiveTab] = useState(0);
  const animatedTabIndex = useSharedValue(0);
  const contentTranslateX = useSharedValue(0);
  const fadeOpacity = useSharedValue(1);
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const commentOptionsSheetRef = useRef<CommentOptionsSheetRef>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedComment, setSelectedComment] = useState<SavedComment | null>(null);
  const [voteOverrides, setVoteOverrides] = useState<Record<string, VoteOverride>>({});

  const currentUser = useAuthStore((s) => s.user);
  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const savedComments = useSavedPostsStore((s) => s.savedComments);
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedTopicNames = useContentModerationStore((s) => s.blockedTopicNames);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((s) => s.videoAutoplayNetwork);
  const { networkType } = useNetworkState();

  const { handleUpvote, handleDownvote } = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
      setVoteOverrides((prev) => {
        const existing = prev[targetId];
        return {
          ...prev,
          [targetId]: {
            hasLiked: result.hasLiked,
            hasDisliked: result.hasDisliked,
            likeDelta: (existing?.likeDelta ?? 0) + result.likeDelta,
          },
        };
      });
    }, []),
    onRollback: useCallback((targetId: string) => {
      setVoteOverrides((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    }, []),
  });

  const visiblePosts = useMemo(
    () =>
      savedPosts.filter(
        (post) =>
          !hiddenPostIds.has(post.id) &&
          !(post.topic && blockedTopicNames.has(post.topic.toLowerCase())),
      ),
    [blockedTopicNames, hiddenPostIds, savedPosts],
  );

  const postsWithOverrides = useMemo(
    () =>
      visiblePosts.map((post) => {
        const override = voteOverrides[post.id];
        if (!override) return post;
        return {
          ...post,
          hasLiked: override.hasLiked,
          hasDisliked: override.hasDisliked,
          likes: post.likes + override.likeDelta,
        };
      }),
    [visiblePosts, voteOverrides],
  );

  const {
    activeVideoPostId,
    allowAutoplay,
    currentState,
    handleSavedPostsMomentumScrollEnd,
    onSavedPostsViewableItemsChanged,
    savedPostsViewabilityConfig,
    visibleVideoPostIds,
  } = useSavedPostsViewability({
    activeTab,
    autoPlayVideos,
    networkType,
    postsWithOverrides,
    videoAutoplayNetwork,
  });

  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router],
  );

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      router.push(`/user/${authorId}`);
    },
    [router],
  );

  const handleTopicPress = useCallback(
    (topic: string) => {
      router.push(`/topic/${encodeURIComponent(topic)}`);
    },
    [router],
  );

  const handleMorePress = useCallback(
    (postId: string) => {
      const post = postsWithOverrides.find((candidate) => candidate.id === postId);
      if (!post) return;
      setSelectedPost(post);
      postOptionsSheetRef.current?.present();
    },
    [postsWithOverrides],
  );

  const handleLikePress = useCallback(
    (
      postId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number,
    ) => {
      requireAuth(() => {
        handleUpvote(postId, currentlyLiked, currentlyDisliked, currentLikes);
      });
    },
    [handleUpvote, requireAuth],
  );

  const handleDislikePress = useCallback(
    (
      postId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number,
    ) => {
      requireAuth(() => {
        handleDownvote(postId, currentlyLiked, currentlyDisliked, currentLikes);
      });
    },
    [handleDownvote, requireAuth],
  );

  const handleCommentPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router],
  );

  const handleEditPost = useCallback(() => {
    if (!selectedPost) return;
    navigateToEditPost(router, selectedPost);
  }, [router, selectedPost]);

  const handleSavePost = useCallback(() => {
    if (!selectedPost) return;
    const saved = useSavedPostsStore.getState().toggleSavePost(selectedPost);
    toast.success(
      saved ? "Post saved" : "Post unsaved",
      saved ? "You can find it in your saved items." : "Removed from saved items.",
    );
  }, [selectedPost, toast]);

  const handleSaveComment = useCallback(() => {
    if (!selectedComment) return;
    const saved = useSavedPostsStore.getState().toggleSaveComment(
      selectedComment,
      selectedComment.rootPostId,
    );
    toast.success(
      saved ? "Comment saved" : "Comment unsaved",
      saved ? "You can find it in your saved items." : "Removed from saved items.",
    );
  }, [selectedComment, toast]);

  const handleCopyText = useCallback(() => {
    toast.success("Copied", "Text copied to clipboard.");
  }, [toast]);

  const handleSavedCommentPress = useCallback(
    (comment: SavedComment) => {
      if (comment.rootPostId) {
        router.push(`/post/${comment.rootPostId}?highlight=${comment.id}`);
      }
    },
    [router],
  );

  const handleSavedCommentLongPress = useCallback((comment: SavedComment) => {
    setSelectedComment(comment);
    commentOptionsSheetRef.current?.present();
  }, []);

  const renderPostItem = useCallback(
    ({ item }: { item: Post }) => (
      <PostCardItem
        post={item}
        isVisible={visibleVideoPostIds.has(item.id)}
        isFocused={activeVideoPostId === item.id}
        screenActive={isFocused && activeTab === 0 && currentState === "active"}
        isOwnPost={currentUser?.id === item.author.id}
        shareUrl={`${getShareBaseUrl(shareServer)}/p/${item.id}`}
        showUrlCard={false}
        allowAutoplay={allowAutoplay}
        onPostPress={handlePostPress}
        onAuthorPress={handleAuthorPress}
        onTopicPress={handleTopicPress}
        onMorePress={handleMorePress}
        onLikePress={handleLikePress}
        onDislikePress={handleDislikePress}
        onCommentPress={handleCommentPress}
      />
    ),
    [
      activeTab,
      activeVideoPostId,
      allowAutoplay,
      currentState,
      currentUser?.id,
      handleAuthorPress,
      handleCommentPress,
      handleDislikePress,
      handleLikePress,
      handleMorePress,
      handlePostPress,
      handleTopicPress,
      isFocused,
      shareServer,
      visibleVideoPostIds,
    ],
  );

  const renderCommentItem = useCallback(
    ({ item }: { item: SavedComment }) => (
      <Pressable
        onLongPress={() => handleSavedCommentLongPress(item)}
        delayLongPress={200}
      >
        <SavedCommentItem comment={item} onPress={handleSavedCommentPress} />
      </Pressable>
    ),
    [handleSavedCommentLongPress, handleSavedCommentPress],
  );

  const postKeyExtractor = useCallback((item: Post) => item.id, []);
  const commentKeyExtractor = useCallback((item: SavedComment) => item.id, []);

  const handleSwipeTabChange = useCallback((index: number) => {
    setActiveTab(index);
  }, []);

  const completeTransition = useCallback(
    (targetTab: number) => {
      contentTranslateX.value = 0;
      handleSwipeTabChange(targetTab);
      setTimeout(() => {
        fadeOpacity.value = withTiming(1, { duration: 180 });
      }, 50);
    },
    [contentTranslateX, fadeOpacity, handleSwipeTabChange],
  );

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-15, 15])
        .failOffsetY([-10, 10])
        .onStart(() => {
          "worklet";
          fadeOpacity.value = 1;
        })
        .onUpdate((event) => {
          "worklet";
          const progress = -event.translationX / SAVED_POSTS_SCREEN_WIDTH;
          const newIndex = activeTab + progress;
          const clampedIndex = Math.max(0, Math.min(TAB_COUNT - 1, newIndex));
          animatedTabIndex.value = clampedIndex;
          contentTranslateX.value =
            -(clampedIndex - activeTab) * SAVED_POSTS_SCREEN_WIDTH;
        })
        .onEnd((event) => {
          "worklet";
          const velocity = event.velocityX;
          let targetTab: number;
          if (Math.abs(velocity) > SAVED_TAB_VELOCITY_THRESHOLD) {
            targetTab =
              velocity < 0
                ? Math.min(activeTab + 1, TAB_COUNT - 1)
                : Math.max(activeTab - 1, 0);
          } else {
            targetTab = Math.round(animatedTabIndex.value);
          }
          targetTab = Math.max(0, Math.min(TAB_COUNT - 1, targetTab));

          animatedTabIndex.value = withTiming(targetTab, { duration: 200 });

          if (targetTab === activeTab) {
            contentTranslateX.value = withTiming(0, { duration: 200 });
          } else {
            const direction = targetTab > activeTab ? -1 : 1;
            contentTranslateX.value = withTiming(
              direction * SAVED_POSTS_SCREEN_WIDTH,
              { duration: 120 },
              (finished) => {
                "worklet";
                if (finished) {
                  fadeOpacity.value = 0;
                  runOnJS(completeTransition)(targetTab);
                }
              },
            );
          }
        }),
    [activeTab, animatedTabIndex, completeTransition, contentTranslateX, fadeOpacity],
  );

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const gestureOpacity = interpolate(
      Math.abs(contentTranslateX.value),
      [0, SAVED_POSTS_SCREEN_WIDTH * 0.5, SAVED_POSTS_SCREEN_WIDTH],
      [1, 0.3, 0],
      "clamp",
    );
    return {
      transform: [{ translateX: contentTranslateX.value }],
      opacity: Math.min(gestureOpacity, fadeOpacity.value),
    };
  });

  const handleTabChange = useCallback(
    (index: number) => {
      if (index === activeTab) return;
      animatedTabIndex.value = withTiming(index, { duration: 200 });
      fadeOpacity.value = withTiming(
        0,
        { duration: 100 },
        (finished) => {
          "worklet";
          if (finished) {
            runOnJS(completeTransition)(index);
          }
        },
      );
    },
    [activeTab, animatedTabIndex, completeTransition, fadeOpacity],
  );

  const renderEmptyState = useCallback(
    (type: "posts" | "comments") => <SavedPostsEmptyState type={type} />,
    [],
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background.default },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.default,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.text.default}
          />
        </Pressable>
        <Text size="lg" weight="bold">
          Saved
        </Text>
        <View style={styles.placeholder} />
      </View>

      <View
        style={[
          styles.headerDivider,
          { backgroundColor: theme.colors.border.subtle },
        ]}
      />

      <SavedTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        animatedIndex={animatedTabIndex}
      />

      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
          {activeTab === 0 ? (
            postsWithOverrides.length === 0 ? (
              renderEmptyState("posts")
            ) : (
              <FlatList
                data={postsWithOverrides}
                keyExtractor={postKeyExtractor}
                renderItem={renderPostItem}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                showsVerticalScrollIndicator={false}
                windowSize={Platform.OS === "android" ? 11 : 13}
                maxToRenderPerBatch={Platform.OS === "android" ? 7 : 9}
                initialNumToRender={5}
                viewabilityConfig={savedPostsViewabilityConfig}
                onViewableItemsChanged={onSavedPostsViewableItemsChanged}
                onMomentumScrollEnd={handleSavedPostsMomentumScrollEnd}
              />
            )
          ) : savedComments.length === 0 ? (
            renderEmptyState("comments")
          ) : (
            <FlatList
              data={savedComments}
              keyExtractor={commentKeyExtractor}
              renderItem={renderCommentItem}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Animated.View>
      </GestureDetector>

      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={currentUser?.id === selectedPost?.author.id}
        isSaved={
          selectedPost ? savedPosts.some((post) => post.id === selectedPost.id) : false
        }
        onSave={handleSavePost}
        onEdit={handleEditPost}
        onCopyText={handleCopyText}
        onDismiss={() => setSelectedPost(null)}
      />

      <CommentOptionsSheet
        ref={commentOptionsSheetRef}
        comment={selectedComment as unknown as Comment | null}
        rootPostId={selectedComment?.rootPostId}
        isOwnComment={currentUser?.id === selectedComment?.author.id}
        isSaved={
          selectedComment
            ? savedComments.some((comment) => comment.id === selectedComment.id)
            : false
        }
        onSave={handleSaveComment}
        onDismiss={() => setSelectedComment(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 0,
  },
  headerDivider: {
    height: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 40,
  },
}));
