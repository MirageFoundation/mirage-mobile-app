import { TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useMemo } from "react";
import { Pressable, View } from "react-native";

const MAX_HEADER_LENGTH = 30;

function getTopicUsernameDisplay(topic?: string, username?: string) {
  if (!topic) return { displayTopic: undefined, showUsername: true };
  const topicLen = topic.length;
  const usernameLen = username?.length ?? 0;
  if (topicLen + usernameLen <= MAX_HEADER_LENGTH) {
    return { displayTopic: topic, showUsername: true };
  }
  if (topicLen > MAX_HEADER_LENGTH) {
    return { displayTopic: topic.slice(0, MAX_HEADER_LENGTH) + "...", showUsername: false };
  }
  return { displayTopic: topic, showUsername: false };
}

import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { PostAuthor } from "./post-card-types";
import { getUsernameColor } from "@/src/utils/tiers";

const NEW_USER_COLOR = "rgb(94,194,106)";

type PostCardHeaderProps = {
  author: PostAuthor;
  topic?: string;
  createdAt: Date | string | number;
  isOwnPost: boolean;
  isFollowing?: boolean;
  isTopicFollowed?: boolean;
  showFollowButton?: boolean;
  onAuthorPress?: () => void;
  onTopicPress?: () => void;
  onFollowUser?: () => void;
  onFollowTopic?: () => void;
  onMorePress?: () => void;
  topicDisabled?: boolean;
  directFollowUser?: boolean;
  showMoreButton?: boolean;
  disabled?: boolean;
};

