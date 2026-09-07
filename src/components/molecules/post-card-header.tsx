import { Avatar, TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAuthStore, useUIStore } from "@/src/stores";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useMemo } from "react";
import { Pressable, View } from "react-native";

import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { PostAuthor } from "./post-card-types";
import { getUsernameColor } from "@/src/utils/tiers";

const MAX_HEADER_LENGTH = 30;

function getCommunityUsernameDisplay(community?: string, username?: string) {
  if (!community) return { displayCommunity: undefined, showUsername: true };
  const communityLen = community.length + 2;
  const usernameLen = username?.length ?? 0;
  if (communityLen + usernameLen <= MAX_HEADER_LENGTH) {
    return { displayCommunity: community, showUsername: true };
  }
  if (communityLen > MAX_HEADER_LENGTH) {
    return { displayCommunity: community.slice(0, MAX_HEADER_LENGTH - 2) + "...", showUsername: false };
  }
  return { displayCommunity: community, showUsername: false };
}

const NEW_USER_COLOR = "rgb(94,194,106)";

type PostCardHeaderProps = {
  author: PostAuthor;
  community?: string;
  createdAt: Date | string | number;
  isOwnPost: boolean;
  isFollowing?: boolean;
  isCommunityJoined?: boolean;
  showFollowButton?: boolean;
  onAuthorPress?: () => void;
  onCommunityPress?: () => void;
  onFollowUser?: () => void;
  onToggleCommunityMembership?: () => void;
  onMorePress?: () => void;
  communityDisabled?: boolean;
  directFollowUser?: boolean;
  showMoreButton?: boolean;
  disabled?: boolean;
  isPostDetail?: boolean;
};

export const PostCardHeader = memo(function PostCardHeader({
  author,
  community,
  createdAt,
  isOwnPost,
  isFollowing,
  isCommunityJoined,
  showFollowButton = true,
  onAuthorPress,
  onCommunityPress,
  onFollowUser,
  onToggleCommunityMembership,
  onMorePress,
  communityDisabled = false,
  directFollowUser = false,
  showMoreButton = false,
  disabled = false,
  isPostDetail = false,
}: PostCardHeaderProps) {
  const { theme } = useUnistyles();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);

  const isFollowingAll = community
    ? !!(isFollowing && isCommunityJoined)
    : !!isFollowing;

  const isFollowingPartial = community
    ? !!(isFollowing || isCommunityJoined) && !isFollowingAll
    : false;

  const followMenuMinWidth = Math.max(
    180,
    Math.max(
      community ? `${isCommunityJoined ? "Leave" : "Join"} [${community}]`.length : 0,
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

  const handleCommunityPress = useCallback(() => {
    if (disabled) return;
    triggerHaptic("selection");
    onCommunityPress?.();
  }, [disabled, onCommunityPress]);

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

  const handleToggleCommunityMembership = useCallback(() => {
    if (disabled) return;
    triggerHaptic("medium");
    onToggleCommunityMembership?.();
  }, [disabled, onToggleCommunityMembership]);

  const handleAuthRequiredFollow = useCallback(() => {
    if (disabled) return;
    triggerHaptic("medium");
    showAuthSheet();
  }, [disabled, showAuthSheet]);

  const { displayCommunity, showUsername } = useMemo(
    () => getCommunityUsernameDisplay(community, author.username),
    [community, author.username],
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

  if (isPostDetail) {
    return (
      <View style={styles.header}>
        <Pressable
          onPress={handleAuthorPress}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.postDetailAuthorRow,
            pressed && styles.usernameButtonPressed,
          ]}
        >
          <Avatar
            seed={author.avatarSeed ?? author.id}
            size={32}
          />
          <Text
            size="md"
            weight="semibold"
            numberOfLines={1}
            style={[styles.postDetailUsername, usernameColorStyle]}
          >
            @{author.username}
          </Text>
          <Text size="sm" style={[subtleTextStyle, styles.postDetailDot]}>
            •
          </Text>
          <TimeAgo
            timestamp={createdAt}
            showSuffix={false}
            size="md"
            style={subtleTextStyle}
          />
        </Pressable>
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
          {!isOwnPost && showFollowButton && !directFollowUser && !isLoggedIn && (
            <Pressable
              onPress={handleAuthRequiredFollow}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.followPressable}
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
            </Pressable>
          )}
          {!isOwnPost && showFollowButton && !directFollowUser && isLoggedIn && (
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
                {community && (
                  <MenuOption onSelect={handleToggleCommunityMembership}>
                    <View style={styles.menuOption}>
                      <Ionicons
                        name={isCommunityJoined ? "pricetag" : "pricetag-outline"}
                        size={14}
                        color={
                          isCommunityJoined
                            ? theme.colors.primary[500]
                            : theme.colors.text.subtle
                        }
                      />
                      <Text
                        size="lg"
                        weight={isCommunityJoined ? "semibold" : "medium"}
                        numberOfLines={1}
                        style={
                          isCommunityJoined
                            ? { color: theme.colors.primary[500] }
                            : undefined
                        }
                      >
                        {isCommunityJoined ? "Leave" : "Join"} [{community}]
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
        </View>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <View style={styles.authorSection}>
        <View style={styles.authorRow}>
          {!!community && !communityDisabled && (
            <Pressable
              onPress={handleCommunityPress}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              style={({ pressed }) => [pressed && styles.usernameButtonPressed]}
            >
              <Text size="sm" weight="medium" numberOfLines={1} style={subtleTextStyle}>
                [{displayCommunity}]
              </Text>
            </Pressable>
          )}
          {!!community && communityDisabled && (
            <Text
              size="sm"
              weight="medium"
              numberOfLines={1}
              style={subtleTextStyle}
            >
              [{displayCommunity}]
            </Text>
          )}
          {!!community && (
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
          {showUsername && (
            <Text size="sm" style={subtleTextStyle}>
              •
            </Text>
          )}
          <TimeAgo
            timestamp={createdAt}
            showSuffix={false}
            size="sm"
            style={subtleTextStyle}
          />
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
        {!isOwnPost && showFollowButton && !directFollowUser && !isLoggedIn && (
          <Pressable
            onPress={handleAuthRequiredFollow}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.followPressable}
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
          </Pressable>
        )}
        {!isOwnPost && showFollowButton && !directFollowUser && isLoggedIn && (
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
              {community && (
                <MenuOption onSelect={handleToggleCommunityMembership}>
                  <View style={styles.menuOption}>
                    <Ionicons
                      name={isCommunityJoined ? "pricetag" : "pricetag-outline"}
                      size={14}
                      color={
                        isCommunityJoined
                          ? theme.colors.primary[500]
                          : theme.colors.text.subtle
                      }
                    />
                    <Text
                      size="lg"
                      weight={isCommunityJoined ? "semibold" : "medium"}
                      numberOfLines={1}
                      style={
                        isCommunityJoined
                          ? { color: theme.colors.primary[500] }
                          : undefined
                      }
                    >
                      {isCommunityJoined ? "Leave" : "Join"} [{community}]
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
  postDetailAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  postDetailUsername: {
    marginLeft: 8,
  },
  postDetailDot: {
    marginHorizontal: 6,
  },
}));
