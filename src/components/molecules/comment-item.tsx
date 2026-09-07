import {
  DownvoteFilledIcon,
  UpvoteFilledIcon,
} from "@/assets/figma-icons";
import { AwardBadges } from "@/src/components/atoms/award-badges";
import { TimeAgo, FollowButton, Avatar } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { ModerationButton } from "@/src/features/moderation/moderation-provider";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { MediaPreviewModal } from "./media-preview-modal";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons, Octicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openUrlOrInternal } from "@/src/utils/internal-link-handler";
import type { Comment } from "@/src/domain/content";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  Animated as RNAnimated,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { getUsernameColor } from "@/src/utils/tiers";

// Vote colors (same as post-actions)
const UPVOTE_COLOR = "#22C55E"; // Green for upvote
const DOWNVOTE_COLOR = "#EF4444"; // Red for downvote
const NEW_USER_COLOR = "rgb(94,194,106)";

/* ------------------------------------------------------------------
 * Reddit-style avatar-anchored threading geometry.
 *
 * Ported 1:1 from the web `default` theme's `ViewPostView.js`.
 * Each non-root comment renders a 22px DiceBear identicon avatar
 * inline at the start of its meta row. Three connector layers are
 * drawn as absolutely-positioned `View`s on the comment row:
 *
 *   1. Ancestor rails — full-height vertical lines at each ancestor
 *      depth where this comment is NOT the last child of that
 *      ancestor's subtree (so the line continues through siblings
 *      and forms one unbroken thread).
 *   2. J-curve elbow — drops from the parent avatar's vertical
 *      center, curves right, lands at this comment's avatar left
 *      edge. Drawn for every depth >= 1 (i.e. every nested reply).
 *   3. Own spine — vertical line from this comment's avatar center
 *      down to the row bottom; only when the comment has children
 *      and is not collapsed.
 *
 * Geometry (matches web mobile breakpoints):
 *   avatarLeft(d)   = BASE_LEFT + d * INDENT
 *   contentLeft(d)  = avatarLeft(d) + AVATAR + GAP   (d >= 0)
 *   railX(d)        = avatarLeft(d - 1) + AVATAR / 2 (d >= 1)
 *
 * Avatar center y = paddingTop + AVATAR / 2.
 * ------------------------------------------------------------------ */
const COMMENT_BASE_LEFT = 12;
/* Tapered indent — keep early threads readable, shrink deeper levels
   so long branches don't squeeze the comment body into a tiny column
   on the right. Rails/elbow geometry stay consistent because both
   ancestor rails and the J-curve read from `commentAvatarLeftPx`. */
const COMMENT_INDENT_NEAR = 20; // depths 1-2
const COMMENT_INDENT_MID = 14;  // depths 3-5
const COMMENT_INDENT_FAR = 10;  // depths 6+
const COMMENT_AVATAR_SIZE = 22;
const COMMENT_CONTENT_GAP = 6;
const COMMENT_RAIL_WIDTH = 1;
const COMMENT_PADDING_TOP_EXPANDED = 10;
const COMMENT_PADDING_TOP_COLLAPSED = 8;
const COMMENT_AVATAR_CENTER_Y_EXPANDED =
  COMMENT_PADDING_TOP_EXPANDED + COMMENT_AVATAR_SIZE / 2; // 21
const COMMENT_AVATAR_CENTER_Y_COLLAPSED =
  COMMENT_PADDING_TOP_COLLAPSED + COMMENT_AVATAR_SIZE / 2; // 19

function commentIndentForDepth(depth: number): number {
  if (depth <= 2) return COMMENT_INDENT_NEAR;
  if (depth <= 5) return COMMENT_INDENT_MID;
  return COMMENT_INDENT_FAR;
}

function commentAvatarLeftPx(depth: number): number {
  const d = Math.max(depth, 0);
  let left = COMMENT_BASE_LEFT;
  for (let i = 1; i <= d; i++) {
    left += commentIndentForDepth(i);
  }
  return left;
}

function commentContentLeftPx(depth: number): number {
  return commentAvatarLeftPx(depth) + COMMENT_AVATAR_SIZE + COMMENT_CONTENT_GAP;
}

