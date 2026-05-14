/**
 * MediaPostDetailScreen
 *
 * Immersive post-detail layout for posts that contain image, video, or gif
 * media.
 *
 * Layout:
 *   - Header (absolute top, below safe-area inset): ✕ / topic / ⋯
 *   - Media (absolute, starts just below header): full screen width, height
 *     interpolates from "remaining screen" (expanded) to 30% screen height
 *     (collapsed). resizeMode "contain".
 *   - Footer (absolute bottom, expanded only): avatar+username, title,
 *     body, video controls (draggable seek + time), action row
 *     (vote / comment | block-options / share). Fades out on collapse.
 *   - Comment sheet (the scrollable list underneath): once collapsed,
 *     shows handle bar, divider, avatar+username, title, body, then
 *     "Comments (N)" header, then comments.
 *   - Sticky CommentInput (absolute bottom): visible only when collapsed.
 *
 * Gesture model:
 *   - Single `scrollY` shared value drives all collapse interpolation.
 *   - The comments list's onScroll updates scrollY.
 *   - A Pan gesture on the media also updates scrollY (so dragging the
 *     media collapses/expands directly).
 *   - On release, snaps to fully expanded or fully collapsed based on
 *     position + velocity.
 *   - Tapping the media when collapsed expands it back; tapping when
 *     expanded toggles video play/pause.
 */

import {
  transformApiComment,
  transformApiComments,
  transformApiPost,
  useComments,
  useUserFollowed,
} from "@/src/api/read";
import { Avatar, TimeAgo } from "@/src/components/atoms";
import { composeCommentContent, resolveCommentMediaUrl } from "@/src/utils/comment-media";
import {
  AwardPickerSheet,
  AwardPickerSheetRef,
  CommentInput,
  CommentInputRef,
  CommentOptionsSheet,
  CommentOptionsSheetRef,
  CommentThread,
  ConfirmationPopup,
  GiftMirageSheet,
  GiftMirageSheetRef,
  GiftSubscriptionSheet,
  GiftSubscriptionSheetRef,
  MediaPostDetailSkeleton,
  PostActions,
  PostOptionsSheet,
  PostOptionsSheetRef,
  ReportSheet,
  ReportSheetRef,
  type Comment,
  type Post,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import {
  getBlockConfirmationMessage,
  useAuthGuard,
  useBlockHandler,
  useDeleteHandler,
  useFollowHandler,
  useReportHandler,
  useVoteHandler,
} from "@/src/hooks";
import { useRouter } from "@/src/hooks/use-router";
import { useToast } from "@/src/providers/toast-provider";
import {
  buildVideoPositionKey,
  getShareBaseUrl,
  useAuthStore,
  usePreferencesStore,
  useSavedPostsStore,
  useVideoPositionStore,
  useVideoMuteStore,
  useContentModerationStore,
} from "@/src/stores";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { Audio, AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { getUsernameColor } from "@/src/utils/tiers";
import { useHomePostCardStore } from "@/src/pages/home/home-post-card-store";
import { resolvePostContent } from "@/src/components/molecules/post-card-utils";
import { useCommentComposeStore } from "@/src/stores/comment-compose-store";
import { useComment } from "@/src/api/write/hooks/use-post";
import {
  useOptimisticReplyComments,
  useOptimisticTopLevelComments,
  usePostCommentOptimisticStore,
} from "@/src/stores/post-comment-optimistic-store";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";
import { LinearGradient } from "expo-linear-gradient";
import * as Sentry from "@sentry/react-native";
import { useQuery } from "@tanstack/react-query";
import { getCommentContext } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
import type { PostWithChildren } from "@/src/api/types";
import {
  generateActionId,
  getActionLabel,
  usePowQueueStore,
} from "@/src/services/pow-queue";

/**
 * Truncate a body string to a short single-line preview suitable for
 * the expanded-mode footer. Keeps markdown link syntax intact (so
 * MarkdownContent renders `[name](url)` as a clickable "name" link)
 * but only keeps the first line/clause.
 */
function truncateForInline(body: string, maxChars = 100): string {
  const firstLine = body.split(/\r?\n/)[0] ?? body;
  if (firstLine.length <= maxChars) return firstLine;
  return firstLine.slice(0, maxChars) + "…";
}

/**
 * Strip markdown link / image syntax to plain text suitable for inline
 * display in the expanded-mode footer (where numberOfLines={1} clips
 * descenders cleanly).
 *   `[name](url)` -> `name`
 *   `![alt](url)` -> `alt`
 * Anything else is left as-is.
 */
function renderInlineBody(body: string): string {
  const firstLine = truncateForInline(body);
  return firstLine
    .replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1");
}
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  Share,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import PagerView from "react-native-pager-view";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetView,
  useBottomSheetSpringConfigs,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const COLLAPSED_FRACTION = 0.3;
const HEADER_HEIGHT_BASE = 48;
const FOOTER_EXPANDED_HEIGHT = 240; // approx footer overlay height
// CommentInput intrinsic height (approx; matches legacy post-detail
// screen). The actual input is measured by its own component; this is
// only used for math that reserves space for the dock area.
const INPUT_DOCK_HEIGHT = 52;

type MediaItem = {
  uri: string;
  type: "image" | "video" | "gif";
  posterUri?: string;
  aspectRatio?: number;
};

// ---------------------------------------------------------------------------
// Follow popup button — matches PostCardHeader's popup behaviour.
// Shows a "Follow"/"Following" pill; tapping opens a menu with options
// to follow the user and (when a topic is present) follow the topic.
// ---------------------------------------------------------------------------

type FollowMenuButtonProps = {
  username: string;
  topic?: string;
  isFollowing: boolean;
  isTopicFollowed: boolean;
  onFollowUser: () => void;
  onFollowTopic: () => void;
};

const FollowMenuButton = memo(function FollowMenuButton({
  username,
  topic,
  isFollowing,
  isTopicFollowed,
  onFollowUser,
  onFollowTopic,
}: FollowMenuButtonProps) {
  const { theme } = useUnistyles();
  // Match PostCardHeader behaviour:
  //   - "all":     following both user (and topic if present)
  //   - "partial": following one of them but not the other (only when topic exists)
  //   - "none":    following neither
  const isFollowingAll = topic
    ? !!(isFollowing && isTopicFollowed)
    : !!isFollowing;
  const isFollowingPartial = topic
    ? !!(isFollowing || isTopicFollowed) && !isFollowingAll
    : false;
  return (
    <Menu>
      <MenuTrigger
        customStyles={{
          triggerOuterWrapper: { padding: 4 },
          triggerTouchable: {
            hitSlop: { top: 12, bottom: 12, left: 12, right: 12 },
          },
        }}
      >
        {isFollowingPartial ? (
          <LinearGradient
            colors={["#FFFFFF", "#C1C1C1"]}
            locations={[0.5, 0.5]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.followBtn,
              { borderColor: theme.colors.border.default },
            ]}
          >
            <Text
              size="sm"
              weight="bold"
              style={{ color: "#000000" }}
            >
              Follow
            </Text>
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.followBtn,
              {
                backgroundColor: isFollowingAll
                  ? "transparent"
                  : theme.colors.primary[500],
                borderColor: isFollowingAll
                  ? theme.colors.border.default
                  : theme.colors.primary[500],
              },
            ]}
          >
            <Text
              size="sm"
              weight="bold"
              style={{
                color: isFollowingAll
                  ? theme.colors.text.default
                  : theme.colors.background.default,
              }}
            >
              {isFollowingAll ? "Unfollow" : "Follow"}
            </Text>
          </View>
        )}
      </MenuTrigger>
      <MenuOptions
        customStyles={{
          optionsContainer: {
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.radius.lg,
            minWidth: 200,
            shadowColor: theme.colors.contrast.base,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
            borderWidth: 1,
            borderColor: theme.colors.border.subtle,
            marginTop: 4,
            paddingVertical: 8,
          },
        }}
      >
        {topic ? (
          <MenuOption onSelect={onFollowTopic}>
            <View style={styles.followMenuOption}>
              <Ionicons
                name={isTopicFollowed ? "pricetag" : "pricetag-outline"}
                size={14}
                color={
                  isTopicFollowed
                    ? theme.colors.primary[500]
                    : theme.colors.text.subtle
                }
              />
              <Text
                size="lg"
                weight={isTopicFollowed ? "semibold" : "medium"}
                numberOfLines={1}
                style={
                  isTopicFollowed
                    ? { color: theme.colors.primary[500] }
                    : undefined
                }
              >
                {isTopicFollowed ? "Unfollow" : "Follow"} #{topic}
              </Text>
            </View>
          </MenuOption>
        ) : null}
        <MenuOption onSelect={onFollowUser}>
          <View style={styles.followMenuOption}>
            <Ionicons
              name={isFollowing ? "person" : "person-outline"}
              size={14}
              color={
                isFollowing
                  ? theme.colors.primary[500]
                  : theme.colors.text.subtle
              }
            />
            <Text
              size="lg"
              weight={isFollowing ? "semibold" : "medium"}
              numberOfLines={1}
              style={
                isFollowing
                  ? { color: theme.colors.primary[500] }
                  : undefined
              }
            >
              {isFollowing ? "Unfollow" : "Follow"} @{username}
            </Text>
          </View>
        </MenuOption>
      </MenuOptions>
    </Menu>
  );
});

// ---------------------------------------------------------------------------
// Draggable seek bar
// ---------------------------------------------------------------------------

type SeekBarProps = {
  positionMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  width: number;
  tint?: string;
};

