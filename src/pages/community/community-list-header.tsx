import { Feather, Ionicons } from "@expo/vector-icons";
import type { RefObject } from "react";
import { ActivityIndicator, Keyboard, Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./community-list-styles";

export function CommunityListHeader({
  insetsTop,
  searchText,
  isSearchLoading,
  searchInputRef,
  headerAnimatedStyle,
  onBack,
  onChangeSearch,
  onClearSearch,
  onCancelSearch,
}: {
  insetsTop: number;
  searchText: string;
  isSearchLoading: boolean;
  searchInputRef: RefObject<TextInput | null>;
  headerAnimatedStyle: object;
  onBack: () => void;
  onChangeSearch: (value: string) => void;
  onClearSearch: () => void;
  onCancelSearch: () => void;
}) {
  const { theme } = useUnistyles();

  return (
    <Animated.View
      style={[
        styles.header,
        {
          paddingTop: insetsTop,
          backgroundColor: theme.colors.background.default,
          borderBottomColor: theme.colors.border.subtle,
        },
        headerAnimatedStyle,
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.text.default}
          />
        </Pressable>
        <Text size="xl" weight="bold" style={{ marginLeft: 16 }}>
          Communities
        </Text>
      </View>
      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchInputWrapper,
            { backgroundColor: theme.colors.background.light },
          ]}
        >
          <Feather
            name="search"
            size={20}
            color={theme.colors.text.subtle}
            style={{ marginRight: 6 }}
          />
          <TextInput
            ref={searchInputRef}
            style={[
              styles.searchInput,
              {
                color: theme.colors.text.default,
                fontWeight: "600",
                fontSize: theme.typography.size.lg,
              },
            ]}
            placeholder="Search for a community"
            placeholderTextColor={theme.colors.text.subtle}
            value={searchText}
            onChangeText={onChangeSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(150)}
            >
              {isSearchLoading ? (
                <View style={styles.clearButton}>
                  <ActivityIndicator size="small" color={theme.colors.text.subtle} />
                </View>
              ) : (
                <Pressable onPress={onClearSearch} style={styles.clearButton}>
                  <Feather
                    name="x-circle"
                    size={14}
                    color={theme.colors.text.subtle}
                  />
                </Pressable>
              )}
            </Animated.View>
          )}
        </View>
        {searchText.length > 0 && (
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              onCancelSearch();
            }}
            hitSlop={8}
            style={styles.cancelButtonContainer}
          >
            <Text size="md" style={{ color: theme.colors.brand[500] }}>
              Cancel
            </Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}
