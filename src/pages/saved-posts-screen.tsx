import { navigateToEditPost } from "@/src/utils/edit-post";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "@/src/hooks/use-router";
import { useIsFocused } from "@react-navigation/native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, Platform, Pressable, View, type ViewToken } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  interpolateColor,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  type Post,
  PostOptionsSheet,
  type PostOptionsSheetRef,
  CommentOptionsSheet,
  type CommentOptionsSheetRef,
  type Comment,
} from "@/src/components/molecules";
import { PostCardItem } from "@/src/components/molecules/post-card-item";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { TimeAgo } from "@/src/components/atoms";
import {
  useAppState,
  useAuthGuard,
  useNetworkState,
  useVoteHandler,
  shouldAutoplayVideo,
  type VoteResult,
} from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import {
  useAuthStore,
  useContentModerationStore,
  useSavedPostsStore,
  usePreferencesStore,
  useFeedScrollStore,
  getShareBaseUrl,
  type SavedComment,
} from "@/src/stores";

import { triggerHaptic } from "@/src/components/utils/haptics";
import { MediaPreviewModal } from "@/src/components/molecules/media-preview-modal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MEDIA_HORIZONTAL_PADDING = 32;
const SAVED_POSTS_FEED_CONTEXT = "saved:posts";
const emptyInfoImage = require("@/assets/images/empty-info.png");

const IMAGE_URL_REGEX = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))$/i;
const CLOUDFLARE_IMAGE_REGEX = /^https?:\/\/imagedelivery\.net\/[^\s]+$/i;
const GIPHY_URL_REGEX =
  /^https?:\/\/(?:media\d?\.giphy\.com|i\.giphy\.com)\/[^\s]+$/i;

function isImageUrl(url: string): boolean {
  return (
    IMAGE_URL_REGEX.test(url) ||
    CLOUDFLARE_IMAGE_REGEX.test(url) ||
    GIPHY_URL_REGEX.test(url)
  );
}

function extractImageUrls(content: string): {
  text: string;
  imageUrls: string[];
} {
  const imageUrls: string[] = [];
  const textLines: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (isImageUrl(trimmed)) {
      imageUrls.push(trimmed);
    } else {
      textLines.push(line);
    }
  }
  return { text: textLines.join("\n").trim(), imageUrls };
}

