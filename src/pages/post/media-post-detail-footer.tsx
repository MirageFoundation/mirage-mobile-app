import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import { Avatar, TimeAgo } from "@/src/components/atoms";
import { PostActions } from "@/src/components/molecules";
import { resolvePostContent } from "@/src/components/molecules/post-card-utils";
import { Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { getUsernameColor } from "@/src/utils/tiers";

import type { MediaPostDetailFooterContract } from "./media-post-detail-contracts";
import { MediaPostDetailFollowMenuButton } from "./media-post-detail-follow-menu-button";
import { SeekBarFlex, formatTime } from "./media-post-detail-seek-bar";
import { styles } from "./media-post-detail-styles";

function truncateForInline(body: string, maxChars = 100): string {
  const firstLine = body.split(/\r?\n/)[0] ?? body;
  if (firstLine.length <= maxChars) return firstLine;
  return firstLine.slice(0, maxChars) + "…";
}

function renderInlineBody(body: string): string {
  const firstLine = truncateForInline(body);
  return firstLine
    .replace(/!?\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1");
}

function hasMoreBodyContent(body: string): boolean {
  const lines = body.split(/\r?\n/);
  if (lines.length > 1) {
    // Any additional non-empty lines mean there is more to show.
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim().length > 0) return true;
    }
  }
  const firstLine = lines[0] ?? body;
  return firstLine.length > 100;
}

export const MediaPostDetailFooter = memo(function MediaPostDetailFooter({
  post,
  presentation: { isExpanded, hideVideoControls },
  actions,
  videoControls,
  followState: { isFollowing, isTopicFollowed, topic, isOwnAuthor },
  isOwnPost,
  shareUrl,
}: MediaPostDetailFooterContract) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const tierColor =
    post.author.level != null ? getUsernameColor(post.author.level) : undefined;
  const displayBody = resolvePostContent(post.body, post.media).bodyWithoutUrl ?? "";

  return (
    <View
      style={[
        styles.footerBlock,
        !isExpanded && {
          paddingBottom: insets.bottom || theme.spacing.sm,
        },
      ]}
    >
      <View style={styles.authorRowFull}>
        <Pressable onPress={actions.authorPress} style={styles.authorRow}>
          <Avatar seed={post.author.avatarSeed ?? post.author.id} size={32} />
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
          <MediaPostDetailFollowMenuButton
            username={post.author.username}
            topic={topic}
            isFollowing={isFollowing}
            isTopicFollowed={isTopicFollowed}
            onFollowUser={actions.followAuthor}
            onFollowTopic={actions.followTopic}
          />
        ) : null}
      </View>

      <Text size="lg" weight="bold" style={{ marginTop: 4, lineHeight: 20 }}>
        {post.title}
      </Text>

      {displayBody ? (
        isExpanded ? (
          <Animated.View
            key="media-post-detail-body-expanded"
            entering={FadeIn.duration(180)}
            // Markdown adds a paragraph marginBottom (theme.spacing.md);
            // offset it so the spacing below the body matches the collapsed
            // single-line variant exactly.
            style={{ marginTop: 4, marginBottom: -theme.spacing.md }}
          >
            <MarkdownContent content={displayBody} />
          </Animated.View>
        ) : (
          <Animated.View
            key="media-post-detail-body-collapsed"
            entering={FadeIn.duration(180)}
            style={styles.bodyRow}
          >
            <Text
              size="md"
              numberOfLines={1}
              style={{ flex: 1, color: theme.colors.text.default }}
            >
              {renderInlineBody(displayBody)}
            </Text>
            {hasMoreBodyContent(displayBody) ? (
              <Pressable onPress={actions.expandSheet} hitSlop={4}>
                <Text
                  size="md"
                  weight="medium"
                  style={{ color: theme.colors.text.subtle, marginLeft: 6 }}
                >
                  more
                </Text>
              </Pressable>
            ) : null}
          </Animated.View>
        )
      ) : null}

      {videoControls.isVideo && !hideVideoControls ? (
        <Animated.View
          style={styles.controlsRow}
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(120)}
        >
          <Pressable onPress={videoControls.playPause} hitSlop={8} style={styles.ctrlBtn}>
            <Ionicons
              name={videoControls.isPlaying ? "pause" : "play"}
              size={18}
              color={theme.colors.text.default}
            />
          </Pressable>
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <SeekBarFlex
              positionMs={videoControls.positionMs}
              durationMs={videoControls.durationMs}
              onSeek={videoControls.seek}
              tint={theme.colors.text.default}
              playing={videoControls.isPlaying}
            />
          </View>
          <Text
            size="xs"
            style={{ color: theme.colors.text.default, marginRight: 8 }}
          >
            {formatTime(videoControls.positionMs)} / {formatTime(videoControls.durationMs)}
          </Text>
          <Pressable
            onPress={videoControls.muteToggle}
            hitSlop={8}
            style={styles.ctrlBtn}
          >
            <Ionicons
              name={videoControls.isMuted ? "volume-mute" : "volume-high"}
              size={18}
              color={theme.colors.text.default}
            />
          </Pressable>
        </Animated.View>
      ) : null}

      <PostActions
        likes={post.likes}
        dislikes={post.dislikes}
        comments={post.comments}
        hasLiked={post.hasLiked}
        hasDisliked={post.hasDisliked}
        onLikePress={actions.upvote}
        onDislikePress={actions.downvote}
        onCommentPress={actions.comment}
        onSharePress={actions.share}
        shareUrl={shareUrl}
        shareTitle={post.title}
        isOwnPost={isOwnPost}
        authorUsername={post.author.username}
        onBlockUser={actions.blockUser}
        onBlockPost={actions.blockPost}
        onBlockTopic={actions.blockTopic}
        topic={post.topic}
        onReport={actions.reportPost}
        size="md"
        style={{ marginTop: 12 }}
      />
    </View>
  );
});