const SeekBar = memo(function SeekBar({
  positionMs,
  durationMs,
  onSeek,
  width,
  tint = "#fff",
}: SeekBarProps) {
  const dragX = useSharedValue<number | null>(null);
  const trackWidth = Math.max(1, width);
  const { theme } = useUnistyles();

  const baseProgress = durationMs > 0 ? positionMs / durationMs : 0;
  const baseProgressShared = useSharedValue(baseProgress);
  useEffect(() => {
    baseProgressShared.value = baseProgress;
  }, [baseProgress, baseProgressShared]);

  const pan = Gesture.Pan()
    .onBegin((e) => {
      dragX.value = Math.max(0, Math.min(trackWidth, e.x));
    })
    .onUpdate((e) => {
      dragX.value = Math.max(0, Math.min(trackWidth, e.x));
    })
    .onEnd(() => {
      if (dragX.value === null) return;
      const frac = dragX.value / trackWidth;
      const ms = frac * (durationMs > 0 ? durationMs : 0);
      runOnJS(onSeek)(ms);
      dragX.value = null;
    })
    .minDistance(0);

  const fillStyle = useAnimatedStyle(() => {
    const frac =
      dragX.value !== null ? dragX.value / trackWidth : baseProgressShared.value;
    return { width: trackWidth * Math.max(0, Math.min(1, frac)) };
  });

  const knobStyle = useAnimatedStyle(() => {
    const frac =
      dragX.value !== null ? dragX.value / trackWidth : baseProgressShared.value;
    return {
      transform: [
        { translateX: trackWidth * Math.max(0, Math.min(1, frac)) - 7 },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.seekTrack, { width: trackWidth }]}
        hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
      >
        <View
          style={[
            styles.seekTrackBg,
            { backgroundColor: theme.colors.border.subtle },
          ]}
        />
        <Animated.View
          style={[styles.seekTrackFill, { backgroundColor: tint }, fillStyle]}
        />
        <Animated.View
          style={[styles.seekKnob, { backgroundColor: tint }, knobStyle]}
        />
      </View>
    </GestureDetector>
  );
});

/**
 * Flexible-width seek bar — measures its parent via onLayout, so it
 * adapts to whatever flex space is available. Used inside the footer
 * controls row to avoid overflowing the screen on the right.
 */
const SeekBarFlex = memo(function SeekBarFlex({
  positionMs,
  durationMs,
  onSeek,
  tint,
}: Omit<SeekBarProps, "width">) {
  const [w, setW] = useState(0);
  return (
    <View
      style={{ width: "100%" }}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
    >
      {w > 0 ? (
        <SeekBar
          positionMs={positionMs}
          durationMs={durationMs}
          onSeek={onSeek}
          width={w}
          tint={tint}
        />
      ) : (
        <View style={[styles.seekTrack, { width: "100%" as any }]}>
          <View style={styles.seekTrackBg} />
        </View>
      )}
    </View>
  );
});

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Single video / image renderer
// ---------------------------------------------------------------------------

type VideoApi = {
  toggle: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  getPosition: () => number;
  getDuration: () => number;
  setMuted: (m: boolean) => Promise<void>;
  isPlaying: () => boolean;
};

type ItemRenderProps = {
  item: MediaItem;
  isActive: boolean;
  screenActive: boolean;
  collapseProgress: SharedValue<number>;
  onTapWhenCollapsed: () => void;
  registerVideo: (key: string, api: VideoApi | null) => void;
  videoKey: string;
  videoSyncScope?: string;
};

const MediaItemView = memo(function MediaItemView({
  item,
  isActive,
  screenActive,
  collapseProgress,
  onTapWhenCollapsed,
  registerVideo,
  videoKey,
  videoSyncScope,
}: ItemRenderProps) {
  const videoRef = useRef<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const getPosition = useVideoPositionStore((s) => s.getPosition);
  const setPosition = useVideoPositionStore((s) => s.setPosition);
  const currentVideoPositionRef = useRef(0);
  const hasRestoredVideoPositionRef = useRef(false);

  const isVideo = item.type === "video";
  const videoPositionKey = isVideo
    ? buildVideoPositionKey(item.uri, videoSyncScope)
    : "";

  const saveVideoPosition = useCallback(() => {
    if (!videoPositionKey) return;
    const seconds = currentVideoPositionRef.current / 1000;
    if (seconds > 0.5) setPosition(videoPositionKey, seconds);
  }, [videoPositionKey, setPosition]);

  useEffect(() => {
    return () => {
      saveVideoPosition();
    };
  }, [saveVideoPosition]);

  const togglePlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const s = await v.getStatusAsync();
    if (!s.isLoaded) return;
    if (s.isPlaying) {
      await v.pauseAsync();
      setIsPlaying(false);
    } else {
      if (s.didJustFinish) await v.replayAsync();
      else await v.playAsync();
      setIsPlaying(true);
    }
  }, []);

  useEffect(() => {
    if (!isVideo) return;
    const api: VideoApi = {
      toggle: togglePlay,
      seek: async (ms) => {
        await videoRef.current?.setStatusAsync({ positionMillis: ms });
        currentVideoPositionRef.current = ms;
        setPositionMs(ms);
        saveVideoPosition();
      },
      getPosition: () => positionMs,
      getDuration: () => durationMs,
      setMuted: async (m) => {
        await videoRef.current?.setStatusAsync({ isMuted: m });
      },
      isPlaying: () => isPlaying,
    };
    registerVideo(videoKey, api);
    return () => registerVideo(videoKey, null);
  }, [
    isVideo,
    registerVideo,
    videoKey,
    positionMs,
    durationMs,
    isPlaying,
    togglePlay,
    saveVideoPosition,
  ]);

  const handleStatus = useCallback(
    (s: AVPlaybackStatus) => {
      if (!s.isLoaded) return;
      currentVideoPositionRef.current = s.positionMillis ?? 0;
      setPositionMs(s.positionMillis ?? 0);
      if (s.isPlaying && videoPositionKey) {
        const seconds = (s.positionMillis ?? 0) / 1000;
        if (seconds > 0.5) setPosition(videoPositionKey, seconds);
      }
      if (s.durationMillis && s.durationMillis !== durationMs) {
        setDurationMs(s.durationMillis);
      }
      if (typeof s.isPlaying === "boolean" && s.isPlaying !== isPlaying) {
        setIsPlaying(s.isPlaying);
      }
    },
    [durationMs, isPlaying, videoPositionKey, setPosition],
  );

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      "worklet";
      if (collapseProgress.value > 0.05) {
        runOnJS(onTapWhenCollapsed)();
      } else if (isVideo) {
        runOnJS(togglePlay)();
      }
    });

  return (
    <GestureDetector gesture={tap}>
      <View style={styles.mediaItem}>
        {isVideo ? (
          <Video
            ref={videoRef}
            source={{ uri: item.uri }}
            style={styles.mediaInner}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={isActive && screenActive}
            isLooping
            isMuted={globalMuted || !isActive}
            useNativeControls={false}
            progressUpdateIntervalMillis={200}
            onLoad={async () => {
              if (!videoPositionKey || hasRestoredVideoPositionRef.current) return;
              const saved = getPosition(videoPositionKey);
              if (saved > 0.5) {
                hasRestoredVideoPositionRef.current = true;
                currentVideoPositionRef.current = saved * 1000;
                setPositionMs(saved * 1000);
                await videoRef.current?.setStatusAsync({
                  positionMillis: saved * 1000,
                }).catch(() => {});
              }
            }}
            onPlaybackStatusUpdate={handleStatus}
          />
        ) : (
          <Image
            source={{ uri: item.uri }}
            style={styles.mediaInner}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        )}
      </View>
    </GestureDetector>
  );
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

type MediaPostDetailScreenProps = {
  rootPostId?: string;
  highlightCommentId?: string;
  initialSheetOpen?: boolean;
};

