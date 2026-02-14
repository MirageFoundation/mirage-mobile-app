import { TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { PostAuthor } from "./post-card-types";

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
}: PostCardHeaderProps) {
  const { theme } = useUnistyles();

  const isFollowingAll = topic
    ? !!(isFollowing && isTopicFollowed)
    : !!isFollowing;

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
    triggerHaptic("selection");
    onAuthorPress?.();
  }, [onAuthorPress]);

  const handleTopicPress = useCallback(() => {
    triggerHaptic("selection");
    onTopicPress?.();
  }, [onTopicPress]);

  const handleMorePress = useCallback(() => {
    triggerHaptic("selection");
    onMorePress?.();
  }, [onMorePress]);

  const handleFollowUser = useCallback(() => {
    triggerHaptic("medium");
    onFollowUser?.();
  }, [onFollowUser]);

  const handleFollowTopic = useCallback(() => {
    triggerHaptic("medium");
    onFollowTopic?.();
  }, [onFollowTopic]);

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
                #{topic}
              </Text>
            </Pressable>
          )}
          {topic && topicDisabled && (
            <Text
              size="lg"
              weight="bold"
              numberOfLines={1}
              style={{ color: theme.colors.text.subtle }}
            >
              #{topic}
            </Text>
          )}
          {topic && !topicDisabled && (
            <Text size="sm" style={{ color: theme.colors.text.subtle }}>
              •
            </Text>
          )}
          <TimeAgo
            timestamp={createdAt}
            showSuffix={false}
            size="md"
            style={{ color: theme.colors.text.subtle }}
          />
          <Text size="sm" style={{ color: theme.colors.text.subtle }}>
            •
          </Text>
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
              style={{ color: theme.colors.text.subtle }}
            >
              @{author.username.toLowerCase()}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.headerActions}>
        {!isOwnPost && showFollowButton && directFollowUser && (
          <Pressable
            onPress={handleFollowUser}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ padding: 4 }}
          >
            <View
              style={[
                styles.followButton,
                {
                  backgroundColor: isFollowing
                    ? "transparent"
                    : theme.colors.primary[500],
                  borderColor: isFollowing
                    ? theme.colors.border.default
                    : theme.colors.primary[500],
                 height: isFollowing ? 22 : 20,
                },
              ]}
            >
              <Text
                size="sm"
                weight="bold"
                style={{
                  color: isFollowing
                    ? theme.colors.text.default
                    : theme.colors.background.default,
                }}
              >
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
              <View
                style={[
                  styles.followButton,
                  {
                    backgroundColor: isFollowingAll
                      ? "transparent"
                      : theme.colors.primary[500],
                    borderColor: isFollowingAll
                      ? theme.colors.border.default
                      : theme.colors.primary[500],
                   height: isFollowingAll ? 22 : 20,
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
  followButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    minWidth: 54,
    height: 20,
    paddingHorizontal: 6,
    borderWidth: 1,
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
