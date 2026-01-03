import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  Layout,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useSearchStore, type RecentSearch } from "@/src/stores";

// Mock trending topics data
type TrendingTopic = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const TRENDING_TOPICS: TrendingTopic[] = [
  {
    id: "1",
    title: "Bitcoin",
    subtitle: "Cryptocurrency • 125K posts",
    icon: "logo-bitcoin",
    color: "#F7931A",
  },
  {
    id: "2",
    title: "AI Technology",
    subtitle: "Technology • 89K posts",
    icon: "sparkles",
    color: "#8B5CF6",
  },
  {
    id: "3",
    title: "Gaming",
    subtitle: "Entertainment • 234K posts",
    icon: "game-controller",
    color: "#10B981",
  },
  {
    id: "4",
    title: "SpaceX Launch",
    subtitle: "Space • 45K posts",
    icon: "rocket",
    color: "#3B82F6",
  },
  {
    id: "5",
    title: "World Cup",
    subtitle: "Sports • 312K posts",
    icon: "football",
    color: "#EF4444",
  },
];

// Mock suggestions based on search query
const getMockSuggestions = (query: string): string[] => {
  if (!query.trim()) return [];

  const allSuggestions = [
    "bitcoin price today",
    "bitcoin news",
    "bitcoin mining",
    "best crypto wallet",
    "crypto trading tips",
    "artificial intelligence",
    "ai chatbots",
    "machine learning",
    "gaming news",
    "best games 2024",
    "tech reviews",
    "smartphone comparison",
    "latest movies",
    "music releases",
    "sports highlights",
  ];

  const lowerQuery = query.toLowerCase();
  return allSuggestions
    .filter((s) => s.toLowerCase().includes(lowerQuery))
    .slice(0, 8);
};

