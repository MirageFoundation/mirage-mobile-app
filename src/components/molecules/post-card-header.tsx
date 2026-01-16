import { Avatar, FollowButton, TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { PostAuthor } from "./post-card-types";

type PostCardHeaderProps = {
  author: PostAuthor;
  topic?: string;
  createdAt: Date | string | number;
  isOwnPost: boolean;
  isFollowing?: boolean;
  followLoading?: boolean;
  onAuthorPress?: () => void;
  onFollowPress?: () => void;
  onMorePress?: () => void;
};

export const PostCardHeader = memo(function PostCardHeader({
  author,
  topic,
  createdAt,
  isOwnPost,
  isFollowing,
  followLoading,
  onAuthorPress,
  onFollowPress,
  onMorePress,
}: PostCardHeaderProps) {
  const { theme } = useUnistyles();

  const handleAuthorPress = useCallback(() => {
    triggerHaptic("selection");
    onAuthorPress?.();
  }, [onAuthorPress]);

  const handleMorePress = useCallback(() => {
    triggerHaptic("selection");
    onMorePress?.();
  }, [onMorePress]);

  return (
    <View style={styles.header}>
      <Pressable onPress={handleAuthorPress} style={styles.authorSection}>
        <Avatar
          size="sm"
          seed={author.avatarSeed ?? author.username}
          source={author.avatarUrl ? { uri: author.avatarUrl } : undefined}
          bordered
        />
        <View style={styles.authorInfo}>
          <View style={styles.authorRow}>
            <Text size="sm" weight="semibold" numberOfLines={1}>
              @{author.username}
            </Text>
            {topic && (
              <>
                <Text size="xs" mode="subtle">
                  •
                </Text>
                <View
                  style={[
                    styles.topicTag,
                    { backgroundColor: theme.colors.primary[500] + "15" },
                  ]}
                >
                  <Text
                    size="xs"
                    weight="medium"
                    style={{ color: theme.colors.primary[500] }}
                    numberOfLines={1}
                  >
                    #{topic}
                  </Text>
                </View>
              </>
            )}
            <TimeAgo timestamp={createdAt} showSuffix={false} size="xs" />
          </View>
        </View>
      </Pressable>

      <View style={styles.headerActions}>
        {!isOwnPost && (
          <FollowButton
            isFollowing={isFollowing ?? false}
            onPress={onFollowPress}
            loading={followLoading}
            size="sm"
          />
        )}
        <Pressable
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={handleMorePress}
          style={styles.moreButton}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={18}
            color={theme.colors.text.default}
          />
        </Pressable>
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
  authorInfo: {
    flex: 1,
    marginLeft: theme.spacing.xs,
    justifyContent: "center",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    flexWrap: "wrap",
  },
  topicTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    maxWidth: 100,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  moreButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
}));
