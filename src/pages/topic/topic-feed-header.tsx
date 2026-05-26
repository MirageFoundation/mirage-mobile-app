import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./topic-feed-styles";

type SortBy = "magic" | "newest";

type SortOption = {
  label: string;
  value: SortBy;
};

type TopicFeedHeaderProps = {
  insetsTop: number;
  isTopicFollowed: boolean;
  onBack: () => void;
  onFollowTopic: () => void;
  onSortChange: (value: SortBy) => void;
  sortBy: SortBy;
  sortOptions: SortOption[];
  topicName?: string;
};

export function TopicFeedHeader({
  insetsTop,
  isTopicFollowed,
  onBack,
  onFollowTopic,
  onSortChange,
  sortBy,
  sortOptions,
  topicName,
}: TopicFeedHeaderProps) {
  const { theme } = useUnistyles();

  return (
      <View
        style={[
          styles.headerContainer,
          {
            paddingTop: insetsTop,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={() => onBack()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.text.default}
          />
        </Pressable>
        <Menu style={styles.headerTitleMenu}>
          <MenuTrigger
            customStyles={{
              triggerTouchable: {
                hitSlop: { top: 8, bottom: 8, left: 4, right: 4 },
              },
            }}
          >
            <View style={styles.titleButton}>
              <Text
                size="xl"
                weight="bold"
                numberOfLines={1}
                style={{ flexShrink: 1 }}
              >
                #{topicName}
              </Text>
              <Text
                size="xl"
                weight="medium"
                style={{
                  color: theme.colors.text.subtle,
                  marginLeft: 6,
                }}
              >
                ǀ {sortOptions.find((o) => o.value === sortBy)?.label}
              </Text>
              <Ionicons
                name="chevron-down"
                size={14}
                color={theme.colors.text.subtle}
                style={{ marginLeft: 2, marginTop: 4 }}
              />
            </View>
          </MenuTrigger>
          <MenuOptions
            customStyles={{
              optionsContainer: {
                backgroundColor: theme.colors.background.default,
                borderRadius: theme.radius.lg,
                minWidth: 160,
                shadowColor: theme.colors.contrast.base,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
                borderWidth: 1,
                borderColor: theme.colors.border.subtle,
                marginTop: 4,
                paddingVertical: 4,
              },
            }}
          >
            {sortOptions.map((option, index) => {
              const isActive = option.value === sortBy;
              return (
                <View key={option.value}>
                  {index > 0 && (
                    <View
                      style={{
                        height: 1,
                        backgroundColor: theme.colors.border.subtle,
                        marginHorizontal: theme.spacing.md,
                        marginVertical: 2,
                      }}
                    />
                  )}
                  <MenuOption onSelect={() => onSortChange(option.value)}>
                    <View style={styles.menuOption}>
                      <Ionicons
                        name={isActive ? "checkmark-circle" : "ellipse-outline"}
                        size={16}
                        color={
                          isActive
                            ? theme.colors.primary[500]
                            : theme.colors.text.subtle
                        }
                      />
                      <Text
                        size="md"
                        weight={isActive ? "semibold" : "medium"}
                        style={
                          isActive
                            ? { color: theme.colors.primary[500] }
                            : undefined
                        }
                      >
                        {option.label}
                      </Text>
                    </View>
                  </MenuOption>
                </View>
              );
            })}
          </MenuOptions>
        </Menu>
        <Pressable
          onPress={onFollowTopic}
          style={[
            styles.headerFollowButton,
            {
              backgroundColor: isTopicFollowed
                ? "transparent"
                : theme.colors.primary[500],
              borderColor: isTopicFollowed
                ? theme.colors.border.default
                : theme.colors.primary[500],
              paddingVertical: 2,
              // height: isTopicFollowed ? 28 : 24,
            },
          ]}
        >
          <Text
            size="md"
            weight="bold"
            style={{
              color: isTopicFollowed
                ? theme.colors.text.default
                : theme.colors.background.default,
            }}
          >
            {isTopicFollowed ? "Following" : "Follow"}
          </Text>
        </Pressable>
      </View>
  );
}