export const PostCardHeader = memo(function PostCardHeader({
  author,
  topic,
  createdAt,
  isOwnPost,
  isFollowing,
  isTopicFollowed,
  showFollowButton = true,
  onAuthorPress,
  onTopicPress,
  onFollowUser,
  onFollowTopic,
  onMorePress,
  topicDisabled = false,
  directFollowUser = false,
  showMoreButton = false,
  disabled = false,
}: PostCardHeaderProps) {
  const { theme } = useUnistyles();

  const isFollowingAll = topic
    ? !!(isFollowing && isTopicFollowed)
    : !!isFollowing;

  const isFollowingPartial = topic
    ? !!(isFollowing || isTopicFollowed) && !isFollowingAll
    : false;

  const followMenuMinWidth = Math.max(
    180,
    Math.max(
      topic ? `${isTopicFollowed ? "Unfollow" : "Follow"} #${topic}`.length : 0,
      `${isFollowing ? "Unfollow" : "Follow"} @${author.username}`.length,
    ) *
      10 +
      60,
  );

  const handleAuthorPress = useCallback(() => {
    if (disabled) return;
    triggerHaptic("selection");
    onAuthorPress?.();
  }, [disabled, onAuthorPress]);

  const handleTopicPress = useCallback(() => {
    if (disabled) return;
    triggerHaptic("selection");
    onTopicPress?.();
  }, [disabled, onTopicPress]);

  const handleMorePress = useCallback(() => {
    if (disabled) return;
    triggerHaptic("selection");
    onMorePress?.();
  }, [disabled, onMorePress]);

  const handleFollowUser = useCallback(() => {
    if (disabled) return;
    triggerHaptic("medium");
    onFollowUser?.();
  }, [disabled, onFollowUser]);

  const handleFollowTopic = useCallback(() => {
    if (disabled) return;
    triggerHaptic("medium");
    onFollowTopic?.();
  }, [disabled, onFollowTopic]);

  const { displayTopic, showUsername } = useMemo(
    () => getTopicUsernameDisplay(topic, author.username),
    [topic, author.username],
  );

  const subtleTextStyle = useMemo(
    () => ({ color: theme.colors.text.subtle }),
    [theme.colors.text.subtle],
  );
  const usernameColorStyle = useMemo(() => {
    if (author.isNewUser) return { color: NEW_USER_COLOR };
    const tierColor = author.level != null ? getUsernameColor(author.level) : undefined;
    if (tierColor) return { color: tierColor };
    return { color: theme.colors.text.subtle };
  }, [author.level, author.isNewUser, theme.colors.text.subtle]);
  const followingBgStyle = useMemo(
    () => ({
      backgroundColor: isFollowing ? "transparent" : theme.colors.primary[500],
      borderColor: isFollowing ? theme.colors.border.default : theme.colors.primary[500],
      height: isFollowing ? 22 : 20,
    }),
    [isFollowing, theme.colors.primary, theme.colors.border.default],
  );
  const followTextStyle = useMemo(
    () => ({
      color: isFollowing ? theme.colors.text.default : theme.colors.background.default,
    }),
    [isFollowing, theme.colors.text.default, theme.colors.background.default],
  );
  const defaultBgStyle = useMemo(
    () => ({ color: "#000000" }),
    [],
  );

  return (
    <View style={styles.header}>
      <View style={styles.authorSection}>
        <View style={styles.authorRow}>
          {topic && !topicDisabled && (
            <Pressable
              onPress={handleTopicPress}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              style={({ pressed }) => [pressed && styles.usernameButtonPressed]}
            >
              <Text size="lg" weight="bold" numberOfLines={1}>
                #{displayTopic}
              </Text>
            </Pressable>
          )}
          {topic && topicDisabled && (
            <Text
              size="lg"
              weight="bold"
              numberOfLines={1}
              style={subtleTextStyle}
            >
              #{displayTopic}
            </Text>
          )}
          {topic && !topicDisabled && (
            <Text size="sm" style={subtleTextStyle}>
              •
            </Text>
          )}
          <TimeAgo
            timestamp={createdAt}
            showSuffix={false}
            size="md"
            style={subtleTextStyle}
          />
          {showUsername && (
            <Text size="sm" style={subtleTextStyle}>
              •
            </Text>
          )}
          {showUsername && (
            <Pressable
              onPress={handleAuthorPress}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              style={({ pressed }) => [
                styles.usernameButton,
                pressed && styles.usernameButtonPressed,
              ]}
            >
              <Text
                size="md"
                weight="medium"
                numberOfLines={1}
                style={usernameColorStyle}
              >
                @{author.username}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.headerActions}>
        {!isOwnPost && showFollowButton && directFollowUser && (
          <Pressable
            onPress={handleFollowUser}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.followPressable}
          >
            <View style={[styles.followButton, followingBgStyle]}>
              <Text size="sm" weight="bold" style={followTextStyle}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </View>
          </Pressable>
        )}
        {!isOwnPost && showFollowButton && !directFollowUser && (
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
                  style={[styles.followButton, styles.followButtonPartial]}
                >
                  <Text size="sm" weight="bold" style={defaultBgStyle}>
                    Follow
                  </Text>
                </LinearGradient>
              ) : (
                <View style={[styles.followButton, followingBgStyle]}>
                  <Text size="sm" weight="bold" style={followTextStyle}>
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
                  minWidth: followMenuMinWidth,
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
              {topic && (
                <MenuOption onSelect={handleFollowTopic}>
                  <View style={styles.menuOption}>
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
              )}

              <MenuOption onSelect={handleFollowUser}>
                <View style={styles.menuOption}>
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
                    {isFollowing ? "Unfollow" : "Follow"} @{author.username}
                  </Text>
                </View>
              </MenuOption>
            </MenuOptions>
          </Menu>
        )}
        {showMoreButton && (
          <AnimatedPressable
            scaleAmount={0.85}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            onPress={handleMorePress}
            style={styles.moreButton}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={18}
              color={theme.colors.text.default}
            />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  authorSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  usernameButton: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  usernameButtonPressed: {
    opacity: 0.6,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  followPressable: {
    padding: 4,
  },
  followButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    minWidth: 54,
    height: 20,
    paddingHorizontal: 6,
    borderWidth: 1,
  },
  followButtonPartial: {
    borderColor: theme.colors.border.default,
    height: 20,
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
  },
  moreButton: {
    width: 32,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    marginRight: -5,
  },
}));