export default function MediaPostDetailScreen({
  rootPostId,
  highlightCommentId,
  initialSheetOpen = false,
}: MediaPostDetailScreenProps = {}) {
  const params = useLocalSearchParams<{
    id: string;
    highlight?: string;
    depth?: string;
    syncContext?: string;
  }>();
  const id = rootPostId ?? params.id;
  const initialHighlightCommentId = highlightCommentId ?? params.highlight;
  const shouldOpenSheetInitially = initialSheetOpen || !!initialHighlightCommentId || !!params.depth;
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(
    initialHighlightCommentId ?? null,
  );
  const [focusedMode, setFocusedMode] = useState<"single" | "context" | "full">(
    initialHighlightCommentId ? (params.depth ? "context" : "single") : "full",
  );
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const isFocused = useIsFocused();
  const toast = useToast();
  const { isLoggedIn, requireAuth } = useAuthGuard();
  const videoSyncScope = params.syncContext ?? (id ? `post:${id}` : undefined);

  const currentUser = useAuthStore((s) => s.user);
  const shareServer = usePreferencesStore((s) => s.apiServer);
  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const savedComments = useSavedPostsStore((s) => s.savedComments);
  const globalMuted = useVideoMuteStore((s) => s.isMuted);
  const toggleGlobalMute = useVideoMuteStore((s) => s.toggleMute);
  const globalHidePost = useContentModerationStore((s) => s.hidePost);
  const globalBlockUser = useContentModerationStore((s) => s.blockUser);
  const globalBlockTopic = useContentModerationStore((s) => s.blockTopic);
  const globalHideComment = useContentModerationStore((s) => s.hideComment);
  const enqueue = usePowQueueStore((s) => s.enqueue);

  // --- data ---------------------------------------------------------------
  const {
    data: commentsData,
    isLoading: isLoadingComments,
    refetch: refetchComments,
    isError: isCommentsError,
    error: commentsError,
  } = useComments(id!, { enabled: isFocused });
  const focusedDepth = focusedMode === "context" ? 5 : 0;
  const {
    data: focusedCommentData,
    isFetched: isFocusedCommentFetched,
    isError: isFocusedCommentError,
    error: focusedCommentError,
  } = useComments(focusedCommentId, {
    enabled: isFocused && !!focusedCommentId && focusedMode !== "full",
  });
  const {
    data: focusedContextData,
    refetch: refetchFocusedContext,
    isError: isFocusedContextError,
    error: focusedContextError,
  } = useQuery({
    queryKey: queryKeys.commentContext(focusedCommentId!, focusedDepth),
    queryFn: () =>
      getCommentContext({
        comment_id: focusedCommentId!,
        address: currentUser?.walletAddress ?? undefined,
        max_depth: focusedDepth,
      }),
    enabled: isFocused && !!focusedCommentId && focusedDepth > 0,
    staleTime: 0,
  });
  const {
    data: focusedContextCheckData,
    isFetched: isFocusedContextCheckFetched,
    isError: isFocusedContextCheckError,
    error: focusedContextCheckError,
  } = useQuery({
    queryKey: queryKeys.commentContext(focusedCommentId!, 5),
    queryFn: () =>
      getCommentContext({
        comment_id: focusedCommentId!,
        address: currentUser?.walletAddress ?? undefined,
        max_depth: 5,
      }),
    enabled: isFocused && !!focusedCommentId && focusedMode !== "full",
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    if (isCommentsError) {
      Sentry.captureException(commentsError, {
        tags: { feature: "media-post-detail", operation: "load-comments" },
        extra: { postId: id, focusedCommentId, focusedMode },
      });
    }
    if (isFocusedCommentError) {
      Sentry.captureException(focusedCommentError, {
        tags: { feature: "media-post-detail", operation: "load-focused-comment" },
        extra: { postId: id, focusedCommentId, focusedMode },
      });
    }
    if (isFocusedContextError) {
      Sentry.captureException(focusedContextError, {
        tags: { feature: "media-post-detail", operation: "load-focused-context" },
        extra: { postId: id, focusedCommentId, focusedMode, focusedDepth },
      });
    }
    if (isFocusedContextCheckError) {
      Sentry.captureException(focusedContextCheckError, {
        tags: { feature: "media-post-detail", operation: "load-focused-context-check" },
        extra: { postId: id, focusedCommentId, focusedMode },
      });
    }
  }, [
    isCommentsError,
    commentsError,
    isFocusedCommentError,
    focusedCommentError,
    isFocusedContextError,
    focusedContextError,
    isFocusedContextCheckError,
    focusedContextCheckError,
    id,
    focusedCommentId,
    focusedMode,
    focusedDepth,
  ]);
  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData],
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData],
  );

  const basePost: Post | null = useMemo(() => {
    if (!commentsData?.root) return null;
    return transformApiPost(commentsData.root, {
      followedUsers,
      currentUser: currentUser
        ? { id: currentUser.id, username: currentUser.username }
        : undefined,
    });
  }, [commentsData, followedUsers, currentUser]);

  // Optimistic vote overrides from shared home store (same source the
  // legacy detail screen and feed use, so optimistic state is shared
  // across screens).
  const sharedVoteOverride = useHomePostCardStore((state) =>
    id ? state.voteOverrides[id] : undefined,
  );
  const post: Post | null = useMemo(() => {
    if (!basePost) return null;
    if (!sharedVoteOverride) return basePost;
    return {
      ...basePost,
      likes: sharedVoteOverride.likes ?? basePost.likes ?? 0,
      hasLiked: sharedVoteOverride.hasLiked ?? basePost.hasLiked,
      hasDisliked: sharedVoteOverride.hasDisliked ?? basePost.hasDisliked,
    };
  }, [basePost, sharedVoteOverride]);

  const comments = useMemo<Comment[]>(() => {
    if (!commentsData?.children) return [];
    return transformApiComments(commentsData.children);
  }, [commentsData]);
  const optimisticTopLevelComments = useOptimisticTopLevelComments(id);
  const optimisticReplyComments = useOptimisticReplyComments(id);
  const addTopLevelOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.addTopLevelComment,
  );
  const addReplyOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.addReplyComment,
  );
  const replaceOptimisticCommentId = usePostCommentOptimisticStore(
    (state) => state.replaceCommentId,
  );
  const removeOptimisticComment = usePostCommentOptimisticStore(
    (state) => state.removeComment,
  );
  const pruneCommentsPresentOnServer = usePostCommentOptimisticStore(
    (state) => state.pruneCommentsPresentOnServer,
  );
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(
    new Set(),
  );
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  const mediaItems = useMemo<MediaItem[]>(() => {
    if (!post) return [];
    const resolved = resolvePostContent(post.body, post.media);
    const shouldPreferResolvedMedia =
      (resolved.bodyVideoUrl && resolved.resolvedMedia?.type === "video");
    const list =
      shouldPreferResolvedMedia && resolved.resolvedMedia
        ? [resolved.resolvedMedia]
        : post.media && post.media.length > 0
        ? post.media
        : resolved.resolvedMedia
        ? [resolved.resolvedMedia]
        : [];
    return list
      .filter(
        (m) =>
          m.type === "image" ||
          m.type === "video" ||
          m.type === "gif",
      )
      .map((m) => ({
        uri: m.uri,
        type: m.type as MediaItem["type"],
        posterUri: m.posterUri,
        aspectRatio: m.aspectRatio,
      }));
  }, [post]);

  // --- layout dimensions --------------------------------------------------
  // Layout model:
  //   - When EXPANDED: media fills the entire safe area (insets.top →
  //     SCREEN_H - insets.bottom), so the image is centered between the
  //     top and bottom safe-area insets. Header overlays the media's top.
  //   - When COLLAPSED: media is anchored at insets.top with 30% of
  //     screen height. Below media is a fixed handle bar, then the
  //     comments scroll area, then the comment input dock at the bottom.
  const headerH = insets.top + HEADER_HEIGHT_BASE;
  // Input dock height is measured on layout (CommentInput intrinsic +
  // its internal safe-area padding). Until we get a real measurement,
  // use INPUT_DOCK_HEIGHT + insets.bottom as the conservative default.
  const [measuredInputDockH, setMeasuredInputDockH] = useState(
    INPUT_DOCK_HEIGHT + insets.bottom,
  );
  const inputDockTotalH = measuredInputDockH;
  // Footer overlay (avatar/title/body/controls/actions) is measured on
  // layout so the expanded media height can stop exactly above it. With
  // the footer bg matching the app bg, this guarantees the image is
  // visually centered between the header and the footer top.
  const [measuredFooterH, setMeasuredFooterH] = useState(0);
  // EXPANDED: media occupies space between header and footer top.
  // COLLAPSED: media is anchored at insets.top with 30% screen height.
  const expandedMediaTop = headerH;
  const collapsedMediaTop = insets.top;
  const collapsedMediaH = Math.round(SCREEN_H * COLLAPSED_FRACTION);
  const expandedMediaH = Math.max(
    collapsedMediaH,
    SCREEN_H - headerH - Math.max(measuredFooterH, insets.bottom),
  );
  const collapseRange = expandedMediaH - collapsedMediaH;
  // Y coordinate (in screen-space) of the top of the comments area
  // when collapsed. The FlatList lives between this line and the input
  // dock.
  const listTopY = collapsedMediaTop + collapsedMediaH;
  const listViewportH = SCREEN_H - listTopY - inputDockTotalH;

  // --- bottom-sheet driven collapse ---------------------------------------
  // One snap point (the comments sheet's open height). The sheet is
  // closed (index=-1) by default, exposing the full media + footer
  // overlay. Dragging up on the media OR tapping "more" opens the
  // sheet to its single snap point, collapsing the media to 30% and
  // revealing comments + sticky input dock.
  const expandedSheetH = Math.max(100, SCREEN_H - listTopY);
  const snapPoints = useMemo(() => [expandedSheetH], [expandedSheetH]);
  const sheetAnimationConfigs = useBottomSheetSpringConfigs({
    damping: 42,
    stiffness: 620,
    mass: 0.75,
    overshootClamping: true,
  });
  const sheetRef = useRef<BottomSheet>(null);
  const commentsListRef = useRef<any>(null);
  // animatedIndex is -1 when closed, 0 when at first snap point.
  // We clamp/normalize to [0,1] for collapseProgress.
  const animatedIndex = useSharedValue(-1);
  const collapseProgress = useDerivedValue(() => {
    const v = animatedIndex.value + 1; // -1..0  →  0..1
    return v < 0 ? 0 : v > 1 ? 1 : v;
  });

  // Media gestures:
  //   - drag up  → open sheet (collapse media)
  //   - drag down (when sheet closed) past threshold → dismiss screen
  const dragDownY = useSharedValue(0);
  const openSheet = useCallback(() => {
    sheetRef.current?.snapToIndex(0);
  }, []);
  const closeSheet = useCallback(() => {
    sheetRef.current?.close();
  }, []);

  const mediaPan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        dragDownY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY < -40 || e.velocityY < -600) {
        runOnJS(openSheet)();
        dragDownY.value = 0;
        return;
      }
      if (e.translationY > 120 || e.velocityY > 800) {
        runOnJS(router.back)();
        return;
      }
      dragDownY.value = 0;
    });

  const expandMedia = closeSheet;
  const collapseMedia = openSheet;

  // --- animated styles ----------------------------------------------------
  // Keep collapse/expand fast by driving the media from the bottom
  // sheet's UI-thread spring. Avoid JS state updates during the spring;
  // only opacity/position style worklets derive from `animatedIndex`.
  const mediaContainerStyle = useAnimatedStyle(() => {
    const p = collapseProgress.value;
    const h = expandedMediaH + (collapsedMediaH - expandedMediaH) * p;
    const t = expandedMediaTop + (collapsedMediaTop - expandedMediaTop) * p;
    return {
      height: h,
      top: t,
      transform: [{ translateY: dragDownY.value }],
    };
  });

  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress.value,
      [0, 0.4],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const footerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress.value,
      [0, 0.3],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Footer must stop receiving input once collapse begins
  const [footerInteractive, setFooterInteractive] = useState(true);
  useAnimatedReaction(
    () => collapseProgress.value,
    (v, prev) => {
      const next = v < 0.1;
      if (next !== (prev === null || prev < 0.1)) {
        runOnJS(setFooterInteractive)(next);
      }
    },
  );

  const compactOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress.value,
      [0.6, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const inputDockStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      collapseProgress.value,
      [0.5, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // --- gallery state ------------------------------------------------------
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMedia = mediaItems[activeIndex];
  const isVideoActive = activeMedia?.type === "video";

  // --- video controller registry ------------------------------------------
  const videoApisRef = useRef<Map<string, VideoApi>>(new Map());
  const registerVideo = useCallback((key: string, api: VideoApi | null) => {
    if (api) videoApisRef.current.set(key, api);
    else videoApisRef.current.delete(key);
  }, []);
  const activeVideoApi = () => {
    if (!isVideoActive) return null;
    return videoApisRef.current.get(`m-${activeIndex}`) ?? null;
  };

  const [activeStatus, setActiveStatus] = useState({
    position: 0,
    duration: 0,
    playing: true,
  });
  useEffect(() => {
    if (!isVideoActive) return;
    const t = setInterval(() => {
      const api = activeVideoApi();
      if (!api) return;
      const pos = api.getPosition();
      const dur = api.getDuration();
      const playing = api.isPlaying();
      setActiveStatus((prev) =>
        prev.position === pos &&
        prev.duration === dur &&
        prev.playing === playing
          ? prev
          : { position: pos, duration: dur, playing },
      );
    }, 250);
    return () => clearInterval(t);
  }, [activeMedia?.uri, activeIndex, isVideoActive]);

  // --- sheets -------------------------------------------------------------
  const postOptionsRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const commentOptionsRef = useRef<CommentOptionsSheetRef>(null);
  const awardPickerRef = useRef<AwardPickerSheetRef>(null);
  const giftMirageRef = useRef<GiftMirageSheetRef>(null);
  const giftSubRef = useRef<GiftSubscriptionSheetRef>(null);
  const commentInputRef = useRef<CommentInputRef>(null);

  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(
    initialHighlightCommentId ?? null,
  );
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressCommentOptionsUntilRef = useRef(0);
  const [awardTargetId, setAwardTargetId] = useState<string>("");
  const [awardTargetType, setAwardTargetType] = useState<"post" | "comment">("post");
  const [awardTargetIsOwn, setAwardTargetIsOwn] = useState(false);
  const [giftRecipientAddress, setGiftRecipientAddress] = useState("");
  const [giftRecipientUsername, setGiftRecipientUsername] = useState("");

  // --- handlers -----------------------------------------------------------
  const setVoteOverride = useHomePostCardStore((s) => s.setVoteOverride);
  const clearVoteOverride = useHomePostCardStore((s) => s.clearVoteOverride);
  const postVote = useVoteHandler({
    onOptimisticUpdate: (targetId, result) => {
      setVoteOverride(targetId, {
        hasLiked: result.hasLiked,
        hasDisliked: result.hasDisliked,
        likes: result.newLikes,
      });
    },
    onRollback: (targetId) => {
      clearVoteOverride(targetId);
    },
  });
  const [commentVoteOverrides, setCommentVoteOverrides] = useState<
    Record<
      string,
      { hasLiked?: boolean; hasDisliked?: boolean; likeDelta?: number }
    >
  >({});
  const commentVote = useVoteHandler({
    onOptimisticUpdate: (targetId, result) => {
      setCommentVoteOverrides((prev) => {
        const currentDelta = prev[targetId]?.likeDelta ?? 0;
        return {
          ...prev,
          [targetId]: {
            hasLiked: result.hasLiked,
            hasDisliked: result.hasDisliked,
            likeDelta: currentDelta + result.likeDelta,
          },
        };
      });
    },
    onRollback: (targetId) => {
      setCommentVoteOverrides((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    },
  });

  // Apply optimistic comment vote overrides recursively before render.
  const applyVoteOverridesToComment = useCallback(
    (comment: Comment): Comment => {
      const override = commentVoteOverrides[comment.id];
      const updated: Comment = override
        ? {
            ...comment,
            likes: comment.likes + (override.likeDelta ?? 0),
            hasLiked: override.hasLiked ?? comment.hasLiked,
            hasDisliked: override.hasDisliked ?? comment.hasDisliked,
          }
        : comment;
      if (updated.replies && updated.replies.length > 0) {
        return {
          ...updated,
          replies: updated.replies.map(applyVoteOverridesToComment),
        };
      }
      return updated;
    },
    [commentVoteOverrides],
  );
  const applyOptimisticReplies = useCallback(
    (comment: Comment): Comment => {
      const pendingReplies = optimisticReplyComments[comment.id] ?? [];
      const existingReplies = comment.replies ?? [];
      const processedReplies = existingReplies.map(applyOptimisticReplies);
      const existingIds = new Set(existingReplies.map((r) => r.id));
      const dedupedPending = pendingReplies.filter((r) => !existingIds.has(r.id));
      const allReplies = [...processedReplies, ...dedupedPending];
      return {
        ...comment,
        replies: allReplies.length > 0 ? allReplies : comment.replies,
        replyCount: (comment.replyCount ?? 0) + dedupedPending.length,
      };
    },
    [optimisticReplyComments],
  );

  const allDisplayComments = useMemo(() => {
    const localIds = new Set(optimisticTopLevelComments.map((c) => c.id));
    const deduped = comments.filter((c) => !localIds.has(c.id));
    return [...optimisticTopLevelComments, ...deduped]
      .map(applyOptimisticReplies)
      .map(applyVoteOverridesToComment)
      .filter(
        (c) =>
          !hiddenCommentIds.has(c.id) && !blockedUserIds.has(c.author.id),
      )
      .sort((a, b) => {
        const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt);
        const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : Number(b.createdAt);
        return timeA - timeB;
      });
  }, [
    optimisticTopLevelComments,
    comments,
    applyOptimisticReplies,
    applyVoteOverridesToComment,
    hiddenCommentIds,
    blockedUserIds,
  ]);

  const focusedThreadState = useMemo(() => {
    const isVisible = (comment: Comment) =>
      !hiddenCommentIds.has(comment.id) && !blockedUserIds.has(comment.author.id);
    const findComment = (items: Comment[]): Comment | null => {
      if (!focusedCommentId) return null;
      for (const item of items) {
        if (item.id === focusedCommentId) return item;
        const nested = item.replies?.length ? findComment(item.replies) : null;
        if (nested) return nested;
      }
      return null;
    };
    const processFocused = (comment: Comment) =>
      applyVoteOverridesToComment(applyOptimisticReplies(comment));

    if (!focusedCommentId) {
      return { focused: null as Comment | null, parents: [] as Comment[], hasParent: false, hasReplies: false };
    }

    const focusedFromApi = focusedCommentData?.root
      ? {
          ...transformApiComment(focusedCommentData.root, id ?? null, 0),
          replies: transformApiComments(focusedCommentData.children ?? []),
          replyCount: Math.max(
            focusedCommentData.root.comments ?? 0,
            focusedCommentData.children?.length ?? 0,
          ),
        }
      : null;
    const focused = focusedFromApi
      ? processFocused(focusedFromApi)
      : findComment(allDisplayComments);

    const rootId = id?.toLowerCase();
    const focusedId = focusedCommentId.toLowerCase();
    const parentApiComments = (focusedContextData?.context ?? focusedContextCheckData?.context ?? [])
      .filter((comment) => {
        const contextPostId = comment.post_id.toLowerCase();
        return contextPostId !== rootId && contextPostId !== focusedId;
      })
      .reverse();
    const parents = parentApiComments
      .map((comment, index) =>
        processFocused(
          transformApiComment(
            comment as PostWithChildren,
            index === 0 ? id ?? null : parentApiComments[index - 1]?.post_id ?? null,
            index,
          ),
        ),
      )
      .filter(isVisible);

    const hasReplies = !!focused &&
      ((focused.replies?.length ?? 0) > 0 ||
        (focused.replyCount ?? 0) > 0 ||
        (focusedCommentData?.children?.length ?? 0) > 0 ||
        (focusedCommentData?.root?.comments ?? 0) > 0);

    return {
      focused: focused && isVisible(focused) ? focused : null,
      parents,
      hasParent: parents.length > 0,
      hasReplies,
    };
  }, [
    focusedCommentId,
    allDisplayComments,
    focusedContextData,
    focusedContextCheckData,
    focusedCommentData,
    id,
    applyOptimisticReplies,
    applyVoteOverridesToComment,
    hiddenCommentIds,
    blockedUserIds,
  ]);

  const displayComments = useMemo(() => {
    if (!focusedCommentId || focusedMode === "full") return allDisplayComments;
    const focused = focusedThreadState.focused;
    if (!focused) return [];
    if (focusedMode !== "context" || focusedThreadState.parents.length === 0) {
      return [focused];
    }
    let thread: Comment = focused;
    for (let index = focusedThreadState.parents.length - 1; index >= 0; index -= 1) {
      const parent = focusedThreadState.parents[index];
      thread = {
        ...parent,
        isFocusedContext: true,
        replies: [thread],
        replyCount: Math.max(parent.replyCount ?? 0, 1),
      };
    }
    return [{ ...thread, isFocusedContext: true }];
  }, [focusedCommentId, focusedMode, allDisplayComments, focusedThreadState]);

  useEffect(() => {
    if (!id || !commentsData?.children) return;
    pruneCommentsPresentOnServer(id, comments);
  }, [id, commentsData?.children, comments, pruneCommentsPresentOnServer]);

  const deleteHandler = useDeleteHandler({});
  const blockHandler = useBlockHandler({});
  const reportHandler = useReportHandler({});
  const { handleFollowUser: followUser, handleFollowTopic: followTopic } =
    useFollowHandler({});

  const hasRecentContext = useMemo(() => {
    if (!focusedCommentId || focusedMode === "full") return false;
    if (!isFocusedCommentFetched || !isFocusedContextCheckFetched) return false;
    return focusedThreadState.hasParent;
  }, [focusedCommentId, focusedMode, isFocusedCommentFetched, isFocusedContextCheckFetched, focusedThreadState]);

  const recentContextDone =
    focusedMode === "context" &&
    isFocusedCommentFetched &&
    isFocusedContextCheckFetched &&
    focusedThreadState.hasParent;
  const recentContextDisabled = !hasRecentContext || recentContextDone;

  const hasFullThreadBeyondFocus = useMemo(() => {
    if (!focusedCommentId || focusedMode === "full") return false;
    const countTree = (items: Comment[]): number =>
      items.reduce((total, item) => total + 1 + countTree(item.replies ?? []), 0);
    const fullCount = Math.max(post?.comments ?? 0, countTree(allDisplayComments));
    const focusedCount = countTree(displayComments);
    return fullCount > focusedCount;
  }, [focusedCommentId, focusedMode, post?.comments, allDisplayComments, displayComments]);

  useEffect(() => {
    if (reportHandler.showReportSheet) reportSheetRef.current?.present();
  }, [reportHandler.showReportSheet]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (initialHighlightCommentId) {
      setFocusedCommentId(initialHighlightCommentId);
      setFocusedMode(params.depth ? "context" : "single");
      setHighlightedCommentId(initialHighlightCommentId);
    }
  }, [initialHighlightCommentId, params.depth]);

  useEffect(() => {
    if (!shouldOpenSheetInitially) return;
    const timer = setTimeout(() => collapseMedia(), 100);
    return () => clearTimeout(timer);
  }, [shouldOpenSheetInitially, collapseMedia]);

  useEffect(() => {
    if (!focusedCommentId || focusedMode === "full" || displayComments.length === 0) return;
    const containsComment = (comment: Comment): boolean => {
      if (comment.id === focusedCommentId) return true;
      return comment.replies?.some((reply) => containsComment(reply)) ?? false;
    };
    const index = displayComments.findIndex((comment) => {
      return containsComment(comment);
    });
    if (index < 0) return;
    const timer = setTimeout(() => {
      commentsListRef.current?.scrollToIndex?.({
        index,
        animated: true,
        viewPosition: 0.25,
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [focusedCommentId, focusedMode, displayComments]);

  const removeCommentFromState = useCallback(
    (commentId: string) => {
      if (id) removeOptimisticComment(id, commentId);
      setHiddenCommentIds((prev) => new Set(prev).add(commentId));
    },
    [id, removeOptimisticComment],
  );

  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending) {
      if (pending.type === "post") {
        globalHidePost(pending.id);
        router.back();
      } else if (pending.type === "topic") {
        globalBlockTopic(pending.id);
        router.back();
      } else if (pending.type === "user") {
        globalBlockUser(pending.id);
        if (post?.author.id === pending.id) {
          router.back();
        } else {
          setBlockedUserIds((prev) => new Set(prev).add(pending.id));
        }
      } else if (pending.type === "comment") {
        globalHideComment(pending.id);
        removeCommentFromState(pending.id);
      }
      setSelectedComment(null);
    }
    blockHandler.confirmBlock();
  }, [
    blockHandler,
    globalHidePost,
    globalBlockTopic,
    globalBlockUser,
    globalHideComment,
    post?.author.id,
    removeCommentFromState,
    router,
  ]);

  const handleReportSubmitWithOptimistic = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending) {
        if (pending.type === "post") {
          globalHidePost(pending.id);
          router.back();
        } else if (pending.type === "comment") {
          globalHideComment(pending.id);
          removeCommentFromState(pending.id);
        }
        setSelectedComment(null);
      }
      reportSheetRef.current?.dismiss();
      reportHandler.submitReport(reason);
    },
    [reportHandler, globalHidePost, globalHideComment, removeCommentFromState, router],
  );

  const handleDeleteComment = useCallback(() => {
    if (!selectedComment) return;
    suppressCommentOptionsUntilRef.current = Date.now() + 1000;
    if (selectedComment.id.startsWith("optimistic-") || selectedComment.id.startsWith("local-")) {
      toast.info("Comment is still syncing", "Please try deleting again in a moment.");
      return;
    }
    deleteHandler.requestDelete(selectedComment.id, "comment");
  }, [selectedComment, deleteHandler, toast]);

  const handleConfirmDelete = useCallback(() => {
    const pending = deleteHandler.pendingTarget;
    suppressCommentOptionsUntilRef.current = Date.now() + 1000;
    if (pending?.type === "comment") {
      globalHideComment(pending.id);
      removeCommentFromState(pending.id);
      setSelectedComment(null);
    } else if (pending?.type === "post") {
      globalHidePost(pending.id);
      router.back();
    }
    deleteHandler.confirmDelete();
  }, [deleteHandler, globalHideComment, globalHidePost, removeCommentFromState, router]);

  const handleEditComment = useCallback(() => {
    if (!selectedComment || !post || selectedComment.id.startsWith("optimistic-")) return;
    const createdAt = selectedComment.createdAt instanceof Date
      ? Math.floor(selectedComment.createdAt.getTime() / 1000)
      : Math.floor(Number(selectedComment.createdAt) / (Number(selectedComment.createdAt) > 1e12 ? 1000 : 1));
    router.push({
      pathname: "/comment-compose",
      params: {
        postId: post.id,
        postTitle: post.title,
        postAuthorUsername: post.author.username,
        editCommentId: selectedComment.id,
        editParentId: selectedComment.parentId ?? post.id,
        editContent: selectedComment.content,
        editCreatedAt: String(createdAt),
        editSource: "post",
      },
    });
  }, [selectedComment, post, router]);

  const handleAuthorPress = useCallback(() => {
    if (!post) return;
    router.push(`/user/${post.author.id}`);
  }, [post, router]);

  const handleTopicPress = useCallback(() => {
    if (!post?.topic) return;
    router.push(`/topic/${encodeURIComponent(post.topic)}`);
  }, [post, router]);

  const handleUpvote = useCallback(() => {
    if (!post) return;
    postVote.handleUpvote(
      post.id,
      post.hasLiked ?? false,
      post.hasDisliked ?? false,
      post.likes,
    );
  }, [post, postVote]);

  const handleDownvote = useCallback(() => {
    if (!post) return;
    postVote.handleDownvote(
      post.id,
      post.hasLiked ?? false,
      post.hasDisliked ?? false,
      post.likes,
    );
  }, [post, postVote]);

  const handleShare = useCallback(async () => {
    if (!post) return;
    const url = `${getShareBaseUrl(shareServer)}/p/${post.id}`;
    try {
      await Share.share({ message: url, url });
    } catch {}
  }, [post, shareServer]);

  const handleComment = useCallback(() => {
    if (!post) return;
    requireAuth(() => {
      router.push({
        pathname: "/comment-compose",
        params: {
          postId: post.id,
          postTitle: post.title,
          postAuthorUsername: post.author.username,
          postThumbnail: activeMedia?.uri ?? "",
          postContent: post.body ?? "",
        },
      });
    });
  }, [post, requireAuth, router, activeMedia?.uri]);

  const handleMuteToggle = useCallback(async () => {
    const next = !globalMuted;
    toggleGlobalMute();
    if (!next) {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      }).catch(() => {});
    }
    activeVideoApi()?.setMuted(next).catch(() => {});
  }, [globalMuted, toggleGlobalMute]);

  const handlePlayPause = useCallback(() => {
    activeVideoApi()?.toggle();
  }, [activeIndex]);

  const handleSeek = useCallback(
    (ms: number) => {
      activeVideoApi()?.seek(ms);
    },
    [activeIndex],
  );

  // --- comment submission --------------------------------------------------
  // Mirrors the legacy detail-screen flow: when a user submits via the
  // compose screen, it stores the result in useCommentComposeStore.
  // Here we pick it up, fire the comment mutation, refetch on success,
  // and bump the shared comment count for optimistic UI.
  const commentMutation = useComment({});
  const pendingComment = useCommentComposeStore((s) => s.pendingComment);
  const clearPendingComment = useCommentComposeStore(
    (s) => s.clearPendingComment,
  );

  useEffect(() => {
    if (!pendingComment || !id || pendingComment.postId !== id || !currentUser) return;
    const captured = pendingComment;
    clearPendingComment();

    const parentId = captured.replyToId ?? id;
    const optimisticMediaUrl = captured.imageUri || captured.gifUrl || null;
    const capturedText = captured.text ?? "";
    const optimisticContent = composeCommentContent(capturedText, optimisticMediaUrl);

    const optimisticCommentId = `optimistic-${Date.now()}`;
    const optimisticComment: Comment = {
      id: optimisticCommentId,
      author: {
        id: currentUser.id,
        username: currentUser.username ?? "you",
        avatarSeed: currentUser.walletAddress ?? currentUser.id,
      },
      content: optimisticContent,
      likes: 1,
      dislikes: 0,
      hasLiked: true,
      hasDisliked: false,
      createdAt: new Date(),
      replyCount: 0,
      parentId,
    };

    const actionId = generateActionId();
    enqueue({
      id: actionId,
      type: "comment",
      label: getActionLabel("comment"),
      execute: async () => {
        const mediaUrl = await resolveCommentMediaUrl(captured.imageUri, captured.gifUrl);
        const finalContent = composeCommentContent(capturedText, mediaUrl);

        return commentMutation.mutateAsync({ parentId, content: finalContent });
      },
      onOptimisticUpdate: () => {
        if (captured.replyToId) {
          addReplyOptimisticComment(id, captured.replyToId, optimisticComment);
        } else {
          addTopLevelOptimisticComment(id, optimisticComment);
        }
        setHighlightedCommentId(optimisticCommentId);
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightedCommentId(null), 3000);
        collapseMedia();
        setTimeout(() => commentsListRef.current?.scrollToEnd?.({ animated: true }), 250);
      },
      onSuccess: (result) => {
        const confirmedCommentId =
          typeof result === "object" &&
          result !== null &&
          "tx_hash" in result &&
          typeof (result as { tx_hash?: unknown }).tx_hash === "string"
            ? (result as { tx_hash: string }).tx_hash
            : null;
        if (confirmedCommentId) {
          replaceOptimisticCommentId(id, optimisticCommentId, confirmedCommentId);
          setHighlightedCommentId((prev) =>
            prev === optimisticCommentId ? confirmedCommentId : prev,
          );
        }
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setHighlightedCommentId(null), 3000);
        setTimeout(() => refetchComments(), 2000);
      },
      onError: (err) => {
        Sentry.captureException(err, {
          tags: { feature: "comment", operation: "submit_comment_media_detail" },
          extra: {
            parentId,
            hadImage: !!captured.imageUri,
            hadGif: !!captured.gifUrl,
            contentLength: capturedText.length,
          },
        });
      },
      onRollback: () => {
        removeOptimisticComment(id, optimisticCommentId);
      },
    });
  }, [
    pendingComment,
    id,
    currentUser,
    clearPendingComment,
    commentMutation,
    refetchComments,
    addReplyOptimisticComment,
    addTopLevelOptimisticComment,
    replaceOptimisticCommentId,
    removeOptimisticComment,
    collapseMedia,
    enqueue,
  ]);

  // --- render -------------------------------------------------------------
  if (!post && isLoadingComments) {
    return <MediaPostDetailSkeleton />;
  }

  if (!post) {
    return (
      <Box flex center background="base" p="lg">
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={theme.colors.text.subtle}
        />
        <Text size="lg" weight="semibold" mode="subtle" style={{ marginTop: 12 }}>
          Post unavailable
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text size="sm" weight="medium">
            Go back
          </Text>
        </Pressable>
      </Box>
    );
  }


  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <Box flex background="base">
          {/* --------------- Media (absolute, below header) ------------ */}
          <GestureDetector gesture={mediaPan}>
            <Animated.View
              style={[
                styles.mediaContainer,
                mediaContainerStyle,
              ]}
            >
              {mediaItems.length > 1 ? (
                <PagerView
                  style={{ flex: 1 }}
                  initialPage={0}
                  onPageSelected={(e) =>
                    setActiveIndex(e.nativeEvent.position)
                  }
                >
                  {mediaItems.map((m, i) => (
                    <View key={`${m.uri}-${i}`} style={{ flex: 1 }}>
                      <MediaItemView
                        item={m}
                        isActive={i === activeIndex}
                        screenActive={isFocused}
                        collapseProgress={collapseProgress}
                        onTapWhenCollapsed={expandMedia}
                        registerVideo={registerVideo}
                        videoKey={`m-${i}`}
                        videoSyncScope={videoSyncScope}
                      />
                    </View>
                  ))}
                </PagerView>
              ) : activeMedia ? (
                <MediaItemView
                  item={activeMedia}
                  isActive
                  screenActive={isFocused}
                  collapseProgress={collapseProgress}
                  onTapWhenCollapsed={expandMedia}
                  registerVideo={registerVideo}
                  videoKey="m-0"
                  videoSyncScope={videoSyncScope}
                />
              ) : null}

              {/* gallery dots */}
              {mediaItems.length > 1 && (
                <View style={styles.dotsRow}>
                  {mediaItems.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        i === activeIndex && styles.dotActive,
                      ]}
                    />
                  ))}
                </View>
              )}

              {/* compact controls visible only when collapsed */}
              {isVideoActive && (
                <Animated.View
                  style={[styles.compactRow, compactOverlayStyle]}
                  pointerEvents="box-none"
                >
                  <Pressable
                    onPress={handlePlayPause}
                    hitSlop={8}
                    style={styles.compactBtn}
                  >
                    <Ionicons
                      name={activeStatus.playing ? "pause" : "play"}
                      size={16}
                      color="#fff"
                    />
                  </Pressable>
                  <Text size="xs" style={{ color: "#fff", marginLeft: 6 }}>
                    {formatTime(activeStatus.position)} /{" "}
                    {formatTime(activeStatus.duration)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Pressable
                    onPress={handleMuteToggle}
                    hitSlop={8}
                    style={styles.compactBtn}
                  >
                    <Ionicons
                      name={globalMuted ? "volume-mute" : "volume-high"}
                      size={16}
                      color="#fff"
                    />
                  </Pressable>
                </Animated.View>
              )}
            </Animated.View>
          </GestureDetector>

          {/* --------------- BottomSheet for comments ------------------ */}
          <BottomSheet
            ref={sheetRef}
            index={shouldOpenSheetInitially ? 0 : -1}
            snapPoints={snapPoints}
            animatedIndex={animatedIndex}
            animationConfigs={sheetAnimationConfigs}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            enableOverDrag={false}
            enableHandlePanningGesture
            enableContentPanningGesture
            style={{ zIndex: 30, elevation: 30 }}
            handleIndicatorStyle={{
              backgroundColor: theme.colors.text.subtle,
              width: 36,
              height: 4,
            }}
            handleStyle={{
              backgroundColor: theme.colors.background.default,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              paddingVertical: 10,
              borderTopWidth: 2,
              borderTopColor: theme.colors.border.subtle,
            }}
            backgroundStyle={{
              backgroundColor: theme.colors.background.default,
              borderRadius: 0,
            }}
          >
            <BottomSheetFlatList
              ref={commentsListRef}
              data={displayComments as Comment[]}
              keyExtractor={(c: Comment) => c.id}
              showsVerticalScrollIndicator={false}
              onScrollToIndexFailed={({ index }: { index: number }) => {
                setTimeout(() => {
                  commentsListRef.current?.scrollToIndex?.({
                    index,
                    animated: true,
                    viewPosition: 0.25,
                  });
                }, 300);
              }}
              contentContainerStyle={{
                paddingBottom: inputDockTotalH + 24,
              }}
              ListHeaderComponent={
              <View
                style={styles.sheetHeader}
              >
                {/* post info inside sheet (visible when collapsed) */}
                <View style={styles.sheetPostInfo}>
                  <View style={styles.authorRowFull}>
                    <Pressable
                      onPress={handleAuthorPress}
                      style={styles.authorRow}
                    >
                      <Avatar
                        seed={post.author.avatarSeed ?? post.author.id}
                        size={32}
                      />
                      <Text
                        size="md"
                        weight="semibold"
                        style={{
                          marginLeft: 8,
                          color:
                            post.author.level != null
                              ? getUsernameColor(post.author.level) ??
                                theme.colors.text.default
                              : theme.colors.text.default,
                        }}
                      >
                        @{post.author.username}
                      </Text>
                      <Text
                        size="sm"
                        mode="subtle"
                        style={{ marginHorizontal: 6 }}
                      >
                        •
                      </Text>
                      <TimeAgo
                        timestamp={post.createdAt}
                        showSuffix={false}
                        size="md"
                        mode="subtle"
                      />
                    </Pressable>
                    {currentUser?.id !== post.author.id ? (
                      <FollowMenuButton
                        username={post.author.username}
                        topic={post.topic}
                        isFollowing={
                          post.isFollowing ??
                          followedUsers.includes(post.author.id)
                        }
                        isTopicFollowed={
                          post.topic
                            ? followedTopics.includes(post.topic)
                            : false
                        }
                        onFollowUser={() =>
                          followUser(
                            post.author.id,
                            post.author.username,
                            post.isFollowing ?? false,
                          )
                        }
                        onFollowTopic={() => {
                          if (post.topic) {
                            followTopic(
                              post.topic,
                              followedTopics.includes(post.topic),
                            );
                          }
                        }}
                      />
                    ) : null}
                  </View>
                  <Text
                    size="lg"
                    weight="bold"
                    style={{ marginTop: 6, lineHeight: 20 }}
                  >
                    {post.title}
                  </Text>
                  {post.body ? (
                    <View style={styles.mdNoTrailingMargin}>
                      <MarkdownContent
                        content={post.body}
                        color={theme.colors.text.default}
                      />
                    </View>
                  ) : null}
                </View>

                {focusedCommentId && focusedMode !== "full" ? (
                  <View style={styles.threadReminderCard}>
                    <View style={styles.threadReminderHeaderRow}>
                      <Ionicons
                        name="chatbubbles-outline"
                        size={14}
                        color={theme.colors.text.subtle}
                      />
                      <Text
                        size="xs"
                        mode="subtle"
                        weight="medium"
                        style={styles.threadReminderTitle}
                      >
                        You&apos;re viewing single comment&apos;s thread
                      </Text>
                    </View>
                    <View style={styles.threadReminderActionsRow}>
                      <View style={styles.threadReminderButtonSlot}>
                        <Pressable
                          onPress={() => {
                            setFocusedMode("context");
                            setTimeout(() => refetchFocusedContext(), 0);
                          }}
                          style={({ pressed }) => [
                            styles.threadReminderButton,
                            pressed && styles.threadReminderButtonPressed,
                            recentContextDisabled && styles.threadReminderButtonDisabled,
                          ]}
                          disabled={recentContextDisabled}
                        >
                          <Ionicons
                            name={recentContextDone ? "checkmark-outline" : "arrow-up-outline"}
                            size={14}
                            color={
                              recentContextDisabled
                                ? theme.colors.text.subtle
                                : theme.colors.text.default
                            }
                          />
                          <Text
                            size="xs"
                            weight="semibold"
                            mode={recentContextDisabled ? "subtle" : undefined}
                          >
                            Recent context
                          </Text>
                        </Pressable>
                      </View>
                      <View style={styles.threadReminderButtonSlot}>
                        <Pressable
                          onPress={() => setFocusedMode("full")}
                          style={({ pressed }) => [
                            styles.threadReminderButton,
                            pressed && styles.threadReminderButtonPressed,
                            !hasFullThreadBeyondFocus && styles.threadReminderButtonDisabled,
                          ]}
                          disabled={!hasFullThreadBeyondFocus}
                        >
                          <Ionicons
                            name="list-outline"
                            size={14}
                            color={
                              hasFullThreadBeyondFocus
                                ? theme.colors.text.default
                                : theme.colors.text.subtle
                            }
                          />
                          <Text
                            size="xs"
                            weight="semibold"
                            mode={hasFullThreadBeyondFocus ? undefined : "subtle"}
                          >
                            Full thread
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.dividerThick,
                    { backgroundColor: theme.colors.background.subtle },
                  ]}
                />

                <Text
                  size="md"
                  weight="semibold"
                  style={styles.commentsTitle}
                >
                  Comments ({post.comments})
                </Text>
                <View
                  style={[
                    styles.dividerThick,
                    { backgroundColor: theme.colors.background.subtle },
                  ]}
                />
              </View>
            }
            renderItem={({ item }: { item: Comment }) => (
              <CommentThread
                comment={item}
                highlightedCommentId={highlightedCommentId}
                currentUserId={currentUser?.id ?? null}
                followedUsers={followedUsers}
                onAuthorPress={(authorId) => router.push(`/user/${authorId}`)}
                onLikePress={(cid, l, d, n) =>
                  commentVote.handleUpvote(cid, l, d, n)
                }
                onDislikePress={(cid, l, d, n) =>
                  commentVote.handleDownvote(cid, l, d, n)
                }
                onReplyPress={(c) => {
                  requireAuth(() => {
                    router.push({
                      pathname: "/comment-compose",
                      params: {
                        postId: post.id,
                        postTitle: post.title,
                        postAuthorUsername: post.author.username,
                        postContent: post.body ?? "",
                        replyToId: c.id,
                        replyToUsername: c.author.username,
                        replyToContent: c.content,
                      },
                    });
                  });
                }}
                onMorePress={(c) => {
                  if (Date.now() < suppressCommentOptionsUntilRef.current) return;
                  setSelectedComment(c);
                  commentOptionsRef.current?.present();
                }}
              />
            )}
            ListEmptyComponent={
              !isLoadingComments ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="chatbubbles-outline"
                    size={36}
                    color={theme.colors.text.subtle}
                  />
                  <Text
                    size="md"
                    weight="semibold"
                    mode="subtle"
                    style={{ marginTop: 8 }}
                  >
                    No comments yet
                  </Text>
                  <Text
                    size="sm"
                    mode="subtle"
                    style={{ marginTop: 2, textAlign: "center" }}
                  >
                    Be the first to share your thoughts!
                  </Text>
                </View>
              ) : null
            }
            />
          </BottomSheet>

          {/* --------------- Header overlay ---------------------------- */}
          <Animated.View
            style={[
              styles.header,
              { paddingTop: insets.top, height: headerH },
              headerStyle,
            ]}
            pointerEvents={footerInteractive ? "box-none" : "none"}
          >
            <Pressable
              onPress={() => router.back()}
              style={styles.headerBtn}
              hitSlop={8}
            >
              <AntDesign
                name="close"
                size={22}
                color={theme.colors.text.default}
              />
            </Pressable>
            <View style={styles.headerCenter}>
              {post.topic ? (
                <Pressable onPress={handleTopicPress}>
                  <Text
                    size="lg"
                    weight="semibold"
                    numberOfLines={1}
                    style={{ color: theme.colors.text.default }}
                  >
                    {`#${post.topic}`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => postOptionsRef.current?.present()}
              style={styles.headerBtn}
              hitSlop={8}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={22}
                color={theme.colors.text.default}
              />
            </Pressable>
          </Animated.View>

          {/* --------------- Footer overlay (expanded mode) ----------- */}
          <Animated.View
            style={[
              styles.footerOverlay,
              { paddingBottom: insets.bottom + 8 },
              footerStyle,
            ]}
            pointerEvents={footerInteractive ? "box-none" : "none"}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              if (h > 0 && h !== measuredFooterH) {
                setMeasuredFooterH(h);
              }
            }}
          >
            <PostFooterBlock
              post={post}
              onAuthorPress={handleAuthorPress}
              onUpvote={handleUpvote}
              onDownvote={handleDownvote}
              onComment={handleComment}
              onShare={handleShare}
              onBlockUser={() =>
                blockHandler.requestBlockUser(
                  post.author.id,
                  post.author.username,
                )
              }
              onBlockPost={() => blockHandler.requestBlockPost(post.id)}
              onBlockTopic={() => {
                if (post.topic) {
                  blockHandler.requestBlockTopic(post.topic);
                }
              }}
              onReport={() => reportHandler.requestReport(post.id, "post")}
              isOwnPost={currentUser?.id === post.author.id}
              shareUrl={`${getShareBaseUrl(shareServer)}/p/${post.id}`}
              isVideo={isVideoActive}
              isPlaying={activeStatus.playing}
              positionMs={activeStatus.position}
              durationMs={activeStatus.duration}
              onPlayPause={handlePlayPause}
              onSeek={handleSeek}
              onMoreLink={collapseMedia}
              isMuted={globalMuted}
              onMuteToggle={handleMuteToggle}
              isFollowing={
                post.isFollowing ?? followedUsers.includes(post.author.id)
              }
              isTopicFollowed={
                post.topic ? followedTopics.includes(post.topic) : false
              }
              topic={post.topic}
              isOwnAuthor={currentUser?.id === post.author.id}
              onFollowAuthor={() =>
                followUser(
                  post.author.id,
                  post.author.username,
                  post.isFollowing ?? false,
                )
              }
              onFollowTopic={() => {
                if (post.topic) {
                  followTopic(
                    post.topic,
                    followedTopics.includes(post.topic),
                  );
                }
              }}
            />
          </Animated.View>

          {/* --------------- Comment input dock (collapsed mode) ------ */}
          <Animated.View
            style={[styles.inputDock, inputDockStyle]}
            pointerEvents={footerInteractive ? "none" : "auto"}
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              if (h > 0 && h !== measuredInputDockH) {
                setMeasuredInputDockH(h);
              }
            }}
          >
            <CommentInput
              ref={commentInputRef}
              isLoggedIn={isLoggedIn}
              onAuthRequired={() => requireAuth(() => {})}
              postId={post.id}
              postTitle={post.title}
              postAuthorUsername={post.author.username}
              postThumbnail={activeMedia?.uri}
              postContent={post.body}
            />
          </Animated.View>

          {/* --------------- Sheets ----------------------------------- */}
          <PostOptionsSheet
            ref={postOptionsRef}
            post={post}
            isOwnPost={currentUser?.id === post.author.id}
            isTopicFollowed={
              post.topic ? followedTopics.includes(post.topic) : false
            }
            isFollowingUser={followedUsers.includes(post.author.id)}
            isSaved={savedPosts.some((p) => p.id === post.id)}
            onFollowUser={() =>
              followUser(
                post.author.id,
                post.author.username,
                post.isFollowing ?? false,
              )
            }
            onFollowTopic={() => {
              if (post.topic) {
                followTopic(post.topic, followedTopics.includes(post.topic));
              }
            }}
            onSave={() => {
              const saved = useSavedPostsStore.getState().toggleSavePost(post);
              toast.success(
                saved ? "Post saved" : "Post unsaved",
                saved
                  ? "You can find it in your saved items."
                  : "Removed from saved items.",
              );
            }}
            onBlockPost={() => blockHandler.requestBlockPost(post.id)}
            onBlockUser={() =>
              blockHandler.requestBlockUser(post.author.id, post.author.username)
            }
            onReport={() => reportHandler.requestReport(post.id, "post")}
            onDelete={() => deleteHandler.requestDelete(post.id, "post")}
            onGiveAward={() => {
              setAwardTargetId(post.id);
              setAwardTargetType("post");
              setAwardTargetIsOwn(currentUser?.id === post.author.id);
              setTimeout(() => awardPickerRef.current?.present(), 300);
            }}
            onGiftMirage={() => {
              setGiftRecipientAddress(post.author.id);
              setGiftRecipientUsername(post.author.username);
              setTimeout(() => giftMirageRef.current?.present(), 300);
            }}
            onGiftSubscription={() => {
              setGiftRecipientAddress(post.author.id);
              setGiftRecipientUsername(post.author.username);
              setTimeout(() => giftSubRef.current?.present(), 300);
            }}
            onDismiss={() => {}}
          />

          <ReportSheet
            ref={reportSheetRef}
            targetType={reportHandler.pendingTarget?.type}
            onSubmit={handleReportSubmitWithOptimistic}
            onDismiss={reportHandler.cancelReport}
            isLoading={reportHandler.isReporting}
          />

          <ConfirmationPopup
            visible={blockHandler.showConfirmation}
            title={`Block ${blockHandler.pendingBlock?.label || "user"}?`}
            message={getBlockConfirmationMessage(
              blockHandler.pendingBlock?.type ?? "post",
            )}
            icon="ban-outline"
            confirmText="Block"
            isDestructive
            onConfirm={handleConfirmBlock}
            onCancel={blockHandler.cancelBlock}
          />

          <ConfirmationPopup
            visible={deleteHandler.showConfirmation}
            title={`Delete ${deleteHandler.pendingTarget?.type === "post" ? "post" : "comment"}?`}
            message="This cannot be undone."
            icon="trash-outline"
            confirmText="Delete"
            isDestructive
            isLoading={deleteHandler.isDeleting}
            onConfirm={handleConfirmDelete}
            onCancel={deleteHandler.cancelDelete}
          />

          <CommentOptionsSheet
            ref={commentOptionsRef}
            comment={selectedComment}
            rootPostId={post.id}
            isOwnComment={currentUser?.id === selectedComment?.author.id}
            isFollowingAuthor={
              selectedComment?.author.id
                ? followedUsers.includes(selectedComment.author.id)
                : false
            }
            isSaved={
              selectedComment
                ? savedComments.some((c) => c.id === selectedComment.id)
                : false
            }
            onSave={() => {
              if (!selectedComment) return;
              const saved = useSavedPostsStore
                .getState()
                .toggleSaveComment(selectedComment, post.id);
              toast.success(
                saved ? "Comment saved" : "Comment unsaved",
                saved
                  ? "You can find it in your saved items."
                  : "Removed from saved items.",
              );
            }}
            onCopyText={() => toast.success("Copied", "Comment text copied.")}
            onDelete={handleDeleteComment}
            onEdit={handleEditComment}
            onBlockComment={() => {
              if (selectedComment)
                blockHandler.requestBlockComment(selectedComment.id);
            }}
            onBlockUser={() => {
              if (selectedComment)
                blockHandler.requestBlockUser(
                  selectedComment.author.id,
                  selectedComment.author.username,
                );
            }}
            onReport={() => {
              if (selectedComment)
                reportHandler.requestReport(selectedComment.id, "comment");
            }}
            onToggleFollowAuthor={() => {
              if (!selectedComment) return;
              followUser(
                selectedComment.author.id,
                selectedComment.author.username,
                followedUsers.includes(selectedComment.author.id),
              );
            }}
            onGiveAward={() => {
              if (!selectedComment) return;
              setAwardTargetId(selectedComment.id);
              setAwardTargetType("comment");
              setAwardTargetIsOwn(currentUser?.id === selectedComment.author.id);
              setTimeout(() => awardPickerRef.current?.present(), 300);
            }}
            onGiftMirage={() => {
              if (!selectedComment) return;
              setGiftRecipientAddress(selectedComment.author.id);
              setGiftRecipientUsername(selectedComment.author.username);
              setTimeout(() => giftMirageRef.current?.present(), 300);
            }}
            onGiftSubscription={() => {
              if (!selectedComment) return;
              setGiftRecipientAddress(selectedComment.author.id);
              setGiftRecipientUsername(selectedComment.author.username);
              setTimeout(() => giftSubRef.current?.present(), 300);
            }}
            onDismiss={() => setSelectedComment(null)}
          />

          <AwardPickerSheet
            ref={awardPickerRef}
            targetId={awardTargetId || post.id}
            targetType={awardTargetType}
            isOwnContent={awardTargetIsOwn}
          />
          <GiftMirageSheet
            ref={giftMirageRef}
            recipientAddress={giftRecipientAddress || post.author.id}
            recipientUsername={giftRecipientUsername || post.author.username}
          />
          <GiftSubscriptionSheet
            ref={giftSubRef}
            recipientAddress={giftRecipientAddress || post.author.id}
            recipientUsername={giftRecipientUsername || post.author.username}
          />
        </Box>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

