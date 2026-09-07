import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleProp, View, ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Avatar } from "@/src/components/atoms";
import { Divider, Text } from "@/src/components/ui/primitives";
import { styles, SHOW_MORE_HITSLOP } from "./side-menu-styles";

export function MenuItem({
  iconName,
  title,
  onPress,
  subtitle,
}: {
  iconName: string;
  title: string;
  onPress?: () => void;
  subtitle?: string;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.menuIconContainer, { backgroundColor: theme.colors.background.subtle }]}>
        <Ionicons name={iconName as never} size={20} color={theme.colors.text.default} />
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={{ color: theme.colors.text.default }} size="md" weight="medium">
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.text.subtle }} size="sm" weight="light">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.text.subtle} />
    </Pressable>
  );
}

export function SectionHeader({ title, onShowMore }: { title: string; onShowMore?: () => void }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={{ color: theme.colors.text.subtle }} size="sm" weight="semibold">
        {title.toUpperCase()}
      </Text>
      {onShowMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show more ${title.toLowerCase()}`}
          onPress={onShowMore}
          hitSlop={SHOW_MORE_HITSLOP}
          style={({ pressed }) => [styles.showMoreButton, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: theme.colors.primary[500] }} size="sm" weight="semibold">
            Show More
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionFooter({ style = {} }: { style?: StyleProp<ViewStyle> }) {
  return <Divider direction="horizontal" size="extraThin" color="subtle" style={[styles.sectionFooter, style]} />;
}

export function FollowedUsersSection({
  users,
  usernameMap,
  loading,
  canShowMore,
  onShowMore,
  onUserPress,
}: {
  users: string[];
  usernameMap?: Record<string, string>;
  loading: boolean;
  canShowMore: boolean;
  onShowMore: () => void;
  onUserPress: (address: string) => void;
}) {
  const { theme } = useUnistyles();
  return (
    <>
      <SectionHeader title="Followed Users" onShowMore={canShowMore ? onShowMore : undefined} />
      {loading ? (
        <View style={styles.loadingContainer}><ActivityIndicator size="small" color={theme.colors.text.subtle} /></View>
      ) : users.length ? (
        users.map((address) => {
          const username = usernameMap?.[address.toLowerCase()];
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${username || address}`}
              key={address}
              onPress={() => onUserPress(address)}
              style={({ pressed }) => [styles.userListItem, pressed && { opacity: 0.7 }]}
            >
              <Avatar size="sm" seed={address} rounded="sm" />
              <Text style={{ color: theme.colors.text.default, flex: 1, marginLeft: 10 }} size="md" weight="medium" numberOfLines={1}>
                {username || `${address.slice(0, 10)}...`}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.text.subtle} />
            </Pressable>
          );
        })
      ) : (
        <Text style={{ color: theme.colors.text.subtle, paddingVertical: 8 }} size="sm">Not following anyone yet</Text>
      )}
      <SectionFooter />
    </>
  );
}

export function JoinedCommunitiesSection({
  topics,
  loading,
  canShowMore,
  onShowMore,
  onCommunityPress,
}: {
  topics: string[];
  loading: boolean;
  canShowMore: boolean;
  onShowMore: () => void;
  onCommunityPress: (topic: string) => void;
}) {
  const { theme } = useUnistyles();
  return (
    <>
      <SectionHeader title="Joined Communities" onShowMore={canShowMore ? onShowMore : undefined} />
      {loading ? (
        <View style={styles.loadingContainer}><ActivityIndicator size="small" color={theme.colors.text.subtle} /></View>
      ) : topics.length ? (
        topics.map((topic) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View community ${topic}`}
            key={topic}
            onPress={() => onCommunityPress(topic)}
            style={({ pressed }) => [styles.topicListItem, pressed && { opacity: 0.7 }]}
          >
            <Text style={{ color: theme.colors.text.default, flex: 1 }} size="md" weight="medium" numberOfLines={1}>[{topic}]</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text.subtle} />
          </Pressable>
        ))
      ) : (
        <Text style={{ color: theme.colors.text.subtle, paddingVertical: 8 }} size="sm">No joined communities yet</Text>
      )}
      <SectionFooter />
    </>
  );
}

export function LogoutMenuItem({ onPress }: { onPress: () => void }) {
  const { theme } = useUnistyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Log Out" onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}>
      <View style={[styles.menuIconContainer, { backgroundColor: "rgba(255, 59, 48, 0.15)" }]}>
        <Ionicons name="log-out-outline" size={20} color={theme.colors.error[500]} />
      </View>
      <View style={styles.menuTextContainer}><Text style={{ color: theme.colors.error[500] }} size="md" weight="medium">Log Out</Text></View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.error[500]} />
    </Pressable>
  );
}
