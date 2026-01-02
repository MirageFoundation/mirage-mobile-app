import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { Avatar, IconButton } from "@/src/components/atoms";
import { Box, Divider, Icon, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

// Random gradient colors for profile backgrounds
const GRADIENT_COLORS = [
  "#E85429", // Orange (Mirage brand)
  "#8B5CF6", // Purple
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#EC4899", // Pink
  "#6366F1", // Indigo
  "#14B8A6", // Teal
  "#F97316", // Orange
];

type ProfileHeaderProps = {
  username: string;
  avatarSeed?: string;
  avatarUrl?: string;
  walletAddress: string;
  followersCount: number;
  balance: number;
  reserve: number;
  accountAgeDays: number;
  onBackPress?: () => void;
  onUsernamePress?: () => void;
  onSearchPress?: () => void;
  onSharePress?: () => void;
  onMenuPress?: () => void;
  onEditPress?: () => void;
  onFollowersPress?: () => void;
};

// Format account age to human readable
const formatAccountAge = (days: number): string => {
  if (days < 30) {
    return `${days}d`;
  } else if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months}mo`;
  } else {
    const years = Math.floor(days / 365);
    const remainingMonths = Math.floor((days % 365) / 30);
    if (remainingMonths > 0) {
      return `${years}y ${remainingMonths}mo`;
    }
    return `${years}y`;
  }
};

// Format number with K/M suffix
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
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
  onBackPress,
  onUsernamePress,
  onSearchPress,
  onSharePress,
  onMenuPress,
  onEditPress,
  onFollowersPress,
}: ProfileHeaderProps) => {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const walletScale = useRef(new Animated.Value(1)).current;

  // Generate a consistent random gradient color based on username
  const gradientColor = useMemo(() => {
    if (!username) return GRADIENT_COLORS[0];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return GRADIENT_COLORS[Math.abs(hash) % GRADIENT_COLORS.length];
  }, [username]);

  // Truncate wallet address
  const truncatedAddress = useMemo(() => {
    if (!walletAddress) return "";
    if (walletAddress.length <= 13) return walletAddress;
    return `${walletAddress.slice(0, 6)}............${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  // Reset copied state
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
    Animated.spring(walletScale, {
      toValue: 0.95,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [walletScale]);

  const handleWalletPressOut = useCallback(() => {
    Animated.spring(walletScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [walletScale]);

  return (
    <Box style={styles.container}>
      {/* Gradient Background */}
      <LinearGradient
        colors={[gradientColor, "#000000"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.gradient, { paddingTop: insets.top }]}
      >
        {/* Header Row */}
        <Box direction="row" center px="md" py="sm" style={styles.header}>
          {/* Left Side - Back + Username */}
          <Box direction="row" center gap="xs">
            <IconButton
              name="arrow-back"
              size="md"
              color="#FFFFFF"
              onPress={onBackPress}
              style={styles.iconButton}
            />

            <Pressable onPress={onUsernamePress} hitSlop={4}>
              <Box
                direction="row"
                center
                gap="xs"
                style={styles.usernameButton}
              >
                <Text size="md" weight="semibold" style={styles.whiteText}>
                  {username}
                </Text>
                <Icon
                  icon={Ionicons}
                  name="chevron-down"
                  size={16}
                  color="rgba(255,255,255,0.9)"
                />
              </Box>
            </Pressable>
          </Box>

          {/* Right Side - Icons */}
          <Box direction="row" center gap="xs">
            <IconButton
              name="search-outline"
              size="md"
              color="#FFFFFF"
              onPress={onSearchPress}
              style={styles.iconButton}
            />
            <IconButton
              name="share-outline"
              size="md"
              color="#FFFFFF"
              onPress={onSharePress}
              style={styles.iconButton}
            />
            <IconButton
              name="ellipsis-horizontal"
              size="md"
              color="#FFFFFF"
              onPress={onMenuPress}
              style={styles.iconButton}
            />
          </Box>
        </Box>

        {/* Profile Content */}
        <Box px="lg" pt="md">
          {/* Large Avatar */}
          <Avatar
            size={80}
            seed={avatarSeed || username}
            source={avatarUrl ? { uri: avatarUrl } : undefined}
            rounded="full"
            bordered
          />

          {/* Username + Edit Row */}
          <Box direction="row" mt="md">
            <Text size="xl" weight="bold" style={styles.whiteText}>
              {username}
            </Text>
            <Pressable onPress={onEditPress}>
              <Box
                direction="row"
                center
                gap="xs"
                py="xs"
                style={styles.editButton}
              >
                <Icon
                  icon={Ionicons}
                  name="pencil-outline"
                  size={14}
                  color="#FFFFFF"
                />
                <Text size="sm" weight="medium" style={styles.whiteText}>
                  Edit
                </Text>
              </Box>
            </Pressable>
          </Box>

          {/* @username • Followers Row */}
          <Pressable onPress={onFollowersPress}>
            <Box direction="row" alignItems="center" mt="xs">
              <Text size="sm" style={styles.subtleWhiteText}>
                @{username}
              </Text>
              <Box style={styles.dot} />
              <Text size="sm" weight="bold" style={styles.whiteText}>
                {formatNumber(followersCount)}
              </Text>
              <Text size="sm" style={styles.whiteText}>
                {" "}
                followers
              </Text>
              <Icon
                icon={Ionicons}
                name="chevron-forward"
                size={14}
                color="#fff"
                style={{ marginLeft: 2 }}
              />
            </Box>
          </Pressable>

          {/* Wallet Address + Copy */}
          <Animated.View
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
          </Animated.View>

          {/* Stats Row */}
          <Box
            direction="row"
            center
            mt="lg"
            py="md"
            px="sm"
            rounded="lg"
            style={styles.statsContainer}
          >
            {/* Balance */}
            <Box flex center>
              <Text size="lg" weight="bold" style={styles.whiteText}>
                {formatNumber(balance)}
              </Text>
              <Text size="xs" style={styles.statLabel}>
                Balance
              </Text>
            </Box>

            <Divider direction="vertical" style={styles.statDivider} />

            {/* Reserve */}
            <Box flex center>
              <Text size="lg" weight="bold" style={styles.whiteText}>
                {formatNumber(reserve)}
              </Text>
              <Text size="xs" style={styles.statLabel}>
                Reserve
              </Text>
            </Box>

            <Divider direction="vertical" style={styles.statDivider} />

            {/* Account Age */}
            <Box flex center>
              <Text size="lg" weight="bold" style={styles.whiteText}>
                {formatAccountAge(accountAgeDays)}
              </Text>
              <Text size="xs" style={styles.statLabel}>
                Account Age
              </Text>
            </Box>
          </Box>
        </Box>
      </LinearGradient>
    </Box>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
  },
  gradient: {
    width: "100%",
    paddingBottom: theme.spacing.lg,
  },
  header: {
    justifyContent: "space-between",
  },
  iconButton: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: theme.radius.full,
  },
  usernameButton: {
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  whiteText: {
    color: "#FFFFFF",
  },
  editButton: {
    marginLeft: theme.spacing.md,
  },
  subtleWhiteText: {
    color: "rgba(255,255,255,0.7)",
  },
  spaceBetween: {},
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
}));
