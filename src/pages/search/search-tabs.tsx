import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import type { SearchTab } from "./search-utils";

type SearchTabsProps = {
  visible: boolean;
  activeTab: SearchTab;
  postsCount: number;
  topicsCount: number;
  usersCount: number;
  backgroundColor: string;
  borderColor: string;
  primaryColor: string;
  subtleTextColor: string;
  inverseTextColor: string;
  singleTabWidth: number;
  tabIndicatorStyle: object;
  onPressTab: (tab: SearchTab) => void;
};

export function SearchTabs({
  visible,
  activeTab,
  postsCount,
  topicsCount,
  usersCount,
  backgroundColor,
  borderColor,
  primaryColor,
  subtleTextColor,
  inverseTextColor,
  singleTabWidth,
  tabIndicatorStyle,
  onPressTab,
}: SearchTabsProps) {
  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.tabsContainer,
        { backgroundColor, borderBottomColor: borderColor },
      ]}
    >
      <TabButton
        label="Posts"
        active={activeTab === "posts"}
        count={postsCount}
        primaryColor={primaryColor}
        subtleTextColor={subtleTextColor}
        inverseTextColor={inverseTextColor}
        onPress={() => onPressTab("posts")}
      />
      <TabButton
        label="Topics"
        active={activeTab === "topics"}
        count={topicsCount}
        primaryColor={primaryColor}
        subtleTextColor={subtleTextColor}
        inverseTextColor={inverseTextColor}
        onPress={() => onPressTab("topics")}
      />
      <TabButton
        label="Users"
        active={activeTab === "users"}
        count={usersCount}
        primaryColor={primaryColor}
        subtleTextColor={subtleTextColor}
        inverseTextColor={inverseTextColor}
        onPress={() => onPressTab("users")}
      />
      <Animated.View
        style={[
          styles.tabIndicator,
          { width: singleTabWidth, backgroundColor: primaryColor },
          tabIndicatorStyle,
        ]}
      />
    </Animated.View>
  );
}

type TabButtonProps = {
  label: string;
  active: boolean;
  count: number;
  primaryColor: string;
  subtleTextColor: string;
  inverseTextColor: string;
  onPress: () => void;
};

function TabButton({
  label,
  active,
  count,
  primaryColor,
  subtleTextColor,
  inverseTextColor,
  onPress,
}: TabButtonProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
      <Text
        size="md"
        weight={active ? "semibold" : "regular"}
        style={{ color: active ? primaryColor : subtleTextColor }}
      >
        {label}
      </Text>
      {count > 0 ? (
        <View
          style={[
            styles.tabBadge,
            {
              backgroundColor: active ? primaryColor : "transparent",
            },
          ]}
        >
          <Text
            size="xs"
            weight="medium"
            style={{ color: active ? inverseTextColor : subtleTextColor }}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  tabsContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    position: "relative",
  },
  tab: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
  },
}));