export function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const inputRef = useRef<TextInput>(null);

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  // Search store
  const recentSearches = useSearchStore((s) => s.recentSearches);
  const addRecentSearch = useSearchStore((s) => s.addRecentSearch);
  const removeRecentSearch = useSearchStore((s) => s.removeRecentSearch);

  // Auto-focus the input when screen mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Get suggestions based on query
  const suggestions = useMemo(
    () => getMockSuggestions(searchQuery),
    [searchQuery]
  );

  // Handlers
  const handleBack = useCallback(() => {
    triggerHaptic("light");
    Keyboard.dismiss();
    router.back();
  }, [router]);

  const handleClearInput = useCallback(() => {
    triggerHaptic("light");
    setSearchQuery("");
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;

      triggerHaptic("light");
      addRecentSearch(trimmedQuery);
      Keyboard.dismiss();
      // TODO: Navigate to search results or perform search
      console.log("Search for:", trimmedQuery);
    },
    [addRecentSearch]
  );

  const handleRecentSearchPress = useCallback(
    (search: RecentSearch) => {
      triggerHaptic("light");
      setSearchQuery(search.query);
      handleSearch(search.query);
    },
    [handleSearch]
  );

  const handleRemoveRecentSearch = useCallback(
    (id: string) => {
      triggerHaptic("light");
      removeRecentSearch(id);
    },
    [removeRecentSearch]
  );

  const handleTrendingTopicPress = useCallback(
    (topic: TrendingTopic) => {
      triggerHaptic("light");
      setSearchQuery(topic.title);
      handleSearch(topic.title);
    },
    [handleSearch]
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      triggerHaptic("light");
      setSearchQuery(suggestion);
      handleSearch(suggestion);
    },
    [handleSearch]
  );

  const handleSubmitEditing = useCallback(() => {
    handleSearch(searchQuery);
  }, [handleSearch, searchQuery]);

  // Render recent search item
  const renderRecentSearchItem = useCallback(
    ({ item, index }: { item: RecentSearch; index: number }) => (
      <Animated.View
        entering={FadeInDown.delay(index * 50).duration(200)}
        layout={Layout.springify()}
      >
        <Pressable
          onPress={() => handleRecentSearchPress(item)}
          style={({ pressed }) => [
            styles.recentSearchItem,
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={styles.recentSearchLeft}>
            <Ionicons
              name="time-outline"
              size={18}
              color={theme.colors.text.subtle}
            />
            <Text size="md" style={{ flex: 1 }}>
              {item.query}
            </Text>
          </View>
          <Pressable
            onPress={() => handleRemoveRecentSearch(item.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && { opacity: 0.5 },
            ]}
          >
            <Ionicons
              name="close"
              size={18}
              color={theme.colors.text.subtle}
            />
          </Pressable>
        </Pressable>
      </Animated.View>
    ),
    [theme.colors.text.subtle, handleRecentSearchPress, handleRemoveRecentSearch]
  );

  // Render trending topic item
  const renderTrendingTopicItem = useCallback(
    ({ item, index }: { item: TrendingTopic; index: number }) => (
      <Animated.View entering={FadeInDown.delay(index * 50 + 100).duration(200)}>
        <Pressable
          onPress={() => handleTrendingTopicPress(item)}
          style={({ pressed }) => [
            styles.trendingItem,
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={[styles.trendingIcon, { backgroundColor: `${item.color}15` }]}>
            <Ionicons name={item.icon} size={20} color={item.color} />
          </View>
          <View style={styles.trendingContent}>
            <Text size="md" weight="medium">
              {item.title}
            </Text>
            <Text size="sm" mode="subtle">
              {item.subtitle}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    ),
    [handleTrendingTopicPress]
  );

  // Render suggestion item
  const renderSuggestionItem = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
        <Pressable
          onPress={() => handleSuggestionPress(item)}
          style={({ pressed }) => [
            styles.suggestionItem,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={18}
            color={theme.colors.text.subtle}
          />
          <Text size="md" style={{ flex: 1 }}>
            {item}
          </Text>
          <Ionicons
            name="arrow-up-outline"
            size={16}
            color={theme.colors.text.subtle}
            style={{ transform: [{ rotate: "-45deg" }] }}
          />
        </Pressable>
      </Animated.View>
    ),
    [theme.colors.text.subtle, handleSuggestionPress]
  );

  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <Box flex background="base">
      {/* Header with Search Input */}
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
        {/* Back Button */}
        <Pressable
          onPress={handleBack}
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

        {/* Search Input */}
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.colors.background.subtle,
              borderColor: isFocused
                ? theme.colors.primary[500]
                : theme.colors.border.subtle,
            },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={18}
            color={theme.colors.text.subtle}
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSubmitEditing={handleSubmitEditing}
            placeholder="Search..."
            placeholderTextColor={theme.colors.text.subtle}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.colors.text.default }]}
          />
          {hasSearchQuery && (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
              <Pressable
                onPress={handleClearInput}
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
                  <Ionicons name="close" size={12} color={theme.colors.background.default} />
                </View>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Content */}
      {hasSearchQuery ? (
        // Show suggestions when there's a search query
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item}
          renderItem={renderSuggestionItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text size="md" mode="subtle">
                No suggestions found
              </Text>
            </View>
          }
        />
      ) : (
        // Show recent searches and trending topics when empty
        <FlatList
          data={[]}
          renderItem={null}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          ListHeaderComponent={
            <>
              {/* Recent Searches Section */}
              {recentSearches.length > 0 && (
                <View style={styles.section}>
                  <Text
                    size="sm"
                    weight="semibold"
                    mode="subtle"
                    style={styles.sectionTitle}
                  >
                    RECENT
                  </Text>
                  <FlatList
                    data={recentSearches}
                    keyExtractor={(item) => item.id}
                    renderItem={renderRecentSearchItem}
                    scrollEnabled={false}
                  />
                </View>
              )}

              {/* Trending Topics Section */}
              <View style={styles.section}>
                <Text
                  size="sm"
                  weight="semibold"
                  mode="subtle"
                  style={styles.sectionTitle}
                >
                  TRENDING TOPICS
                </Text>
                <FlatList
                  data={TRENDING_TOPICS}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTrendingTopicItem}
                  scrollEnabled={false}
                />
              </View>
            </>
          }
        />
      )}
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 0.5,
    gap: theme.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 40,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  searchIcon: {
    marginRight: theme.spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: theme.typography.size.md,
    fontFamily: theme.typography.family.mono,
    height: "100%",
  },
  clearInputButton: {
    padding: 4,
  },
  clearInputIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingTop: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  recentSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
  },
  recentSearchLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
  },
  clearButton: {
    padding: 4,
  },
  trendingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  trendingIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  trendingContent: {
    flex: 1,
    gap: 2,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  emptyState: {
    paddingVertical: theme.spacing.xl,
    alignItems: "center",
  },
}));