function commentRailXPx(depth: number): number {
  // Parent avatar center column.
  const d = Math.max(depth, 1);
  return commentAvatarLeftPx(d - 1) + COMMENT_AVATAR_SIZE / 2;
}

export type { Comment, CommentAuthor } from "@/src/domain/content";

type CommentItemProps = {
  /** Comment data */
  comment: Comment;
  /** Whether the current user is the author */
  isOwnComment?: boolean;
  /** Whether this comment is highlighted (navigated to from profile) */
  isHighlighted?: boolean;
  /** Whether the current user is following the comment author */
  isFollowingAuthor?: boolean;
  /** Whether follow action is loading */
  isFollowLoading?: boolean;
  /** Callback when follow button is pressed */
  onFollowPress?: () => void;
  /** Callback when the comment row is pressed (for collapse) */
  onPress?: () => void;
  /** Callback when avatar/username is pressed */
  onAuthorPress?: () => void;
  /** Callback when like is pressed */
  onLikePress?: () => void;
  /** Callback when dislike is pressed */
  onDislikePress?: () => void;
  /** Callback when reply is pressed */
  onReplyPress?: () => void;
  /** Callback when more options is pressed */
  onMorePress?: () => void;
  /** Whether this comment is collapsed */
  isCollapsed?: boolean;
  /** Nesting depth for visual indent */
  depth?: number;
  /** Maximum depth before collapsing visually */
  maxDepth?: number;
  /**
   * Ancestor rail depths to draw through this comment's row. A depth
   * `K` means a 1px vertical rail should run the full row height at
   * the column belonging to the ancestor at depth `K` (because that
   * ancestor still has un-rendered siblings further down). Computed
   * by `CommentThread`.
   */
  activeDepths?: number[];
  /**
   * Whether this comment has children. Drives the "own spine" — a
   * 1px vertical line dropping from this avatar's center down to the
   * row bottom so the thread continues into the next reply.
   */
  hasChildren?: boolean;
  /** Called when the highlighted comment row lays out. */
  onHighlightedLayout?: (event: LayoutChangeEvent) => void;
  /** Hide reddit-style connector rails for web-style focused contexts. */
  hideThreadRails?: boolean;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
};

const SIZE_CONFIG = {
  iconSize: 18,
  avatarSize: "sm" as const,
};

// Regex to match image URLs (standalone URLs on their own line)
const IMAGE_URL_REGEX = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))$/i;

// Regex to match Cloudflare Images URLs
const CLOUDFLARE_IMAGE_REGEX = /^https?:\/\/imagedelivery\.net\/[^\s]+$/i;

// Regex to match Giphy URLs (handles media.giphy.com, media0-4.giphy.com, i.giphy.com)
const GIPHY_URL_REGEX =
  /^https?:\/\/(?:media\d?\.giphy\.com|i\.giphy\.com)\/[^\s]+$/i;

const LOCAL_FILE_IMAGE_REGEX =
  /^(?:file:\/\/|ph:\/\/|content:\/\/)[^\s]+$/i;

function isImageUrl(url: string): boolean {
  return (
    IMAGE_URL_REGEX.test(url) ||
    CLOUDFLARE_IMAGE_REGEX.test(url) ||
    GIPHY_URL_REGEX.test(url) ||
    LOCAL_FILE_IMAGE_REGEX.test(url)
  );
}

function extractImageUrls(content: string): {
  text: string;
  imageUrls: string[];
} {
  const imageUrls: string[] = [];
  const textLines: string[] = [];
  const lines = content.split("\n");

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmedLine = line.trim();

    if (isImageUrl(trimmedLine)) {
      imageUrls.push(trimmedLine);
    } else {
      textLines.push(line);
    }
  }

  return { text: textLines.join("\n").trim(), imageUrls };
}

/**
 * Component to render an image in comment
 */
const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_HORIZONTAL_PADDING = 32;