const CommentImage = memo(function CommentImage({ url, onPress }: { url: string; onPress?: (url: string) => void }) {
  const { theme } = useUnistyles();
  const [hasError, setHasError] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const mediaSource = useMemo(() => ({ uri: url }), [url]);

  const MEDIA_MAX_HEIGHT = 450;
  const containerWidth = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
  const calculatedHeight = containerWidth / aspectRatio;
  const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;
  const mediaWrapperStyle = exceedsMaxHeight
    ? { height: MEDIA_MAX_HEIGHT }
    : { aspectRatio };

  if (hasError) {
    return (
      <View
        style={[
          styles.imageError,
          { backgroundColor: theme.colors.background.subtle },
        ]}
      >
        <Text size="xs" mode="subtle">
          Failed to load image
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.mediaContainer}>
      <Pressable
        style={[styles.mediaWrapper, mediaWrapperStyle]}
        onPress={() => {
          if (onPress) {
            triggerHaptic("selection");
            onPress(url);
          }
        }}
      >
        <Image
          source={mediaSource}
          style={styles.commentImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={url}
          onLoad={({ source }) => {
            if (source?.width && source?.height) {
              setAspectRatio(source.width / source.height);
            }
            setMediaLoaded(true);
          }}
          onError={() => setHasError(true)}
        />
        {!mediaLoaded && (
          <View style={styles.skeletonOverlay}>
            <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
          </View>
        )}
      </Pressable>
    </View>
  );
});

const SAVED_TABS = [
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
] as const;

type VoteOverride = {
  hasLiked: boolean;
  hasDisliked: boolean;
  likeDelta: number;
};

const AnimatedTabLabel = ({
  label,
  index,
  animatedIndex,
  activeColor,
  inactiveColor,
}: {
  label: string;
  index: number;
  animatedIndex: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
}) => {
  const animStyle = useAnimatedStyle(() => {
    const distance = Math.abs(animatedIndex.value - index);
    const opacity = interpolate(distance, [0, 0.5, 1], [1, 0.6, 0.5], "clamp");
    const scale = interpolate(distance, [0, 1], [1, 0.97], "clamp");
    const color = interpolateColor(
      distance,
      [0, 0.5],
      [activeColor, inactiveColor],
    );
    return {
      opacity,
      transform: [{ scale }],
      color,
      fontWeight: distance < 0.5 ? "700" : "500",
    } as any;
  });

  return (
    <Animated.Text style={[styles.tabLabel, animStyle]}>
      {label}
    </Animated.Text>
  );
};

const TAB_COUNT = SAVED_TABS.length;
const VELOCITY_THRESHOLD = 500;

const SavedTabBar = ({
  activeTab,
  onTabChange,
  animatedIndex: externalAnimatedIndex,
}: {
  activeTab: number;
  onTabChange: (index: number) => void;
  animatedIndex?: SharedValue<number>;
}) => {
  const { theme } = useUnistyles();
  const internalIndex = useSharedValue(activeTab);
  const animatedIndex = externalAnimatedIndex ?? internalIndex;

  useEffect(() => {
    if (!externalAnimatedIndex) {
      internalIndex.value = withTiming(activeTab, { duration: 200 });
    }
  }, [activeTab, internalIndex, externalAnimatedIndex]);

  const singleTabWidth = SCREEN_WIDTH / TAB_COUNT;

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: animatedIndex.value * singleTabWidth }],
  }));

  return (
    <View style={styles.tabBarContainer}>
      <View
        style={[
          styles.tabBar,
          { backgroundColor: theme.colors.background.default },
        ]}
      >
        {SAVED_TABS.map((tab, index) => (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(index)}
            style={styles.tab}
          >
            <AnimatedTabLabel
              label={tab.label}
              index={index}
              animatedIndex={animatedIndex}
              activeColor={theme.colors.text.default}
              inactiveColor={theme.colors.text.subtle}
            />
          </Pressable>
        ))}
      </View>
      <Animated.View
        style={[
          styles.indicator,
          { width: singleTabWidth, backgroundColor: theme.colors.text.default },
          indicatorStyle,
        ]}
      />
      <View
        style={[
          styles.tabBarBorder,
          { backgroundColor: theme.colors.border.subtle },
        ]}
      />
    </View>
  );
};

