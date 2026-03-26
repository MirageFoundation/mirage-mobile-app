import { Ionicons } from "@expo/vector-icons";
import { Menu, MenuOption, MenuOptions, MenuTrigger } from "react-native-popup-menu";
import { Pressable, View } from "react-native";

import { Text } from "@/src/components/ui/primitives";

type SortValue = "magic" | "newest";

interface TopicFeedHeaderProps {
  borderBottomColor: string;
  followBackgroundColor: string;
  followBorderColor: string;
  followTextColor: string;
  insetsTop: number;
  isTopicFollowed: boolean;
  onBack: () => void;
  onFollowTopic: () => void;
  onSortChange: (value: SortValue) => void;
  sortBy: SortValue;
  sortLabel: string;
  sortOptions: { label: string; value: SortValue }[];
  textColor: string;
  subtleTextColor: string;
  topicName?: string;
}

export function TopicFeedHeader({
  borderBottomColor,
  followBackgroundColor,
  followBorderColor,
  followTextColor,
  insetsTop,
  isTopicFollowed,
  onBack,
  onFollowTopic,
  onSortChange,
  sortBy,
  sortLabel,
  sortOptions,
  textColor,
  subtleTextColor,
  topicName,
}: TopicFeedHeaderProps) {
  return (
    <View
      style={[
        styles.headerContainer,
        {
          paddingTop: insetsTop,
          backgroundColor: "transparent",
          borderBottomColor,
        },
      ]}
    >
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="arrow-back" size={24} color={textColor} />
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
              style={{ color: subtleTextColor, marginLeft: 6 }}
            >
              ǀ {sortLabel}
            </Text>
            <Ionicons
              name="chevron-down"
              size={14}
              color={subtleTextColor}
              style={{ marginLeft: 2, marginTop: 4 }}
            />
          </View>
        </MenuTrigger>
        <MenuOptions
          customStyles={{
            optionsContainer: {
              backgroundColor: "white",
              borderRadius: 16,
              minWidth: 160,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
              borderWidth: 1,
              borderColor: borderBottomColor,
              marginTop: 4,
              paddingVertical: 4,
            },
          }}
        >
          {sortOptions.map((option, index) => {
            const isActive = option.value === sortBy;
            return (
              <View key={option.value}>
                {index > 0 ? (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: borderBottomColor,
                      marginHorizontal: 16,
                      marginVertical: 2,
                    }}
                  />
                ) : null}
                <MenuOption onSelect={() => onSortChange(option.value)}>
                  <View style={styles.menuOption}>
                    <Ionicons
                      name={isActive ? "checkmark-circle" : "ellipse-outline"}
                      size={16}
                      color={isActive ? "#3B82F6" : subtleTextColor}
                    />
                    <Text
                      size="md"
                      weight={isActive ? "semibold" : "medium"}
                      style={isActive ? { color: "#3B82F6" } : undefined}
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
            backgroundColor: followBackgroundColor,
            borderColor: followBorderColor,
          },
        ]}
      >
        <Text size="md" weight="bold" style={{ color: followTextColor }}>
          {isTopicFollowed ? "Following" : "Follow"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = {
  headerContainer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingBottom: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerTitleMenu: {
    flex: 1,
  },
  titleButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  menuOption: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  headerFollowButton: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 999,
    paddingHorizontal: 12,
    borderWidth: 1,
    marginRight: 4,
    paddingVertical: 2,
  },
};
