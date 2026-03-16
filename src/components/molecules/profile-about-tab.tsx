import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { TIER_NAMES } from "@/src/utils/tiers";

import {
  usePreferences,
  usePreferencesByAddress,
  useSimilarUsers,
  useSimilarUsersByAddress,
  useUserBlocked,
  useProfile,
  useProfileByAddress,
  useUserStatus,
  useUserStatusByAddress,
  useUsernameFromAddress,
} from "@/src/api/read";
import type {
  PreferencesResponse,
  SimilarUser,
  ProfileResponse,
  UserStatusResponse,
} from "@/src/api/types";
import { Avatar } from "@/src/components/atoms";
import { Box, Divider, Icon, Text } from "@/src/components/ui/primitives";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { useAuthStore } from "@/src/stores";

const emptyInfoImage = require("@/assets/images/empty-info.png");

const INITIAL_VISIBLE = 5;

const formatWeight = (weight: number): string => {
  if (weight >= 100) return weight.toFixed(0);
  if (weight >= 10) return weight.toFixed(1);
  return weight.toFixed(2);
};

const formatSimilarity = (similarity: number): string => {
  return `${(similarity * 100).toFixed(0)}%`;
};

const formatAccountAge = (days: number): string => {
  if (days < 1) {
    const hours = Math.floor(days * 24);
    if (hours < 1) return "< 1 hour";
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  if (days < 30) {
    const d = Math.floor(days);
    return `${d} day${d !== 1 ? "s" : ""}`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months !== 1 ? "s" : ""}`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? "s" : ""}`;
};

const formatBalance = (umirage: number): string => {
  const mirage = umirage / 1_000_000;
  if (mirage >= 1_000_000) return `${(mirage / 1_000_000).toFixed(1)}M`;
  if (mirage >= 1_000) return `${(mirage / 1_000).toFixed(1)}K`;
  return mirage.toFixed(0);
};

function SkeletonBox({
  width,
  height,
  borderRadius,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  const { theme } = useUnistyles();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: theme.colors.background.subtle,
          borderRadius: borderRadius ?? 8,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

function SectionSkeleton() {
  return (
    <View style={styles.section}>
      <SkeletonBox width={120} height={18} />
      <View style={{ marginTop: 12, gap: 10 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View
            key={i}
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <SkeletonBox width={36} height={36} borderRadius={18} />
            <View style={{ flex: 1, gap: 4 }}>
              <SkeletonBox width={100} height={14} />
              <SkeletonBox width={60} height={12} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function AboutSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <SkeletonBox width={140} height={18} />
        <View style={{ marginTop: 12, gap: 12 }}>
          <View style={styles.detailRow}>
            <SkeletonBox width={80} height={14} />
            <SkeletonBox width={60} height={14} />
          </View>
          <View style={styles.detailRow}>
            <SkeletonBox width={100} height={14} />
            <SkeletonBox width={40} height={14} />
          </View>
          <View style={styles.detailRow}>
            <SkeletonBox width={90} height={14} />
            <SkeletonBox width={70} height={14} />
          </View>
        </View>
      </View>
      <SectionSkeleton />
      <SectionSkeleton />
      <SectionSkeleton />
    </View>
  );
}

function EmptySection({ message }: { message: string }) {
  const { theme } = useUnistyles();
  return (
    <View
      style={[
        styles.emptySection,
        { backgroundColor: theme.colors.background.subtle },
      ]}
    >
      <Text size="md" mode="subtle" style={{ textAlign: "center" }}>
        {message}
      </Text>
    </View>
  );
}

function ExpandableSection({
  title,
  count,
  children,
  initialVisible = INITIAL_VISIBLE,
  totalCount,
}: {
  title: string;
  count: number;
  children: (visibleCount: number) => React.ReactNode;
  initialVisible?: number;
  totalCount: number;
}) {
  const { theme } = useUnistyles();
  const [expanded, setExpanded] = useState(false);
  const visibleCount = expanded
    ? totalCount
    : Math.min(initialVisible, totalCount);
  const hasMore = totalCount > initialVisible;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text
          size="lg"
          weight="bold"
          style={{ color: theme.colors.text.default }}
        >
          {title}
        </Text>
        <View
          style={[
            styles.countBadge,
            { backgroundColor: theme.colors.background.subtle },
          ]}
        >
          <Text
            size="sm"
            weight="bold"
            style={{ color: theme.colors.text.subtle }}
          >
            {count}
          </Text>
        </View>
      </View>
      {children(visibleCount)}
      {hasMore && (
        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={styles.showMoreButton}
        >
          <Text size="md" weight="medium" style={{ color: theme.colors.brand[500] }}>
            {expanded ? "Show Less" : `Show All (${totalCount})`}
          </Text>
          <Icon
            icon={Ionicons}
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.colors.brand[500]}
          />
        </Pressable>
      )}
    </View>
  );
}

function TopicPreferenceItem({
  topic,
  weight,
  rank,
}: {
  topic: string;
  weight: number;
  rank: number;
}) {
  const { theme } = useUnistyles();
  const router = useRouter();
  const maxBarWidth = 120;
  const normalizedWidth = Math.min(Math.max(weight / 10, 0.1), 1) * maxBarWidth;

  return (
    <Pressable
      onPress={() => router.push(`/topic/${encodeURIComponent(topic)}`)}
      style={[
        styles.preferenceRow,
        { borderBottomColor: theme.colors.border.subtle },
      ]}
    >
      <View style={styles.preferenceRank}>
        <Text size="sm" mode="subtle" weight="medium">
          {rank}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          size="md"
          weight="medium"
          style={{ color: theme.colors.text.default }}
        >
          # {topic}
        </Text>
      </View>
      <View style={styles.weightContainer}>
        <View
          style={[
            styles.weightBar,
            {
              width: normalizedWidth,
              backgroundColor: `${theme.colors.brand[500]}B3`,
            },
          ]}
        />
        <Text
          size="sm"
          mode="subtle"
          weight="medium"
          style={{ minWidth: 40, textAlign: "right" }}
        >
          {formatWeight(weight)}
        </Text>
      </View>
    </Pressable>
  );
}

function AuthorPreferenceItem({
  user,
  weight,
  rank,
}: {
  user: string;
  weight: number;
  rank: number;
}) {
  const { theme } = useUnistyles();
  const router = useRouter();
  const { data: usernameData } = useUsernameFromAddress(user);
  const displayName =
    usernameData?.username ??
    (user.length > 16 ? `${user.slice(0, 8)}...${user.slice(-4)}` : user);
  const maxBarWidth = 120;
  const normalizedWidth = Math.min(Math.max(weight / 10, 0.1), 1) * maxBarWidth;

  return (
    <Pressable
      onPress={() => router.push(`/user/${user}`)}
      style={[
        styles.preferenceRow,
        { borderBottomColor: theme.colors.border.subtle },
      ]}
    >
      <View style={styles.preferenceRank}>
        <Text size="sm" mode="subtle" weight="medium">
          {rank}
        </Text>
      </View>
      <Avatar size="sm" seed={user} rounded="full" />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text
          size="md"
          weight="medium"
          style={{ color: theme.colors.text.default }}
          numberOfLines={1}
        >
          {displayName}
        </Text>
      </View>
      <View style={styles.weightContainer}>
        <View
          style={[
            styles.weightBar,
            {
              width: normalizedWidth,
              backgroundColor: `${theme.colors.brand[500]}B3`,
            },
          ]}
        />
        <Text
          size="sm"
          mode="subtle"
          weight="medium"
          style={{ minWidth: 40, textAlign: "right" }}
        >
          {formatWeight(weight)}
        </Text>
      </View>
    </Pressable>
  );
}

function SimilarUserItem({ user }: { user: SimilarUser }) {
  const { theme } = useUnistyles();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/user/${user.address}`)}
      style={[
        styles.similarUserRow,
        { borderBottomColor: theme.colors.border.subtle },
      ]}
    >
      <Avatar size="sm" seed={user.address} rounded="full" />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          size="md"
          weight="medium"
          style={{ color: theme.colors.text.default }}
          numberOfLines={1}
        >
          {user.username ||
            `${user.address.slice(0, 8)}...${user.address.slice(-4)}`}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
          <Text size="sm" mode="subtle">
            {formatSimilarity(user.similarity)} match
          </Text>
          <Text size="sm" mode="subtle">
            •
          </Text>
          <Text size="sm" mode="subtle">
            {user.shared_dimensions} shared
          </Text>
        </View>
      </View>
      <Icon
        icon={Ionicons}
        name="chevron-forward"
        size={16}
        color={theme.colors.text.subtle}
      />
    </Pressable>
  );
}

function ProfileDetailsSection({
  profile,
  userStatus,
  isLoading,
}: {
  profile: ProfileResponse | undefined;
  userStatus: UserStatusResponse | undefined;
  isLoading: boolean;
}) {
  const { theme } = useUnistyles();

  if (isLoading) {
    return (
      <View style={styles.section}>
        <SkeletonBox width={120} height={18} />
        <View style={{ marginTop: 12, gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.detailRow}>
              <SkeletonBox width={100} height={14} />
              <SkeletonBox width={60} height={14} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!profile && !userStatus) return null;

  const createdAt = profile?.created_at ?? userStatus?.profile_registered_at;
  const accountAgeDays = createdAt
    ? (Date.now() / 1000 - createdAt) / (60 * 60 * 24)
    : 0;
  const tierName =
    TIER_NAMES[userStatus?.user_level ?? profile?.level ?? 0] ?? "Free";
  const balance = userStatus?.balance ?? 0;
  const reserve = userStatus?.reserve_funds ?? profile?.reserve_funds ?? 0;
  const subscriptionExpiry =
    profile?.subscription_expiry ?? userStatus?.subscription_expiry ?? 0;
  const autoRenew = profile?.auto_renew ?? userStatus?.auto_renew ?? false;
  const biography = profile?.biography ?? "";
  const followedUsers = profile?.followed_users?.length ?? 0;
  const followedTopics = profile?.followed_topics?.length ?? 0;
  const enabledAgents = profile?.enabled_agents?.length ?? 0;

  const details: {
    label: string;
    value: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [];

  if (biography) {
    details.push({
      label: "Bio",
      value: biography,
      icon: "document-text-outline",
    });
  }
  details.push({ label: "Tier", value: tierName, icon: "shield-outline" });
  details.push({
    label: "Balance",
    value: `${formatBalance(balance)} MIRAGE`,
    icon: "wallet-outline",
  });
  details.push({
    label: "Reserve",
    value: `${formatBalance(reserve)} MIRAGE`,
    icon: "lock-closed-outline",
  });
  if (accountAgeDays > 0) {
    details.push({
      label: "Account Age",
      value: formatAccountAge(accountAgeDays),
      icon: "time-outline",
    });
  }
  if (createdAt) {
    details.push({
      label: "Joined",
      value: new Date(createdAt * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      icon: "calendar-outline",
    });
  }
  if (subscriptionExpiry > 0) {
    const isActive = subscriptionExpiry > Date.now() / 1000;
    details.push({
      label: "Subscription",
      value: isActive ? `Active${autoRenew ? " (auto-renew)" : ""}` : "Expired",
      icon: "card-outline",
    });
  }
  details.push({
    label: "Following",
    value: `${followedUsers} users, ${followedTopics} topics`,
    icon: "people-outline",
  });
  if (enabledAgents > 0) {
    details.push({
      label: "Agents",
      value: enabledAgents.toString(),
      icon: "shield-checkmark-outline",
    });
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text
          size="lg"
          weight="bold"
          style={{ color: theme.colors.text.default }}
        >
          Profile Details
        </Text>
      </View>
      {details.map((detail, index) => (
        <View
          key={detail.label}
          style={[
            styles.detailRow,
            index < details.length - 1 && {
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border.subtle,
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              flex: 1,
            }}
          >
            <Icon
              icon={Ionicons}
              name={detail.icon}
              size={18}
              color={theme.colors.text.subtle}
            />
            <Text size="md" mode="subtle">
              {detail.label}
            </Text>
          </View>
          {detail.label === "Bio" ? (
            <View style={{ maxWidth: "55%" }}>
              <MarkdownContent content={detail.value} />
            </View>
          ) : (
            <Text
              size="md"
              weight="medium"
              style={{
                color: theme.colors.text.default,
                maxWidth: "55%",
                textAlign: "right",
              }}
              numberOfLines={2}
            >
              {detail.value}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

type ProfileAboutTabProps = {
  userAddress: string | null | undefined;
  isOwnProfile?: boolean;
  onBlockedPress?: () => void;
};

export function ProfileAboutTab({
  userAddress,
  isOwnProfile = false,
  onBlockedPress,
}: ProfileAboutTabProps) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();

  const { data: ownPreferences, isLoading: isLoadingOwnPrefs } =
    usePreferences();
  const { data: otherPreferences, isLoading: isLoadingOtherPrefs } =
    usePreferencesByAddress(isOwnProfile ? null : userAddress);

  const { data: ownSimilar, isLoading: isLoadingOwnSimilar } =
    useSimilarUsers();
  const { data: otherSimilar, isLoading: isLoadingOtherSimilar } =
    useSimilarUsersByAddress(isOwnProfile ? null : userAddress);

  const { data: ownProfile, isLoading: isLoadingOwnProfile } = useProfile();
  const { data: otherProfile, isLoading: isLoadingOtherProfile } =
    useProfileByAddress(isOwnProfile ? null : userAddress);

  const { data: ownStatus, isLoading: isLoadingOwnStatus } = useUserStatus();
  const { data: otherStatus, isLoading: isLoadingOtherStatus } =
    useUserStatusByAddress(isOwnProfile ? null : userAddress);

  const { data: blockedData } = useUserBlocked();

  const preferences = isOwnProfile ? ownPreferences : otherPreferences;
  const isLoadingPrefs = isOwnProfile ? isLoadingOwnPrefs : isLoadingOtherPrefs;

  const similarUsers = isOwnProfile ? ownSimilar : otherSimilar;
  const isLoadingSimilar = isOwnProfile
    ? isLoadingOwnSimilar
    : isLoadingOtherSimilar;

  const profile = isOwnProfile ? ownProfile : otherProfile;
  const isLoadingProfile = isOwnProfile
    ? isLoadingOwnProfile
    : isLoadingOtherProfile;

  const userStatus = isOwnProfile ? ownStatus : otherStatus;
  const isLoadingStatus = isOwnProfile
    ? isLoadingOwnStatus
    : isLoadingOtherStatus;

  const topics = useMemo(
    () => [...(preferences?.topics ?? [])].sort((a, b) => b.weight - a.weight),
    [preferences?.topics],
  );

  const authors = useMemo(
    () => [...(preferences?.authors ?? [])].sort((a, b) => b.weight - a.weight),
    [preferences?.authors],
  );

  const similar = useMemo(
    () =>
      [...(similarUsers?.similar_users ?? [])].sort(
        (a, b) => b.similarity - a.similarity,
      ),
    [similarUsers?.similar_users],
  );

  const blockedUsersCount = blockedData?.blocked_users?.length ?? 0;
  const blockedPostsCount = blockedData?.blocked_posts?.length ?? 0;
  const blockedTopicsCount = blockedData?.blocked_topics?.length ?? 0;
  const shouldShowPreferenceSkeletons =
    isLoadingPrefs && topics.length === 0 && authors.length === 0;
  const shouldShowSimilarSkeleton =
    isLoadingSimilar && similar.length === 0;

  const isLoading =
    isLoadingPrefs || isLoadingSimilar || isLoadingProfile || isLoadingStatus;

  if (isLoading && !preferences && !similarUsers && !profile && !userStatus) {
    return <AboutSkeleton />;
  }

  const hasAlgoData =
    topics.length > 0 || authors.length > 0 || similar.length > 0;
  const hasBlockedData = blockedUsersCount > 0 || blockedPostsCount > 0 || blockedTopicsCount > 0;
  const hasAnyData = hasAlgoData || profile || userStatus || (isOwnProfile && hasBlockedData);

  if (!hasAnyData && !isLoading) {
    return (
      <View
        style={[styles.emptyContainer, { paddingBottom: insets.bottom + 100 }]}
      >
        <Image
          source={emptyInfoImage}
          style={styles.emptyImage}
          contentFit="contain"
        />
        <Text
          size="xl"
          weight="bold"
          style={{ color: theme.colors.text.default, textAlign: "center" }}
        >
          {isOwnProfile ? "Nothing here yet" : "No information available"}
        </Text>
        <Text
          size="md"
          mode="subtle"
          style={{ marginTop: 8, textAlign: "center", maxWidth: 280 }}
        >
          {isOwnProfile
            ? "Start interacting with posts to build your algorithm profile."
            : "This user hasn't built enough activity for algorithm insights."}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          minHeight: windowHeight,
          paddingBottom: insets.bottom + 40,
        },
      ]}
    >
      {isOwnProfile && (blockedUsersCount > 0 || blockedPostsCount > 0 || blockedTopicsCount > 0) && (
        <Pressable
          onPress={onBlockedPress}
          style={[
            styles.blockedButton,
            { borderBottomColor: theme.colors.border.subtle },
          ]}
        >
          <Icon
            icon={Ionicons}
            name="ban-outline"
            size={18}
            color={theme.colors.text.subtle}
          />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text
              size="md"
              weight="medium"
              style={{ color: theme.colors.text.default }}
            >
              Blocked
            </Text>
            <Text size="sm" mode="subtle">
              {blockedUsersCount} user{blockedUsersCount !== 1 ? "s" : ""},{" "}
              {blockedPostsCount} post{blockedPostsCount !== 1 ? "s" : ""},{" "}
              {blockedTopicsCount} topic{blockedTopicsCount !== 1 ? "s" : ""}
            </Text>
          </View>
          <Icon
            icon={Ionicons}
            name="chevron-forward"
            size={18}
            color={theme.colors.text.subtle}
          />
        </Pressable>
      )}

      {shouldShowPreferenceSkeletons && (
        <>
          <SectionSkeleton />
          <SectionSkeleton />
        </>
      )}

      {topics.length > 0 && (
        <ExpandableSection
          title="Topic Preferences"
          count={topics.length}
          totalCount={topics.length}
        >
          {(visibleCount) => (
            <View>
              {topics.slice(0, visibleCount).map((t, i) => (
                <TopicPreferenceItem
                  key={t.topic}
                  topic={t.topic}
                  weight={t.weight}
                  rank={i + 1}
                />
              ))}
            </View>
          )}
        </ExpandableSection>
      )}

      {authors.length > 0 && (
        <ExpandableSection
          title="User Preferences"
          count={authors.length}
          totalCount={authors.length}
        >
          {(visibleCount) => (
            <View>
              {authors.slice(0, visibleCount).map((a, i) => (
                <AuthorPreferenceItem
                  key={a.user}
                  user={a.user}
                  weight={a.weight}
                  rank={i + 1}
                />
              ))}
            </View>
          )}
        </ExpandableSection>
      )}

      {shouldShowSimilarSkeleton && <SectionSkeleton />}

      {similar.length > 0 && (
        <ExpandableSection
          title="Similar Users"
          count={similar.length}
          totalCount={similar.length}
        >
          {(visibleCount) => (
            <View>
              {similar.slice(0, visibleCount).map((u) => (
                <SimilarUserItem key={u.address} user={u} />
              ))}
            </View>
          )}
        </ExpandableSection>
      )}

      {!hasAlgoData && !isLoadingPrefs && !isLoadingSimilar && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text
              size="lg"
              weight="bold"
              style={{ color: theme.colors.text.default }}
            >
              Algorithm Profile
            </Text>
          </View>
          <EmptySection
            message={
              isOwnProfile
                ? "Interact with posts to build your personalized algorithm."
                : "This user doesn't have enough activity for algorithm data."
            }
          />
        </View>
      )}

      <ProfileDetailsSection
        profile={profile}
        userStatus={userStatus}
        isLoading={isLoadingProfile || isLoadingStatus}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingTop: 8,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  preferenceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 8,
  },
  preferenceRank: {
    width: 24,
    alignItems: "center",
  },
  weightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  weightBar: {
    height: 6,
    borderRadius: 3,
  },
  similarUserRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  showMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 12,
    paddingVertical: 8,
  },
  blockedButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  emptySection: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyImage: {
    width: 180,
    height: 180,
  },
}));
