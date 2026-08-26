import { navigateToEditPost } from "@/src/utils/edit-post";
import { markSeen } from "@/src/services/seen-posts";
import { useFocusEffect, useIsFocused } from "expo-router/react-navigation";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View, type AppStateStatus } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useUserFollowed,
} from "@/src/api";

import {
  FeedHeader,
  NewPostsButton,
  type Post,
} from "@/src/components/molecules";
import { Box } from "@/src/components/ui/primitives";
import { buildFollowedTopicSet } from "@/src/domain/topics";
import { useSideMenu } from "@/src/providers/side-menu-provider";
import { storage ,
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
  useSavedPostsStore,
  useTimeTickStore,
} from "@/src/stores";

import {
  shouldAutoplayVideo,
  useAuthGuard,
  useLatestRef,
  useNetworkType,
} from "@/src/hooks";
import {
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { useToast } from "@/src/providers/toast-provider";
import { HomeTabbedFeed, type HomeTabbedFeedRef } from "./home-tabbed-feed";
import { FeedPostCardRuntimeProvider } from "./feed-post-card-runtime";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { PostActionOverlays } from "../post/post-action-overlays";
import { usePostActionController } from "../post/use-post-action-controller";
import { styles } from "./following-styles";

export function FollowingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const {
    headerAnimatedStyle,
  } = useScrollAnimationContext();
  const { requireAuth } = useAuthGuard();
  const toast = useToast();
  const { showBars } = useScrollAnimationContext();

  const currentUser = useAuthStore((s) => s.user);
  const shareServer = usePreferencesStore((s) => s.apiServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((s) => s.videoAutoplayNetwork);
  const networkType = useNetworkType();

  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<{ userId: string; username: string }[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);

  const handleNewPostsChange = useCallback((hasNew: boolean, avatars: { userId: string; username: string }[], count: number) => {
    setHasNewPosts(hasNew);
    setNewPostAvatars(avatars);
    setNewPostCount(count);
  }, []);

  const [isBannerLoading, setIsBannerLoading] = useState(false);

  const handleNewPostsPress = useCallback(async () => {
    setIsBannerLoading(true);
    try {
      await tabbedFeedRef.current?.handleNewPostsPress();
      setHasNewPosts(false);
    } finally {
      setIsBannerLoading(false);
    }
  }, []);

  const tabbedFeedRef = useRef<HomeTabbedFeedRef>(null);
  const backgroundTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        if (!backgroundTimeRef.current) {
          backgroundTimeRef.current = Date.now();
          storage.set("app_was_backgrounded", "true");
          storage.set("app_last_foreground_time", Date.now().toString());
        }
        return;
      }
      if (nextState === "active" && backgroundTimeRef.current) {
        backgroundTimeRef.current = null;
        storage.remove("app_was_backgrounded");
        useTimeTickStore.getState().bump();
        setTimeout(() => {
          tabbedFeedRef.current?.checkNewPosts();
        }, 500);
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [showBars]);

  const { openSideMenu } = useSideMenu();


  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const [feedTabIndex, setFeedTabIndex] = useState(0);

  const FEED_OPTIONS = useMemo(() => [
    { label: "Magic", value: "magic" },
    { label: "Latest", value: "latest" },
  ], []);

  const handleFeedTypeChange = useCallback((value: string) => {
    setFeedTabIndex(value === "magic" ? 0 : 1);
  }, []);

  const currentFeedSyncContext = feedTabIndex === 0 ? "following:magic" : "following:latest";

  const hidePost = useContentModerationStore((s) => s.hidePost);
  const unhidePost = useContentModerationStore((s) => s.unhidePost);
  const blockUser = useContentModerationStore((s) => s.blockUser);
  const blockTopicOptimistic = useContentModerationStore((s) => s.blockTopic);

  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData]
  );

  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData]
  );
  const [followUserOverrides, setFollowUserOverrides] = useState<Record<string, boolean>>({});
  const setFollowUserOverride = useCallback((userId: string, isFollowing: boolean) => {
    setFollowUserOverrides((current) => ({ ...current, [userId]: isFollowing }));
  }, []);
  const clearFollowUserOverride = useCallback((userId: string) => {
    setFollowUserOverrides((current) => {
      const { [userId]: _, ...rest } = current;
      return rest;
    });
  }, []);
  const displayFollowedUsers = useMemo(() => {
    const overrides = Object.entries(followUserOverrides);
    if (overrides.length === 0) return followedUsers;

    const next = new Set(followedUsers);
    overrides.forEach(([userId, isFollowing]) => {
      if (isFollowing) {
        next.add(userId);
      } else {
        next.delete(userId);
      }
    });
    return Array.from(next);
  }, [followedUsers, followUserOverrides]);

  const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);
  const sideMenuOpen = useHomePostCardStore((state) => state.sideMenuOpen);
  const savedPostIds = useMemo(
    () => new Set(savedPosts.map((post) => post.id)),
    [savedPosts],
  );
  const postActions = usePostActionController({
    currentUserId: currentUser?.id,
    followedUsers: displayFollowedUsers,
    followedTopics,
    savedPostIds,
    onFollowUserOptimistic: setFollowUserOverride,
    onFollowUserRollback: clearFollowUserOverride,
    onVoteOptimistic: useCallback((targetId, result) => {
      markSeen(targetId, "vote");
      setVoteOverride(targetId, {
        hasLiked: result.hasLiked,
        hasDisliked: result.hasDisliked,
        likes: result.newLikes,
      });
    }, [setVoteOverride]),
    onVoteRollback: useCallback((targetId) => {
      clearVoteOverride(targetId);
    }, [clearVoteOverride]),
    onBlockConfirmed: useCallback((pending) => {
      if (pending.type === "user") blockUser(pending.id);
      else if (pending.type === "post") hidePost(pending.id);
      else if (pending.type === "topic") {
        blockTopicOptimistic(pending.id);
        showBars();
      }
    }, [blockTopicOptimistic, blockUser, hidePost, showBars]),
    onDeleteConfirmed: hidePost,
    onDeleteRollback: unhidePost,
    onReportSubmitted: hidePost,
    onEditPost: useCallback((post) => navigateToEditPost(router, post), [router]),
    onToggleSave: useCallback(
      (post) => useSavedPostsStore.getState().toggleSavePost(post),
      [],
    ),
    onSaveChanged: useCallback((saved) => {
      toast.success(
        saved ? "Post saved" : "Post unsaved",
        saved ? "You can find it in your saved items." : "Removed from saved items.",
      );
    }, [toast]),
    onCopyText: useCallback(() => {
      toast.success("Copied", "Text copied to clipboard.");
    }, [toast]),
    onShowFewer: useCallback((post) => {
      console.log("Show fewer posts like:", post?.id);
      toast.success("Got it", "We'll show fewer posts like this.");
    }, [toast]),
  });
  const {
    openOptions: openPostOptions,
    followUser: handleFollowPress,
    followTopic: handleFollowTopicFromCard,
    upvote: handleUpvote,
    downvote: handleDownvote,
    blockUser: handleBlockUserFromCard,
    blockPost: handleBlockPostFromCard,
    blockTopic: handleBlockTopicFromCard,
    report: handleReportFromCard,
  } = postActions.cardActions;

  const revealedPostsRef = useRef<Set<string>>(new Set());

  const handlePostPress = useCallback(
    (postId: string) => {
      markSeen(postId, "open");
      const isRevealed = revealedPostsRef.current.has(postId);
      const params = new URLSearchParams({ syncContext: currentFeedSyncContext });
      if (isRevealed) {
        params.set("reveal", "true");
      }
      router.push(`/post/${postId}?${params.toString()}`);
    },
    [currentFeedSyncContext, router]
  );

  const handleAuthorPress = useCallback((authorId: string) => {
    router.push(`/user/${authorId}`);
  }, [router]);

  const handleTopicPress = useCallback((topic: string) => {
    router.push(`/topic/${encodeURIComponent(topic)}`);
  }, [router]);

  const handleMorePress = useCallback((post: Post) => {
    requireAuth(() => {
      openPostOptions(post);
    });
  }, [openPostOptions, requireAuth]);

  const handleCommentPress = useCallback(
    (postId: string) => {
      markSeen(postId, "open");
      router.push(`/post/${postId}?syncContext=${encodeURIComponent(currentFeedSyncContext)}`);
    },
    [currentFeedSyncContext, router]
  );

  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((prev) => {
      const newSet = new Set(prev);
      newSet.add(postId);
      revealedPostsRef.current = newSet;
      return newSet;
    });
  }, []);

  const followedUsersSet = useMemo(() => new Set(followedUsers), [followedUsers]);
  const followedTopicsSet = useMemo(
    () => buildFollowedTopicSet(followedTopics),
    [followedTopics],
  );
  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, networkType, videoAutoplayNetwork],
  );

  useFocusEffect(
    useCallback(() => {
      useTimeTickStore.getState().bump();
    }, []),
  );

  const handlersRef = useLatestRef({
    handlePostPress,
    handleAuthorPress,
    handleTopicPress,
    handleMorePress,
    handleUpvote,
    handleDownvote,
    handleCommentPress,
    handleFollowPress,
    handleFollowTopicFromCard,
    handleRevealContent,
    handleBlockUserFromCard,
    handleBlockPostFromCard,
    handleBlockTopicFromCard,
    handleReportFromCard,
  });

  const feedRuntimeConfig = useMemo(() => ({
    currentUserId: currentUser?.id,
    followedUsers: followedUsersSet,
    followedTopics: followedTopicsSet,
    followUserOverrides,
    revealedPosts,
    shareServer,
    allowAutoplay,
    active: isFocused && !sideMenuOpen,
    handlers: {
      onPostPress: handlersRef.current.handlePostPress,
      onAuthorPress: handlersRef.current.handleAuthorPress,
      onTopicPress: handlersRef.current.handleTopicPress,
      onMorePress: handlersRef.current.handleMorePress,
      onLikePress: handlersRef.current.handleUpvote,
      onDislikePress: handlersRef.current.handleDownvote,
      onCommentPress: handlersRef.current.handleCommentPress,
      onFollowUser: handlersRef.current.handleFollowPress,
      onFollowTopic: handlersRef.current.handleFollowTopicFromCard,
      onRevealContent: handlersRef.current.handleRevealContent,
      onBlockUser: handlersRef.current.handleBlockUserFromCard,
      onBlockPost: handlersRef.current.handleBlockPostFromCard,
      onBlockTopic: handlersRef.current.handleBlockTopicFromCard,
      onReport: handlersRef.current.handleReportFromCard,
    },
  }), [
    allowAutoplay,
    currentUser?.id,
    followedTopicsSet,
    followedUsersSet,
    followUserOverrides,
    handlersRef,
    isFocused,
    revealedPosts,
    shareServer,
    sideMenuOpen,
  ]);

  return (
    <FeedPostCardRuntimeProvider config={feedRuntimeConfig}>
    <Box flex background="base">
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      <FeedHeader
        title="Following"
        onMenuPress={openSideMenu}

        onSearchPress={() => router.push("/search")}
        animatedStyle={headerAnimatedStyle}
        feedType={feedTabIndex === 0 ? "magic" : "latest"}
        feedOptions={FEED_OPTIONS}
        onFeedTypeChange={handleFeedTypeChange}
      />

      <HomeTabbedFeed
        ref={tabbedFeedRef}
        key={shareServer}
        feedType="following"
        activeTabIndex={feedTabIndex}
        onNewPostsChange={handleNewPostsChange}
      />

      <NewPostsButton
        visible={hasNewPosts && isFocused}
        onPress={handleNewPostsPress}
        topOffset={insets.top + 44}
        avatars={newPostAvatars}
        newPostCount={newPostCount}
        loading={isBannerLoading}
      />

      <PostActionOverlays controller={postActions} />
    </Box>
    </FeedPostCardRuntimeProvider>
  );
}
