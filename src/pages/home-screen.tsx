import { FeedHeader } from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import {
  HEADER_HEIGHT,
  TAB_BAR_HEIGHT,
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { usePreferencesStore } from "@/src/stores";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

// Placeholder post card for demonstration
const PlaceholderPostCard = ({ index }: { index: number }) => {
  return (
    <Box
      background="base"
      rounded="lg"
      p="md"
      mb="sm"
      border="subtle"
      style={styles.postCard}
    >
      <Box direction="row" gap="sm" style={{ marginBottom: 12 }}>
        <View style={styles.avatarPlaceholder} />
        <Box>
          <Text weight="semibold">@username_{index}</Text>
          <Text size="xs" mode="subtle">
            2h ago
          </Text>
        </Box>
      </Box>
      <Text weight="medium" style={{ marginBottom: 8 }}>
        This is a placeholder post title #{index + 1}
      </Text>
      <Text size="sm" mode="subtle">
        This is some example body text for the post. It demonstrates how content
        will look in the feed.
      </Text>
      <Box direction="row" gap="md" style={{ marginTop: 12 }}>
        <Text size="sm" mode="subtle">
          👍 123
        </Text>
        <Text size="sm" mode="subtle">
          💬 45
        </Text>
        <Text size="sm" mode="subtle">
          🔗 Share
        </Text>
      </Box>
    </Box>
  );
};

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { scrollHandler, headerAnimatedStyle } = useScrollAnimationContext();
  const feedType = usePreferencesStore((s) => s.feedType);
  const setFeedType = usePreferencesStore((s) => s.setFeedType);

  const handleFeedTypePress = () => {
    // Cycle through feed types for now
    const types: ("home" | "popular" | "news")[] = ["home", "popular", "news"];
    const currentIndex = types.indexOf(feedType);
    const nextIndex = (currentIndex + 1) % types.length;
    setFeedType(types[nextIndex]);
  };

  // Generate placeholder posts
  const posts = Array.from({ length: 20 }, (_, i) => i);

  return (
    <Box flex background="base">
      {/* Fixed Status Bar Background */}
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      {/* Animated Header */}
      <FeedHeader
        title="Mirage"
        feedType={feedType}
        onFeedTypePress={handleFeedTypePress}
        animatedStyle={headerAnimatedStyle}
      />

      {/* Scrollable Content */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: insets.top + HEADER_HEIGHT + 8,
          paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        {posts.map((index) => (
          <PlaceholderPostCard key={index} index={index} />
        ))}
      </Animated.ScrollView>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  statusBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background.default,
    zIndex: 101,
  },
  postCard: {
    shadowColor: theme.colors.contrast.base,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.background.subtle,
  },
}));
