import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Animated as RNAnimated, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import { Avatar } from "@/src/components/atoms";
import { Box, Divider, Icon, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

import { SCROLL_THRESHOLD } from "./profile-header";

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

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

type ProfileContentAnimatedProps = {
  username: string;
  avatarSeed?: string;
  avatarUrl?: string;
  walletAddress: string;
  balance: number;
  reserve: number;
  accountAgeDays: number;
  gradientColors: readonly string[];
  scrollY?: SharedValue<number>;
  onFollowersPress?: () => void;
  isLoading?: boolean;
  headerHeight?: number;
};

export const ProfileContentAnimated = memo(function ProfileContentAnimated({
  username,
  avatarSeed,
  avatarUrl,
  walletAddress,
  balance,
  headerHeight = 0,
  reserve,
  accountAgeDays,
  gradientColors,
  scrollY,
  onFollowersPress,
  isLoading = false,
}: ProfileContentAnimatedProps) {
 const [copied, setCopied] = useState(false);
 const walletScale = useRef(new RNAnimated.Value(1)).current;
  const followingScale = useRef(new RNAnimated.Value(1)).current;

 const gradientAnimation = useSharedValue(0);

  useEffect(() => {
    gradientAnimation.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [gradientAnimation]);

  const gradientAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(gradientAnimation.value, [0, 1], [0, -20]);
    const scale = interpolate(
      gradientAnimation.value,
      [0, 0.5, 1],
      [1, 1.05, 1],
    );
    return {
      transform: [{ translateY }, { scale }],
    };
  });

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

  const handleFollowingPressIn = useCallback(() => {
    RNAnimated.spring(followingScale, {
      toValue: 0.92,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [followingScale]);

  const handleFollowingPressOut = useCallback(() => {
    RNAnimated.spring(followingScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [followingScale]);

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

  const gradientColorsArray = useMemo(
    () => [...gradientColors] as [string, string, ...string[]],
    [gradientColors],
  );

  return (
    <View style={[styles.container, headerHeight > 0 && { marginTop: -headerHeight, paddingTop: headerHeight }]}>
      <View style={[styles.overscrollFill, { backgroundColor: gradientColorsArray[0] }]} />
      <View style={styles.gradientWrapper}>
        <AnimatedLinearGradient
          colors={gradientColorsArray}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.gradientContent, gradientAnimatedStyle]}
        />
      </View>
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

          <RNAnimated.View style={{ transform: [{ scale: followingScale }], alignSelf: "flex-start" }}>
            <Pressable
              onPress={onFollowersPress}
              onPressIn={handleFollowingPressIn}
              onPressOut={handleFollowingPressOut}
            >
              <Box direction="row" alignItems="center" mt="xs">
                <Text size="md" weight="medium" style={styles.whiteText}>
                  following
                </Text>
                <Icon
                  icon={Ionicons}
                  name="chevron-forward"
                  size={14}
                  color="rgba(255,255,255,0.8)"
                  style={{ marginLeft: 2 }}
                />
              </Box>
            </Pressable>
          </RNAnimated.View>

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
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
  },
  gradientContent: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "120%",
  },
  overscrollFill: {
    position: "absolute",
    top: -1000,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gradientWrapper: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  profileContentInner: {
    paddingBottom: theme.spacing.lg,
  },
  whiteText: {
    color: "#FFFFFF",
  },
  usernameContentSkeleton: {
    width: 120,
    height: 24,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
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
