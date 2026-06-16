import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

import { styles } from "./media-post-detail-styles";

type FollowMenuButtonProps = {
  username: string;
  topic?: string;
  isFollowing: boolean;
  isTopicFollowed: boolean;
  onFollowUser: () => void;
  onFollowTopic: () => void;
};

export const MediaPostDetailFollowMenuButton = memo(function MediaPostDetailFollowMenuButton({
  username,
  topic,
  isFollowing,
  isTopicFollowed,
  onFollowUser,
  onFollowTopic,
}: FollowMenuButtonProps) {
  const { theme } = useUnistyles();
  const isFollowingAll = topic
    ? !!(isFollowing && isTopicFollowed)
    : !!isFollowing;
  const isFollowingPartial = topic
    ? !!(isFollowing || isTopicFollowed) && !isFollowingAll
    : false;

  const followMenuMinWidth = Math.max(
    180,
    Math.max(
      topic ? `${isTopicFollowed ? "Unfollow" : "Follow"} #${topic}`.length : 0,
      `${isFollowing ? "Unfollow" : "Follow"} @${username}`.length,
    ) *
      10 +
      60,
  );

  return (
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
            style={[
              styles.followBtn,
              { borderColor: theme.colors.border.default },
            ]}
          >
            <Text size="sm" weight="bold" style={{ color: "#000000" }}>
              Follow
            </Text>
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.followBtn,
              {
                backgroundColor: isFollowingAll
                  ? "transparent"
                  : theme.colors.primary[500],
                borderColor: isFollowingAll
                  ? theme.colors.border.default
                  : theme.colors.primary[500],
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
        {topic ? (
          <MenuOption onSelect={onFollowTopic}>
            <View style={styles.followMenuOption}>
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
        ) : null}
        <MenuOption onSelect={onFollowUser}>
          <View style={styles.followMenuOption}>
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
              {isFollowing ? "Unfollow" : "Follow"} @{username}
            </Text>
          </View>
        </MenuOption>
      </MenuOptions>
    </Menu>
  );
});