// ---------------------------------------------------------------------------
// Footer block (visible only when media is expanded)
// ---------------------------------------------------------------------------

type FooterProps = {
  post: Post;
  onAuthorPress: () => void;
  onUpvote: () => void;
  onDownvote: () => void;
  onComment: () => void;
  onShare: () => void;
  onBlockUser: () => void;
  onBlockPost: () => void;
  onBlockTopic: () => void;
  onReport: () => void;
  isOwnPost: boolean;
  shareUrl: string;
  isVideo: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  onPlayPause: () => void;
  onSeek: (ms: number) => void;
  onMoreLink: () => void;
  isMuted: boolean;
  onMuteToggle: () => void;
  isFollowing: boolean;
  isTopicFollowed: boolean;
  topic?: string;
  isOwnAuthor: boolean;
  onFollowAuthor: () => void;
  onFollowTopic: () => void;
};

const PostFooterBlock = memo(function PostFooterBlock({
  post,
  onAuthorPress,
  onUpvote,
  onDownvote,
  onComment,
  onShare,
  onBlockUser,
  onBlockPost,
  onBlockTopic,
  onReport,
  isOwnPost,
  shareUrl,
  isVideo,
  isPlaying,
  positionMs,
  durationMs,
  onPlayPause,
  onSeek,
  onMoreLink,
  isMuted,
  onMuteToggle,
  isFollowing,
  isTopicFollowed,
  topic,
  isOwnAuthor,
  onFollowAuthor,
  onFollowTopic,
}: FooterProps) {
  const { theme } = useUnistyles();
  const tierColor =
    post.author.level != null ? getUsernameColor(post.author.level) : undefined;
  return (
    <View style={styles.footerBlock}>
      {/* Row 1: avatar + username */}
      <View style={styles.authorRowFull}>
        <Pressable onPress={onAuthorPress} style={styles.authorRow}>
          <Avatar
            seed={post.author.avatarSeed ?? post.author.id}
            size={32}
          />
          <Text
            size="md"
            weight="semibold"
            style={{
              color: tierColor ?? theme.colors.text.default,
              marginLeft: 8,
            }}
          >
            @{post.author.username}
          </Text>
          <Text size="sm" mode="subtle" style={{ marginHorizontal: 6 }}>
            •
          </Text>
          <TimeAgo
            timestamp={post.createdAt}
            showSuffix={false}
            size="md"
            mode="subtle"
          />
        </Pressable>
        {!isOwnAuthor ? (
          <FollowMenuButton
            username={post.author.username}
            topic={topic}
            isFollowing={isFollowing}
            isTopicFollowed={isTopicFollowed}
            onFollowUser={onFollowAuthor}
            onFollowTopic={onFollowTopic}
          />
        ) : null}
      </View>

      {/* Row 2: title — same size/weight as legacy PostCardContent */}
      <Text
        size="lg"
        weight="bold"
        style={{ marginTop: 4, lineHeight: 20 }}
      >
        {post.title}
      </Text>

      {/* Row 3: body (1 line + more) */}
      {post.body ? (
        <View style={styles.bodyRow}>
          <Text
            size="md"
            numberOfLines={1}
            style={{ flex: 1, color: theme.colors.text.default }}
          >
            {renderInlineBody(post.body)}
          </Text>
          <Pressable onPress={onMoreLink} hitSlop={4}>
            <Text
              size="md"
              weight="medium"
              style={{ color: theme.colors.text.subtle, marginLeft: 6 }}
            >
              more
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Row 4: video controls */}
      {isVideo ? (
        <View style={styles.controlsRow}>
          <Pressable onPress={onPlayPause} hitSlop={8} style={styles.ctrlBtn}>
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={18}
              color={theme.colors.text.subtle}
            />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <SeekBarFlex
              positionMs={positionMs}
              durationMs={durationMs}
              onSeek={onSeek}
              tint={theme.colors.text.subtle}
            />
          </View>
          <Text
            size="xs"
            style={{ color: theme.colors.text.subtle, marginRight: 8 }}
          >
            {formatTime(positionMs)} / {formatTime(durationMs)}
          </Text>
          <Pressable
            onPress={onMuteToggle}
            hitSlop={8}
            style={styles.ctrlBtn}
          >
            <Ionicons
              name={isMuted ? "volume-mute" : "volume-high"}
              size={18}
              color={theme.colors.text.subtle}
            />
          </Pressable>
        </View>
      ) : null}

      {/* Row 5: actions — reuse the feed PostCard's PostActions component */}
      <PostActions
        likes={post.likes}
        dislikes={post.dislikes}
        comments={post.comments}
        hasLiked={post.hasLiked}
        hasDisliked={post.hasDisliked}
        onLikePress={onUpvote}
        onDislikePress={onDownvote}
        onCommentPress={onComment}
        onSharePress={onShare}
        shareUrl={shareUrl}
        shareTitle={post.title}
        isOwnPost={isOwnPost}
        authorUsername={post.author.username}
        onBlockUser={onBlockUser}
        onBlockPost={onBlockPost}
        onBlockTopic={onBlockTopic}
        topic={post.topic}
        onReport={onReport}
        size="md"
        style={{ marginTop: 12 }}
      />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background.default,
  },
  mediaContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background.default,
    overflow: "hidden",
    zIndex: 10,
  },
  mediaItem: {
    flex: 1,
    backgroundColor: theme.colors.background.default,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaInner: {
    width: "100%",
    height: "100%",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.background.default,
    zIndex: 20,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  compactRow: {
    position: "absolute",
    left: theme.spacing.sm,
    right: theme.spacing.sm,
    bottom: theme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  compactBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background.default,
    zIndex: 15,
  },
  footerBlock: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  authorRowFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  followBtn: {
    paddingHorizontal: 12,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  followMenuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  ctrlBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  seekTrack: {
    height: 14,
    justifyContent: "center",
  },
  seekTrackBg: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  seekTrackFill: {
    position: "absolute",
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  seekKnob: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  actionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background.default,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    zIndex: 40,
  },
  commentsList: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1,
  },
  fixedHandleArea: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetHeader: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: 4,
  },
  handleBar: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(127,127,127,0.5)",
  },
  dividerLine: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  dividerThick: {
    height: 5,
    marginHorizontal: -theme.spacing.md, // span past the sheetHeader padding
    marginTop: 12,
    marginBottom: 8,
  },
  mdNoTrailingMargin: {
    marginTop: 4,
    // MarkdownContent's last paragraph has marginBottom: theme.spacing.md
    // which produces a large visible gap before the next element. Clip it.
    marginBottom: -16,
    overflow: "hidden",
  },
  sheetPostInfo: {
    paddingVertical: 2,
  },
  threadReminderCard: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background.subtle,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary[500],
    gap: theme.spacing.sm,
  },
  threadReminderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  threadReminderTitle: {
    flexShrink: 1,
  },
  threadReminderActionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
    width: "100%",
  },
  threadReminderButtonSlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "50%",
    minWidth: 0,
    maxWidth: "50%",
  },
  threadReminderButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.background.default,
    minHeight: 36,
  },
  threadReminderButtonPressed: {
    opacity: 0.7,
  },
  threadReminderButtonDisabled: {
    opacity: 0.5,
    backgroundColor: theme.colors.background.subtle,
  },
  commentsTitle: {
    marginTop: 4,
    marginBottom: 4,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    paddingHorizontal: theme.spacing.lg,
  },
}));
