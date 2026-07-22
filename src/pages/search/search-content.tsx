import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { SearchResultsSections } from "./search-results-sections";
import { styles } from "./search-styles";
import { SCREEN_WIDTH, type SearchTab } from "./search-utils";
import { useSearchController } from "./use-search-controller";

const tabs: { key: SearchTab; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "topics", label: "Topics" },
  { key: "users", label: "Users" },
];

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const controller = useSearchController();

  return (
    <Box flex background="base">
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={controller.handleBack}
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

        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.colors.background.lighter,
              borderColor: controller.isFocused
                ? theme.colors.primary[500]
                : theme.colors.border.subtle,
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={20}
            color={theme.colors.text.subtle}
            style={styles.searchIcon}
          />
          <TextInput
            ref={controller.inputRef}
            accessibilityLabel="Search posts, topics, and users"
            value={controller.searchQuery}
            onChangeText={controller.handleQueryChange}
            onFocus={() => controller.setIsFocused(true)}
            onBlur={() => controller.setIsFocused(false)}
            onSubmitEditing={controller.handleSubmitEditing}
            placeholder="Search posts, topics, users..."
            placeholderTextColor={theme.colors.text.subtle}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.colors.text.default }]}
          />
          {controller.isSearching && (
            <Animated.View entering={FadeIn.duration(100)}>
              <ActivityIndicator
                size="small"
                color={theme.colors.primary[500]}
                style={{ marginRight: 4 }}
              />
            </Animated.View>
          )}
          {controller.hasSearchQuery && !controller.isSearching && (
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(150)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={controller.handleClearInput}
                style={({ pressed }) => [
                  styles.clearInputButton,
                  pressed && { opacity: 0.5 },
                ]}
              >
                <View
                  style={[
                    styles.clearInputIcon,
                    { backgroundColor: theme.colors.text.subtle },
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={12}
                    color={theme.colors.background.default}
                  />
                </View>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>

      {controller.showResults && (
        <Animated.View
          entering={FadeIn.duration(200)}
          accessibilityRole="tablist"
          style={[
            styles.tabsContainer,
            {
              backgroundColor: theme.colors.background.default,
              borderBottomColor: theme.colors.border.subtle,
            },
          ]}
        >
          {tabs.map(({ key, label }) => {
            const isActive = controller.activeTab === key;
            const count = controller.tabCounts[key];

            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${label}${count > 0 ? `, ${count}` : ""}`}
                onPress={() => controller.handleTabPress(key)}
                style={({ pressed }) => [
                  styles.tab,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  size="md"
                  weight={isActive ? "semibold" : "regular"}
                  style={{
                    color: isActive
                      ? theme.colors.primary[500]
                      : theme.colors.text.subtle,
                  }}
                >
                  {label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.tabBadge,
                      {
                        backgroundColor: isActive
                          ? theme.colors.primary[500]
                          : theme.colors.background.subtle,
                      },
                    ]}
                  >
                    <Text
                      size="xs"
                      weight="medium"
                      style={{
                        color: isActive
                          ? theme.colors.background.default
                          : theme.colors.text.subtle,
                      }}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
          <Animated.View
            style={[
              styles.tabIndicator,
              {
                width: SCREEN_WIDTH / 3,
                backgroundColor: theme.colors.primary[500],
              },
              controller.tabIndicatorStyle,
            ]}
          />
        </Animated.View>
      )}

      <SearchResultsSections
        controller={controller}
        bottomInset={insets.bottom}
      />
    </Box>
  );
}
