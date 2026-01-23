import { TimeAgo } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
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
  /** Whether to show the follow button (default: true) */
  showFollowButton?: boolean;
  onAuthorPress?: () => void;
  onFollowUser?: () => void;
  onFollowTopic?: () => void;
  onMorePress?: () => void;
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
  onFollowUser,
  onFollowTopic,
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
         {topic && (
           <Text size="md" weight="bold" numberOfLines={1}>
             #{topic}
           </Text>
         )}
         {topic && (
           <Text size="sm" style={{ color: "rgb(144,161,171)" }}>
             •
           </Text>
         )}
         <TimeAgo
           timestamp={createdAt}
           showSuffix={false}
           size="sm"
           style={{ color: "rgb(144,161,171)" }}
         />
         <Text size="sm" style={{ color: "rgb(144,161,171)" }}>
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
              style={{ color: "rgb(144,161,171)" }}
            >
              @{author.username.toLowerCase()}
            </Text>
          </Pressable>
       </View>
      </View>

      <View style={styles.headerActions}>
        {!isOwnPost && showFollowButton && (
          <Menu>
            <MenuTrigger
              customStyles={{
                triggerOuterWrapper: { padding: 4 },
                triggerTouchable: { hitSlop: { top: 12, bottom: 12, left: 12, right: 12 } },
              }}
            >
              <View
                style={[
                  styles.followButton,
                  {
                    backgroundColor: theme.colors.primary[500],
                    borderColor: theme.colors.primary[500],
                  },
                ]}
              >
                <Text
                  size="xs"
                  weight="semibold"
                  style={{ color: theme.colors.background.default }}
                >
                  Follow
                </Text>
              </View>
            </MenuTrigger>
            <MenuOptions
              customStyles={{
                optionsContainer: {
                  backgroundColor: theme.colors.background.default,
                  borderRadius: theme.radius.lg,
                  minWidth: 180,
                  shadowColor: theme.colors.contrast.base,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 12,
                  elevation: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border.subtle,
                  marginTop: 4,
                  paddingVertical:8
                },
              }}
            >
              {/* Follow/Unfollow Topic Option */}
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
                      size="sm"
                      weight={isTopicFollowed ? "semibold" : "medium"}
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

              {/* Follow/Unfollow User Option */}
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
                    size="sm"
                    weight={isFollowing ? "semibold" : "medium"}
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
        <Pressable
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
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
    gap: theme.spacing.sm,
  },
  followButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    minWidth: 54,
    height: 28,
    paddingHorizontal: 10,
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
  },
}));