const CommentImage = memo(({
  url,
  onPress,
}: {
  url: string;
  onPress?: (url: string) => void;
}) => {
  const { theme } = useUnistyles();
  const [hasError, setHasError] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);

  const mediaSource = useMemo(() => ({ uri: url }), [url]);

 const MEDIA_MAX_HEIGHT = 450;
  const containerWidth = (SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING) * 0.6;
  const calculatedHeight = containerWidth / aspectRatio;
  const exceedsMaxHeight = calculatedHeight > MEDIA_MAX_HEIGHT;
  const mediaWrapperStyle = exceedsMaxHeight
    ? { height: MEDIA_MAX_HEIGHT }
    : { aspectRatio };

  if (hasError) {
    return (
      <View
        style={[
          commentImageStyles.errorContainer,
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
    <View style={commentImageStyles.mediaContainer}>
      <Pressable
        style={[commentImageStyles.mediaWrapper, mediaWrapperStyle]}
        onPress={() => {
          if (onPress) {
            triggerHaptic("selection");
            onPress(url);
          }
        }}
      >
        <Image
          source={mediaSource}
          style={commentImageStyles.image}
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
          <View style={commentImageStyles.skeletonOverlay}>
            <ActivityIndicator size="small" color="rgba(150,150,150,0.6)" />
          </View>
        )}
      </Pressable>
    </View>
  );
});
CommentImage.displayName = "CommentImage";
const commentImageStyles = StyleSheet.create((theme) => ({
  mediaContainer: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
 mediaWrapper: {
    width: "60%",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
  },
  errorContainer: {
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

const CommentContent = memo(({ content }: { content: string }) => {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const { text, imageUrls } = useMemo(
    () => extractImageUrls(content),
    [content],
  );

  const handleLinkPress = useCallback((url: string) => {
    triggerHaptic("light");
    openUrlOrInternal(url);
  }, []);

  const handleImagePress = useCallback((url: string) => {
    setPreviewImageUrl(url);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewImageUrl(null);
  }, []);

  return (
    <>
      <View style={styles.content}>
        {text.length > 0 && (
          <MarkdownContent content={text} onLinkPress={handleLinkPress} />
        )}

        {imageUrls.map((url, index) => (
          <CommentImage
            key={`img-${index}`}
            url={url}
            onPress={handleImagePress}
          />
        ))}
      </View>

      <MediaPreviewModal
        visible={!!previewImageUrl}
        media={previewImageUrl ? { type: "image", uri: previewImageUrl } : null}
        onClose={handleClosePreview}
      />
    </>
  );
});
CommentContent.displayName = "CommentContent";

export const CommentItem = ({
  comment,
  isOwnComment = false,
  isHighlighted = false,
  isFollowingAuthor = false,
  isFollowLoading = false,
  onFollowPress,
  onPress,
  onAuthorPress,
  onLikePress,
  onDislikePress,
  onReplyPress,
  onMorePress,
  isCollapsed = false,
  depth = 0,
  maxDepth = 20,
  activeDepths,
  hasChildren = false,
  onHighlightedLayout,
  hideThreadRails = false,
  style,
}: CommentItemProps) => {
  const { theme } = useUnistyles();

  const { author, content, likes, hasLiked, hasDisliked, createdAt } = comment;

  const usernameColorStyle = useMemo(() => {
    if (author.isNewUser) return { color: NEW_USER_COLOR };
    const tierColor = author.level != null ? getUsernameColor(author.level) : undefined;
    if (tierColor) return { color: tierColor };
    return undefined;
  }, [author.level, author.isNewUser]);

  // Highlight style for navigated-to comment
  const highlightStyle = isHighlighted
    ? { backgroundColor: theme.colors.primary[500] + "20" } // 20% opacity
    : undefined;

  // Animation values for arrow movement (using RN Animated for transform)
  const upArrowTranslateY = useRef(new RNAnimated.Value(0)).current;
  const downArrowTranslateY = useRef(new RNAnimated.Value(0)).current;

  // Animation for collapse/expand
  const animationProgress = useSharedValue(isCollapsed ? 0 : 1);

  useEffect(() => {
    if (isCollapsed) {
      animationProgress.value = withTiming(0, {
        duration: 150,
        easing: Easing.out(Easing.quad),
      });
    } else {
      animationProgress.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [isCollapsed, animationProgress]);



  const animatedFollowStyle = useAnimatedStyle(() => ({
    opacity: animationProgress.value,
    pointerEvents: animationProgress.value === 0 ? "none" : "auto",
  } as any));

  // Avatar-anchored threading geometry. `depth` is 0-indexed (0 =
  // top-level comment). We cap at `maxDepth` so visually indented
  // sub-threads don't drift off-screen on long chains.
  const effectiveDepth = Math.min(depth, maxDepth);
  const contentLeft = commentContentLeftPx(effectiveDepth);
  const avatarLeft = commentAvatarLeftPx(effectiveDepth);
  const avatarCenterY = isCollapsed
    ? COMMENT_AVATAR_CENTER_Y_COLLAPSED
    : COMMENT_AVATAR_CENTER_Y_EXPANDED;
  const paddingTop = isCollapsed
    ? COMMENT_PADDING_TOP_COLLAPSED
    : COMMENT_PADDING_TOP_EXPANDED;
  const railColor = theme.colors.border.subtle;
  const avatarSeed = comment.author.avatarSeed || comment.author.id || comment.author.username || "anon";
  const ancestorRailDepths = (activeDepths || []).filter(
    (d) => d >= 0 && d < depth,
  );
  const hasImmediateParentRail = ancestorRailDepths.includes(effectiveDepth - 1);

  const handlePress = useCallback(() => {
    triggerHaptic("light");
    onPress?.();
  }, [onPress]);

  const handleAuthorPress = useCallback(() => {
    triggerHaptic("selection");
    onAuthorPress?.();
  }, [onAuthorPress]);

  const handleLikePress = useCallback(() => {
    triggerHaptic(hasLiked ? "light" : "medium");

    // Animate arrow movement - bounce up
    RNAnimated.sequence([
      RNAnimated.timing(upArrowTranslateY, {
        toValue: -3,
        duration: 150,
        useNativeDriver: true,
      }),
      RNAnimated.timing(upArrowTranslateY, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    onLikePress?.();
  }, [hasLiked, onLikePress, upArrowTranslateY]);

  const handleDislikePress = useCallback(() => {
    triggerHaptic(hasDisliked ? "light" : "medium");

    // Animate arrow movement - bounce down
    RNAnimated.sequence([
      RNAnimated.timing(downArrowTranslateY, {
        toValue: 3,
        duration: 150,
        useNativeDriver: true,
      }),
      RNAnimated.timing(downArrowTranslateY, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    onDislikePress?.();
  }, [hasDisliked, onDislikePress, downArrowTranslateY]);

  const handleReplyPress = useCallback(() => {
    triggerHaptic("selection");
    onReplyPress?.();
  }, [onReplyPress]);

  const handleMorePress = useCallback(() => {
    triggerHaptic("selection");
    onMorePress?.();
  }, [onMorePress]);

  // Format count for display
  const formatCount = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const iconColor = theme.colors.text.subtle;

  // Vote colors persist based on state (same as post-actions)
  const upvoteColor = hasLiked ? UPVOTE_COLOR : iconColor;
  const downvoteColor = hasDisliked ? DOWNVOTE_COLOR : iconColor;

  return (
    <Pressable
      onPress={handlePress}
      onLayout={isHighlighted ? onHighlightedLayout : undefined}
      style={[
        styles.container,
        { paddingTop, paddingLeft: contentLeft },
        highlightStyle,
        style,
      ]}
    >
      {/* Layer 1 — ancestor rails. One 1px vertical line per ancestor
         depth where this comment is NOT the last child of that
         ancestor's subtree, drawn full-height so the line tiles
         seamlessly across consecutive sibling rows. The J-curve is
         painted above these rails, so shared parent columns stay
         continuous without visually doubling. */}
      {!hideThreadRails && ancestorRailDepths.map((d) => (
        <View
          key={`anc-${d}`}
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -1,
            bottom: -1,
            left:
              commentAvatarLeftPx(Math.min(d, maxDepth)) +
              COMMENT_AVATAR_SIZE / 2,
            width: COMMENT_RAIL_WIDTH,
            backgroundColor: railColor,
          }}
        />
      ))}

      {/* Layer 2 — elbow connector. The parent column is already
         drawn by ancestor rails for non-last siblings, so only draw
         our own vertical drop when that rail is absent. The horizontal
         segment overlaps the parent rail by 1px and reaches the
         avatar edge so there is no visible gap on either side. */}
      {!hideThreadRails && effectiveDepth >= 1 && (
        <>
          {!hasImmediateParentRail && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: commentRailXPx(effectiveDepth),
                width: COMMENT_RAIL_WIDTH,
                height: avatarCenterY,
                backgroundColor: railColor,
              }}
            />
          )}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: avatarCenterY,
              left: commentRailXPx(effectiveDepth),
              width: avatarLeft - commentRailXPx(effectiveDepth) + COMMENT_RAIL_WIDTH,
              height: COMMENT_RAIL_WIDTH,
              backgroundColor: railColor,
            }}
          />
        </>
      )}

      {/* Layer 3 — own spine. Drops from this comment's avatar
         center down to the row bottom so descendants visually
         continue the thread. Only drawn when expanded with
         children. */}
      {!hideThreadRails && hasChildren && !isCollapsed && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: avatarCenterY,
            bottom: 0,
            left: avatarLeft + COMMENT_AVATAR_SIZE / 2,
            width: COMMENT_RAIL_WIDTH,
            backgroundColor: railColor,
          }}
        />
      )}

      <View style={styles.contentWrapper}>
        {/* Header: Avatar, Username, Time */}
        <View style={styles.header}>
          {/* Inline DiceBear identicon avatar — pulled left into the
             gutter via negative marginLeft so its left edge lands at
             `avatarLeft`, exactly where the J-curve elbow terminates. */}
          <View style={styles.avatarWrapper} pointerEvents="none">
            <Avatar
              seed={avatarSeed}
              size={COMMENT_AVATAR_SIZE}
              containerStyle={styles.commentAvatarContainer}
            />
          </View>
          <View style={[styles.authorSection, isCollapsed && styles.authorSectionCollapsed]}>
            <View style={[styles.authorInfo, isCollapsed && styles.authorInfoCollapsed]}>
              <View style={[styles.authorRow, isCollapsed && styles.authorRowCollapsed]}>
                <Pressable
                  onPress={handleAuthorPress}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  style={({ pressed }) => [
                    styles.usernameButton,
                    pressed && styles.usernameButtonPressed,
                  ]}
                >
                  <Text
                    size="md"
                    weight="medium"
                    numberOfLines={1}
                    mode={usernameColorStyle ? undefined : "subtle"}
                    style={usernameColorStyle}
                  >
                    @{author.username}
                  </Text>
                </Pressable>

                <Text size="md" mode="subtle">
                  ·
                </Text>

                <TimeAgo timestamp={createdAt} showSuffix={false} size="md" />
                {isCollapsed && (
                  <Text
                    size="md"
                    mode="subtle"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={styles.collapsedPreview}
                  >
                    {content}
                  </Text>
                )}
              </View>
            </View>
          </View>
          <View
            pointerEvents="none"
            style={[styles.expandArea, isCollapsed && styles.expandAreaCollapsed]}
          />
          {!isOwnComment && (
            <Animated.View style={[styles.followButtonWrapper, animatedFollowStyle]}>
              <FollowButton
                isFollowing={isFollowingAuthor}
                onPress={onFollowPress}
                size="sm"
                loading={isFollowLoading}
                disabled={isFollowingAuthor}
              />
            </Animated.View>
          )}
        </View>

        {/* Comment content - collapsible */}
        {!isCollapsed && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(120)}
        >
          <CommentContent content={content} />

          {comment.awards && comment.awards.length > 0 && (
            <View style={styles.awardBadgesRow}>
              <AwardBadges awards={comment.awards} size="sm" />
            </View>
          )}

          {/* Actions below content on the right */}
          <View style={styles.actionsRow}>
            <View style={styles.actions}>
              <ModerationButton target={{ postId: comment.id, authorId: comment.author.id }} />
              {/* More options (three dots) */}
              <AnimatedPressable
                scaleAmount={0.85}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={handleMorePress}
                style={styles.actionButton}
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={SIZE_CONFIG.iconSize + 5}
                  color={iconColor}
                />
              </AnimatedPressable>

              {/* Reply */}
              {onReplyPress ? (
              <AnimatedPressable
                scaleAmount={0.85}
                onPress={handleReplyPress}
                style={styles.actionButton}
                hitSlop={{ top: 20, bottom: 20, left: 10, right: 10 }}
              >
                <Octicons
                  name="reply"
                  size={
                    depth === 0
                      ? SIZE_CONFIG.iconSize
                      : SIZE_CONFIG.iconSize + 4
                  }
                  color={iconColor}
                />
                {depth === 0 && (
                  <Text
                    size="sm"
                    mode="subtle"
                    weight="bold"
                    style={styles.actionText}
                  >
                    Reply
                  </Text>
                )}
              </AnimatedPressable>
              ) : null}

              {/* Vote group: upvote + count + downvote */}
              <View style={styles.voteGroup}>
                <Pressable
                  onPress={handleLikePress}
                  style={styles.voteButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <RNAnimated.View
                    style={{ transform: [{ translateY: upArrowTranslateY }] }}
                  >
                    {hasLiked ? (
                      <UpvoteFilledIcon
                        size={SIZE_CONFIG.iconSize}
                        color={upvoteColor}
                      />
                    ) : (
                      <UpvoteFilledIcon
                        size={SIZE_CONFIG.iconSize}
                        color={upvoteColor}
                      />
                    )}
                  </RNAnimated.View>
                </Pressable>

                <Text
                  size="sm"
                  weight="bold"
                  style={{
                    color: hasLiked
                      ? upvoteColor
                      : hasDisliked
                        ? downvoteColor
                        : iconColor,
                  }}
                >
                  {formatCount(likes)}
                </Text>

                <Pressable
                  onPress={handleDislikePress}
                  style={styles.voteButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <RNAnimated.View
                    style={{ transform: [{ translateY: downArrowTranslateY }] }}
                  >
                    {hasDisliked ? (
                      <DownvoteFilledIcon
                        size={SIZE_CONFIG.iconSize}
                        color={downvoteColor}
                      />
                    ) : (
                      <DownvoteFilledIcon
                        size={SIZE_CONFIG.iconSize}
                        color={downvoteColor}
                      />
                    )}
                  </RNAnimated.View>
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    /* paddingTop / paddingLeft are applied inline since they are
       depth- and collapse-state-dependent. paddingRight gives the
       right gutter for action buttons; paddingBottom matches the
       web mobile rhythm (0.6rem ≈ 10px expanded, 0.4rem ≈ 7px
       collapsed — we use a single value here for simplicity). */
    position: "relative",
    paddingRight: theme.spacing.md,
    paddingBottom: theme.spacing.sm + 2,
  },
  contentWrapper: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  /* Pull the avatar back into the gutter so its left edge lands at
     `commentAvatarLeftPx` (= the column the J-curve elbow terminates
     at). The negative margin equals AVATAR + GAP so the username
     text starts at the same x as the body content below. */
  avatarWrapper: {
    width: COMMENT_AVATAR_SIZE,
    height: COMMENT_AVATAR_SIZE,
    marginLeft: -(COMMENT_AVATAR_SIZE + COMMENT_CONTENT_GAP),
    marginRight: COMMENT_CONTENT_GAP,
    flexShrink: 0,
    alignSelf: "center",
    zIndex: 2,
  },
  commentAvatarContainer: {
    backgroundColor:
      rt.themeName === "light" ? "#FFFFFF" : theme.colors.background.subtle,
  },
  authorSection: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  authorInfo: {
    flexShrink: 0,
  },
  authorInfoCollapsed: {
    flex: 1,
    minWidth: 0,
  },
  usernameButton: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    flexShrink: 0,
  },
  usernameButtonPressed: {
    opacity: 0.6,
  },
  expandArea: {
    flex: 1,
    height: 32,
  },
  expandAreaCollapsed: {
    flex: 0,
    width: theme.spacing.xs,
  },
  followButtonWrapper: {
    justifyContent: "center",
  },
  collapsedPreview: {
    flex: 1,
    minWidth: 0,
    marginLeft: theme.spacing.xs,
    paddingRight: theme.spacing.sm,
  },
  authorSectionCollapsed: {
    flex: 1,
    flexShrink: 1,
  },
  authorRowCollapsed: {
    flex: 1,
    minWidth: 0,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing.xs,
  },
  content: {
    marginTop: theme.spacing.xs,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: theme.spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md + 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  actionText: {
    marginLeft: 5,
  },
  voteGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  awardBadgesRow: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
}));