const SavedCommentItem = ({
  comment,
  onPress,
}: {
  comment: SavedComment;
  onPress: (comment: SavedComment) => void;
}) => {
  const { theme } = useUnistyles();
  const displayPoints = comment.likes;
  const hasUpvoted = comment.hasLiked;
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const { text: commentText, imageUrls } = useMemo(
    () => extractImageUrls(comment.content),
    [comment.content],
  );

  const handleImagePress = useCallback((url: string) => {
    setPreviewImageUrl(url);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewImageUrl(null);
  }, []);

  return (
    <>
      <Pressable
        onPress={() => onPress(comment)}
        style={styles.commentContainer}
      >
        <View style={styles.commentMetaRow}>
          <TimeAgo
            timestamp={
              typeof comment.createdAt === "number"
                ? comment.createdAt
                : new Date(comment.createdAt).getTime()
            }
            showSuffix={false}
            size="sm"
          />
          <Text size="sm" mode="subtle" style={styles.commentDot}>
            ·
          </Text>
          <Text
            size="sm"
            weight={hasUpvoted ? "semibold" : "regular"}
            style={{
              color: hasUpvoted
                ? theme.colors.success[500]
                : theme.colors.text.subtle,
            }}
          >
            {displayPoints} points
          </Text>
        </View>
        <View>
          {commentText.length > 0 && (
            <MarkdownContent content={commentText} />
          )}
          {imageUrls.map((url, index) => (
            <CommentImage
              key={`img-${index}`}
              url={url}
              onPress={handleImagePress}
            />
          ))}
        </View>
      </Pressable>

      <MediaPreviewModal
        visible={!!previewImageUrl}
        media={previewImageUrl ? { type: "image", uri: previewImageUrl } : null}
        onClose={handleClosePreview}
      />
    </>
  );
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
  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  const [visibleVideoPostIds, setVisibleVideoPostIds] = useState<Set<string>>(new Set());

  const currentUser = useAuthStore((s) => s.user);
  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const savedComments = useSavedPostsStore((s) => s.savedComments);
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedTopicNames = useContentModerationStore((s) => s.blockedTopicNames);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((s) => s.videoAutoplayNetwork);

  const { networkType } = useNetworkState();

  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType],
  );

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
    () => savedPosts.filter((p) => !hiddenPostIds.has(p.id) && !(p.topic && blockedTopicNames.has(p.topic.toLowerCase()))),
    [savedPosts, hiddenPostIds, blockedTopicNames],
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

  const savedPostsViewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 30,
    minimumViewTime: 300,
  }).current;
  const pendingSavedPostsViewableRef = useRef<ViewToken[] | null>(null);
  const savedPostsDeferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSavedPostsViewability = useCallback(() => {
    const items = pendingSavedPostsViewableRef.current;
    if (!items || activeTab !== 0) {
      setVisibleVideoPostIds(new Set());
      setActiveVideoPostId(null);
      return;
    }

    const visibleItems = items.filter(
      (item) => item.isViewable && item.item && typeof item.item === "object" && "id" in item.item,
    );
    if (visibleItems.length === 0) {
      setVisibleVideoPostIds(new Set());
      setActiveVideoPostId(null);
      return;
    }

    const videoItems = visibleItems.filter((item) => postHasPlayableVideo(item.item));
    const newVisibleIds = new Set(videoItems.map((item) => item.item.id));
    setVisibleVideoPostIds(newVisibleIds);

    if (videoItems.length > 0) {
      const sortedIndices = visibleItems
        .map((v) => v.index ?? 0)
        .sort((a, b) => a - b);
      const mid = Math.floor((sortedIndices.length - 1) / 2);
      const centerIndex = sortedIndices[mid] ?? 0;
      const visibleSpan = (sortedIndices[sortedIndices.length - 1] ?? 0) - (sortedIndices[0] ?? 0);
      const maxDist = Math.max(1, visibleSpan * 0.35);
      let best = videoItems[0];
      let bestDist = Math.abs((best.index ?? 0) - centerIndex);
      for (let i = 1; i < videoItems.length; i++) {
        const d = Math.abs((videoItems[i].index ?? 0) - centerIndex);
        if (d < bestDist) {
          best = videoItems[i];
          bestDist = d;
        }
      }
      setActiveVideoPostId(bestDist <= maxDist ? best.item.id : null);
    } else {
      setActiveVideoPostId(null);
    }
  }, [activeTab]);

  const activeVideoPostIdRef = useRef(activeVideoPostId);
  activeVideoPostIdRef.current = activeVideoPostId;

  const onSavedPostsViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      pendingSavedPostsViewableRef.current = viewableItems;

      const currentActive = activeVideoPostIdRef.current;
      if (currentActive) {
        const stillVisible = viewableItems.some(
          (v) => v.isViewable && v.item && typeof v.item === "object" && "id" in v.item && v.item.id === currentActive,
        );
        if (!stillVisible) {
          setActiveVideoPostId(null);
        }
      }

      if (savedPostsDeferHandleRef.current !== null) {
        clearTimeout(savedPostsDeferHandleRef.current as ReturnType<typeof setTimeout>);
      }
      savedPostsDeferHandleRef.current = setTimeout(
        flushSavedPostsViewability,
        Platform.OS === "ios" ? 200 : 150,
      );
    },
  ).current;

  const handleSavedPostsMomentumScrollEnd = useCallback(() => {
    if (savedPostsDeferHandleRef.current !== null) {
      clearTimeout(savedPostsDeferHandleRef.current as ReturnType<typeof setTimeout>);
      savedPostsDeferHandleRef.current = null;
    }
    if (Platform.OS === "ios") {
      requestAnimationFrame(() => {
        requestAnimationFrame(flushSavedPostsViewability);
      });
    } else {
      setTimeout(() => {
        requestAnimationFrame(flushSavedPostsViewability);
      }, 50);
    }
  }, [flushSavedPostsViewability]);

  useEffect(() => {
    if (activeTab === 0) return;
    setVisibleVideoPostIds(new Set());
    setActiveVideoPostId(null);
  }, [activeTab]);

  useEffect(() => {
    if (postsWithOverrides.length !== 0) return;
    setVisibleVideoPostIds(new Set());
    setActiveVideoPostId(null);
  }, [postsWithOverrides.length]);

  useEffect(() => {
    return () => {
      if (savedPostsDeferHandleRef.current !== null) {
        clearTimeout(savedPostsDeferHandleRef.current as ReturnType<typeof setTimeout>);
      }
    };
  }, []);

  const { currentState } = useAppState({
    onBackground: () => {
      if (savedPostsDeferHandleRef.current !== null) {
        clearTimeout(savedPostsDeferHandleRef.current as ReturnType<typeof setTimeout>);
        savedPostsDeferHandleRef.current = null;
      }
      setVisibleVideoPostIds(new Set());
      setActiveVideoPostId(null);
    },
    onForeground: () => {
      if (activeTab !== 0) return;
      if (savedPostsDeferHandleRef.current !== null) {
        clearTimeout(savedPostsDeferHandleRef.current as ReturnType<typeof setTimeout>);
        savedPostsDeferHandleRef.current = null;
      }
      requestAnimationFrame(() => {
        flushSavedPostsViewability();
      });
    },
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
      const post = postsWithOverrides.find((p) => p.id === postId);
      if (post) {
        setSelectedPost(post);
        postOptionsSheetRef.current?.present();
      }
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
    [requireAuth, handleUpvote],
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
    [requireAuth, handleDownvote],
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
  }, [selectedPost, router]);

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

  const handleSavedCommentLongPress = useCallback(
    (comment: SavedComment) => {
      setSelectedComment(comment);
      commentOptionsSheetRef.current?.present();
    },
    [],
  );

  const renderPostItem = useCallback(
    ({ item }: { item: Post }) => (
      <PostCardItem
        post={item}
        isVisible={visibleVideoPostIds.has(item.id)}
        isFocused={activeVideoPostId === item.id}
        screenActive={isFocused && activeTab === 0 && currentState === "active"}
        videoSyncScope={SAVED_POSTS_FEED_CONTEXT}
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
      currentUser?.id,
      shareServer,
      allowAutoplay,
      visibleVideoPostIds,
      activeVideoPostId,
      activeTab,
      currentState,
      handlePostPress,
      handleAuthorPress,
      handleTopicPress,
      handleMorePress,
      handleLikePress,
      handleDislikePress,
      handleCommentPress,
      isFocused,
    ],
  );

  const setFeedScrolling = useCallback((isScrolling: boolean) => {
    useFeedScrollStore.getState().setContextScrolling(SAVED_POSTS_FEED_CONTEXT, isScrolling);
  }, []);

  useEffect(() => {
    return () => {
      setFeedScrolling(false);
    };
  }, [setFeedScrolling]);

  const renderCommentItem = useCallback(
    ({ item }: { item: SavedComment }) => (
      <Pressable
        onLongPress={() => handleSavedCommentLongPress(item)}
        delayLongPress={200}
      >
        <SavedCommentItem
          comment={item}
          onPress={handleSavedCommentPress}
        />
      </Pressable>
    ),
    [handleSavedCommentPress, handleSavedCommentLongPress],
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
    [handleSwipeTabChange, contentTranslateX, fadeOpacity],
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
          const progress = -event.translationX / SCREEN_WIDTH;
          const newIndex = activeTab + progress;
          const clampedIndex = Math.max(0, Math.min(TAB_COUNT - 1, newIndex));
          animatedTabIndex.value = clampedIndex;
          contentTranslateX.value = -(clampedIndex - activeTab) * SCREEN_WIDTH;
        })
        .onEnd((event) => {
          "worklet";
          const velocity = event.velocityX;
          let targetTab: number;
          if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
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
              direction * SCREEN_WIDTH,
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
    [activeTab, animatedTabIndex, contentTranslateX, fadeOpacity, completeTransition],
  );

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const gestureOpacity = interpolate(
      Math.abs(contentTranslateX.value),
      [0, SCREEN_WIDTH * 0.5, SCREEN_WIDTH],
      [1, 0.3, 0],
      "clamp",
    );
    return {
      transform: [{ translateX: contentTranslateX.value }],
      opacity: Math.min(gestureOpacity, fadeOpacity.value),
    };
  });

  const handleTabChange = useCallback((index: number) => {
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
  }, [activeTab, animatedTabIndex, fadeOpacity, completeTransition]);

  const renderEmptyState = useCallback(
    (type: "posts" | "comments") => (
      <View style={styles.emptyContainer}>
        <Image
          source={emptyInfoImage}
          style={styles.emptyImage}
          contentFit="contain"
        />
        <Text size="lg" weight="bold" style={styles.emptyTitle}>
          {type === "posts" ? "No saved posts yet" : "No saved comments yet"}
        </Text>
        <Text size="md" mode="subtle" style={styles.emptySubtitle}>
          {type === "posts"
            ? "Posts you save will appear here"
            : "Comments you save will appear here"}
        </Text>
      </View>
    ),
    [],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background.default }]}>
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

      <View style={[styles.headerDivider, { backgroundColor: theme.colors.border.subtle }]} />

      <SavedTabBar activeTab={activeTab} onTabChange={handleTabChange} animatedIndex={animatedTabIndex} />

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
                onScrollBeginDrag={() => setFeedScrolling(true)}
                onScrollEndDrag={() => setFeedScrolling(false)}
                onMomentumScrollBegin={() => setFeedScrolling(true)}
                onMomentumScrollEnd={() => {
                  setFeedScrolling(false);
                  handleSavedPostsMomentumScrollEnd();
                }}
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
        isSaved={selectedPost ? savedPosts.some((p) => p.id === selectedPost.id) : false}
        onSave={handleSavePost}
        onEdit={handleEditPost}
        onCopyText={handleCopyText}
        onDismiss={() => setSelectedPost(null)}
      />

      <CommentOptionsSheet
        ref={commentOptionsSheetRef}
        comment={selectedComment}
        rootPostId={selectedComment?.rootPostId}
        isOwnComment={currentUser?.id === selectedComment?.author.id}
        isSaved={selectedComment ? savedComments.some((c) => c.id === selectedComment.id) : false}
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
  tabBarContainer: {
    position: "relative",
  },
  tabBar: {
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 14,
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
  },
  tabBarBorder: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  emptyImage: {
    width: 200,
    height: 200,
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: {
    textAlign: "center",
    marginBottom: theme.spacing.xs,
  },
  emptySubtitle: {
    textAlign: "center",
  },
  commentContainer: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  commentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  commentDot: {
    marginHorizontal: theme.spacing.xs,
  },
  mediaContainer: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  mediaWrapper: {
    width: "100%",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  commentImage: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
  },
  imageError: {
    width: "100%",
    height: 100,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  skeletonOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.md,
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
  },
}));
