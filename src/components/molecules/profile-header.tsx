import { Ionicons } from "@expo/vector-icons";
import AnimatedPressable from "@/src/components/ui/primitives/animated-pressable";
import * as Clipboard from "expo-clipboard";
import * as Sentry from "@sentry/react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
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

import { ShareIcon } from "@/assets/figma-icons";
import { Avatar, IconButton } from "@/src/components/atoms";
import { Box, Divider, Icon, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { getTierName, getTierColor } from "@/src/utils/tiers";
import { styles } from "./profile-header-styles";

const PROFILE_GRADIENT_COLORS: readonly string[] = [
  "rgb(102, 126, 234)",
  "rgb(118, 75, 162)",
  "#000000",
];

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
  onSubscriptionPress?: () => void;
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
  onSubscriptionPress,
}: ProfileHeaderBarProps) => {
  const insets = useSafeAreaInsets();

  const headerBgStyle = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 0 };

    const opacity = interpolate(
      scrollY.value,
      [SCROLL_THRESHOLD * 0.3, SCROLL_THRESHOLD * 0.7],
      [0, 1],
      'clamp',
    );

    return { opacity };
  });

  return (
    <View
      style={[styles.headerBar, { paddingTop: insets.top }]}
    >
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000' }, headerBgStyle]} />
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
                  size={isOwnProfile ? "lg" : "md"}
                  weight="semibold"
                  style={[styles.whiteText, isOwnProfile ? undefined : { marginBottom: -5 }]}
                  numberOfLines={1}
                >
                  {username}
                </Text>
                {!isOwnProfile && (
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
                )}
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
          {isOwnProfile && (
            <Pressable
              onPress={Platform.OS !== "ios" ? onSubscriptionPress : undefined}
              style={styles.tierHeaderBadge}
            >
              <Icon
                icon={Ionicons}
                name="shield-checkmark"
                size={16}
                color={getTierColor(userLevel)}
              />
              <Text size="md" weight="semibold" style={{ color: getTierColor(userLevel) }}>
                {getTierName(userLevel)}
              </Text>
            </Pressable>
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
              <Text size="md" weight="semibold" style={styles.followButtonText}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </AnimatedPressable>
          )}
          {!isOwnProfile && (
            <IconButton
              name="ellipsis-horizontal"
              size="md"
              color="#FFFFFF"
              onPress={onMenuPress}
              style={styles.iconButton}
            />
          )}
        </Box>
      </Box>
    </View>
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
    return walletAddress;
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
      Sentry.addBreadcrumb({ category: "profile", message: "Clipboard copy address failed", data: { error: String(error) }, level: "warning" });
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
            rounded="sm"
            paddingRatio={0}
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
                  color={getTierColor(userLevel)}
                />
                <Text size="xs" weight="medium" style={{ color: getTierColor(userLevel) }}>
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
