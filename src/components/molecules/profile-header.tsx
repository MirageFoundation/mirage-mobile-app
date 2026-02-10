const PROFILE_GRADIENT_COLORS: readonly string[] = [
  "rgb(102, 126, 234)",
  "rgb(118, 75, 162)",
  "#000000",
];
import { Ionicons } from "@expo/vector-icons";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Animated as RNAnimated,
  View,
} from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { ShareIcon } from "@/assets/figma-icons";
import { Avatar, IconButton } from "@/src/components/atoms";
import { Box, Divider, Icon, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { getTierName } from "@/src/utils/tiers";

export const PROFILE_CONTENT_HEIGHT = 280;
export const SCROLL_THRESHOLD = PROFILE_CONTENT_HEIGHT;

type ProfileHeaderBarProps = {
  username: string;
  userLevel?: number;
  gradientColors: readonly string[];
  scrollY?: SharedValue<number>;
  isRefreshing?: boolean;
  isLoading?: boolean;
  isOwnProfile?: boolean;
  isFollowing?: boolean;
  onBackPress?: () => void;
  onFollowPress?: () => void;
  onUnfollowPress?: () => void;
  onMenuPress?: () => void;
};

type ProfileContentProps = {
  username: string;
  avatarSeed?: string;
  avatarUrl?: string;
  walletAddress: string;
  followersCount: number;
  balance: number;
  reserve: number;
  accountAgeDays: number;
  userLevel?: number;
  gradientColors: readonly string[];
  scrollY?: SharedValue<number>;
  onFollowersPress?: () => void;
  isLoading?: boolean;
};

type ProfileHeaderProps = ProfileHeaderBarProps & ProfileContentProps;

const formatAccountAge = (days: number): string => {
  const totalMinutes = days * 24 * 60;
  const totalHours = days * 24;

  if (totalMinutes < 1) {
    return "-";
  }

  if (totalHours < 1) {
    const minutes = Math.floor(totalMinutes);
    return `${minutes}min`;
  }

  if (days < 1) {
    const hours = Math.floor(totalHours);
    return `${hours}hr`;
  }

  if (days < 30) {
    const d = Math.floor(days);
    return `${d}d`;
  }

  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months}mo`;
  }

  const years = Math.floor(days / 365);
  return `${years}yr`;
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

export const getGradientColor = (_username?: string): readonly string[] => {
  return PROFILE_GRADIENT_COLORS;
};

export const ProfileHeaderBar = ({
  username,
  userLevel = 0,
  gradientColors,
  scrollY,
  isRefreshing = false,
  isLoading = false,
  isOwnProfile = false,
  isFollowing = false,
  onBackPress,
  onFollowPress,
  onUnfollowPress,
  onMenuPress,
}: ProfileHeaderBarProps) => {
  const insets = useSafeAreaInsets();

  const headerBgStyle = useAnimatedStyle(() => {
    if (!scrollY) return { backgroundColor: "rgba(0,0,0,0)" };

    const backgroundColor = interpolateColor(
      scrollY.value,
      [0, SCROLL_THRESHOLD * 0.3, SCROLL_THRESHOLD * 0.7, SCROLL_THRESHOLD],
      ["rgba(0,0,0,0)", "rgba(0,0,0,0)", "#000000", "#000000"],
    );

    return { backgroundColor };
  });

  return (
    <Animated.View
      style={[styles.headerBar, { paddingTop: insets.top }, headerBgStyle]}
    >
      <Box direction="row" center px="md" py="sm" style={styles.headerRow}>
        <Box direction="row" center gap="xs">
          <IconButton
            name="arrow-back"
            size="md"
            color="#FFFFFF"
            onPress={onBackPress}
            style={styles.iconButton}
          />

          <Box gap="xs" style={styles.usernameContainer}>
            {isLoading ? (
              <View style={styles.usernameSkeleton} />
            ) : (
              <>
                <Text
                  size="md"
                  weight="semibold"
                  style={[styles.whiteText, { marginBottom: -5 }]}
                  numberOfLines={1}
                >
                  {username}
                </Text>
                <Box direction="row" center gap="xs">
                  <Text size="sm" style={styles.subtleWhiteText}>
                    {getTierName(userLevel)} Tier
                  </Text>
                  <Icon
                    icon={Ionicons}
                    name="shield-checkmark"
                    size={10}
                    color="rgba(255,255,255,0.7)"
                  />
                </Box>
              </>
            )}
          </Box>
        </Box>

        <Box direction="row" center gap="xs">
          {isRefreshing && (
            <View style={styles.refreshIndicator}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
          )}
          {!isOwnProfile && (
            <AnimatedPressable
              scaleAmount={0.9}
              onPress={() => {
                triggerHaptic("selection");
                if (isFollowing) {
                  onUnfollowPress?.();
                } else {
                  onFollowPress?.();
                }
              }}
              style={[
                styles.followButton,
                {
                  backgroundColor: isFollowing
                    ? "rgba(255,255,255,0.15)"
                    : "rgb(232, 84, 41)",
                  borderWidth: 1,
                  borderColor: isFollowing
                    ? "rgba(255,255,255,0.3)"
                    : "rgb(232, 84, 41)",
                },
              ]}
            >
              <Text size="sm" weight="semibold" style={styles.followButtonText}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </AnimatedPressable>
          )}
          <IconButton
            name="ellipsis-horizontal"
            size="md"
            color="#FFFFFF"
            onPress={onMenuPress}
            style={styles.iconButton}
          />
        </Box>
      </Box>
    </Animated.View>
  );
};

export const ProfileContent = ({
  username,
  avatarSeed,
  avatarUrl,
  walletAddress,
  followersCount,
  balance,
  reserve,
  accountAgeDays,
  userLevel = 0,
  gradientColors,
  scrollY,
  onFollowersPress,
  isLoading = false,
}: ProfileContentProps) => {
  const [copied, setCopied] = useState(false);
  const walletScale = useRef(new RNAnimated.Value(1)).current;

  const truncatedAddress = useMemo(() => {
    if (!walletAddress) return "";
    if (walletAddress.length <= 13) return walletAddress;
    return `${walletAddress.slice(
      0,
      6,
    )}.....................${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [copied]);

  const handleCopyAddress = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(walletAddress);
      setCopied(true);
      triggerHaptic("success");
    } catch (error) {
      console.error("Failed to copy address:", error);
    }
  }, [walletAddress]);

  const handleWalletPressIn = useCallback(() => {
    RNAnimated.spring(walletScale, {
      toValue: 0.95,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [walletScale]);

  const handleWalletPressOut = useCallback(() => {
    RNAnimated.spring(walletScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [walletScale]);

  const contentFadeStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 1 };

    const opacity = interpolate(
      scrollY.value,
      [0, SCROLL_THRESHOLD * 0.6, SCROLL_THRESHOLD],
      [1, 0.3, 0],
      "clamp",
    );

    return { opacity };
  });

  return (
    <LinearGradient
      colors={[...gradientColors] as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.gradientContent}
    >
      <Animated.View style={[styles.profileContentInner, contentFadeStyle]}>
        <Box px="md" pt="sm">
          <Avatar
            size={80}
            seed={avatarSeed || username}
            source={avatarUrl ? { uri: avatarUrl } : undefined}
            rounded="full"
            bordered
          />

          <Box mt="sm">
            {isLoading ? (
              <View style={styles.usernameContentSkeleton} />
            ) : (
              <Text size="xl" weight="bold" style={styles.whiteText}>
                {username}
              </Text>
            )}
          </Box>

          <Pressable onPress={onFollowersPress}>
            <Box direction="row" alignItems="center" mt="xs">
              <Box
                direction="row"
                center
                gap="xs"
                py="xs"
                px="sm"
                rounded="full"
                style={styles.tierBadge}
              >
                <Icon
                  icon={Ionicons}
                  name="shield-checkmark"
                  size={12}
                  color="#FFFFFF"
                />
                <Text size="xs" weight="medium" style={styles.whiteText}>
                  {getTierName(userLevel)} Tier
                </Text>
              </Box>
              <Box style={styles.dot} />
              <Text size="sm" weight="bold" style={styles.whiteText}>
                {formatNumber(followersCount)}
              </Text>
              <Text size="sm" style={styles.whiteText}>
                {" "}
                followers
              </Text>
            </Box>
          </Pressable>

          <RNAnimated.View
            style={[
              styles.walletAnimatedContainer,
              { transform: [{ scale: walletScale }] },
            ]}
          >
            <Pressable
              onPress={handleCopyAddress}
              onPressIn={handleWalletPressIn}
              onPressOut={handleWalletPressOut}
            >
              <Box
                direction="row"
                center
                gap="xs"
                py="xs"
                px="sm"
                rounded="md"
                style={[styles.walletPill, copied && styles.walletPillCopied]}
              >
                <Icon
                  icon={Ionicons}
                  name="wallet-outline"
                  size={14}
                  color={copied ? "#10B981" : "rgba(255,255,255,0.6)"}
                />
                <Text
                  size="xs"
                  style={[
                    styles.walletAddress,
                    copied && styles.walletAddressCopied,
                  ]}
                >
                  {copied ? "Copied!" : truncatedAddress}
                </Text>
                <Icon
                  icon={Ionicons}
                  name={copied ? "checkmark" : "copy-outline"}
                  size={14}
                  color={copied ? "#10B981" : "rgba(255,255,255,0.6)"}
                />
              </Box>
            </Pressable>
          </RNAnimated.View>

          <Box
            direction="row"
            center
            mt="md"
            py="md"
            px="sm"
            rounded="lg"
            style={styles.statsContainer}
          >
            <Box flex center>
              {isLoading ? (
                <View style={styles.statSkeleton} />
              ) : (
                <Text size="lg" weight="bold" style={styles.whiteText}>
                  {formatNumber(balance)}
                </Text>
              )}
              <Text size="xs" style={styles.statLabel}>
                Balance
              </Text>
            </Box>

            <Divider direction="vertical" style={styles.statDivider} />

            <Box flex center>
              {isLoading ? (
                <View style={styles.statSkeleton} />
              ) : (
                <Text size="lg" weight="bold" style={styles.whiteText}>
                  {formatNumber(reserve)}
                </Text>
              )}
              <Text size="xs" style={styles.statLabel}>
                Reserve
              </Text>
            </Box>

            <Divider direction="vertical" style={styles.statDivider} />

            <Box flex center>
              {isLoading ? (
                <View style={styles.statSkeleton} />
              ) : (
                <Text size="lg" weight="bold" style={styles.whiteText}>
                  {formatAccountAge(accountAgeDays)}
                </Text>
              )}
              <Text size="xs" style={styles.statLabel}>
                Account Age
              </Text>
            </Box>
          </Box>
        </Box>
      </Animated.View>
    </LinearGradient>
  );
};

export const ProfileHeader = ({
  username,
  avatarSeed,
  avatarUrl,
  walletAddress,
  followersCount,
  balance,
  reserve,
  accountAgeDays,
  userLevel,
  scrollY,
  onFollowersPress,
}: ProfileHeaderProps) => {
  const gradientColors = useMemo(() => getGradientColor(username), [username]);

  return (
    <View style={styles.container}>
      <ProfileContent
        username={username}
        avatarSeed={avatarSeed}
        avatarUrl={avatarUrl}
        walletAddress={walletAddress}
        followersCount={followersCount}
        balance={balance}
        reserve={reserve}
        accountAgeDays={accountAgeDays}
        gradientColors={gradientColors}
        scrollY={scrollY}
        onFollowersPress={onFollowersPress}
      />
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  headerRow: {
    justifyContent: "space-between",
  },
  gradientContent: {
    width: "100%",
    paddingBottom: theme.spacing.lg,
  },
  profileContentInner: {},
  iconButton: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: theme.radius.full,
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  followButton: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  followButtonText: {
    color: "#FFFFFF",
  },
  refreshIndicator: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  usernameContainer: {
    paddingHorizontal: theme.spacing.sm,
    alignItems: "flex-start",
  },
  usernameSkeleton: {
    width: 80,
    height: 18,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  usernameContentSkeleton: {
    width: 120,
    height: 24,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  whiteText: {
    color: "#FFFFFF",
  },
  tierBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  subtleWhiteText: {
    color: "rgba(255,255,255,0.7)",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginHorizontal: theme.spacing.xs,
  },
  walletAnimatedContainer: {
    alignSelf: "flex-start",
    marginTop: theme.spacing.sm,
  },
  walletPill: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  walletPillCopied: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  walletAddress: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "monospace",
  },
  walletAddressCopied: {
    color: "#10B981",
  },
  statsContainer: {
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "space-around",
  },
  statLabel: {
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  statDivider: {
    height: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0,
    width: 1,
  },
  statSkeleton: {
    width: 48,
    height: 22,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
}));
