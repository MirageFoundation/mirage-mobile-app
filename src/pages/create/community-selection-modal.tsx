import { EvilIcons, Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useSearchTopics, useTopics } from "@/src/api/read/hooks/use-topics";
import type { TopicInfo } from "@/src/api/types";
import { Avatar } from "@/src/components/atoms";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAuthStore } from "@/src/stores/auth-store";
import { type Community } from "@/src/stores/draft-store";

// Helper function to transform TopicInfo to Community format
const topicToCommunity = (topic: TopicInfo): Community => ({
  id: topic.topic.toLowerCase(),
  name: topic.topic.charAt(0).toUpperCase() + topic.topic.slice(1),
  avatar: undefined,
  memberCount: topic.post_count ?? topic.count ?? 0,
  description: undefined,
  isSubscribed: false,
});

type CommunitySelectionModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (community: Community) => void;
  selectedCommunity?: Community;
};

// Format count (posts or members)
const formatCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};

// Community Item Component
const CommunityItem = ({
  community,
  isSelected,
  isUserProfile,
  onPress,
}: {
  community: Community;
  isSelected: boolean;
  isUserProfile?: boolean;
  onPress: () => void;
}) => {
  const { theme } = useUnistyles();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 20, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.communityItem, animatedStyle]}>
        <Avatar
          size={44}
          seed={community.id}
          source={community.avatar ? { uri: community.avatar } : undefined}
          rounded="full"
        />
        <View style={styles.communityInfo}>
          <View style={styles.communityHeader}>
            <Text size="lg" weight="semibold" numberOfLines={1}>
              {community.name}
            </Text>
          </View>
          {community.memberCount > 0 && (
            <Text size="md" mode="subtle" style={{ lineHeight: 18 }}>
              {formatCount(community.memberCount)}{" "}
              {isUserProfile ? "followers" : "posts"}
            </Text>
          )}
          {community.description && (
            <Text
              size="md"
              mode="subtle"
              numberOfLines={2}
              style={{ marginTop: 2, lineHeight: 18 }}
            >
              {community.description}
            </Text>
          )}
        </View>
        {isSelected && (
          <Feather name="check" size={20} color={theme.colors.brand[500]} />
        )}
      </Animated.View>
    </Pressable>
  );
};

export const CommunitySelectionModal = ({
  visible,
  onClose,
  onSelect,
  selectedCommunity,
}: CommunitySelectionModalProps) => {
  const { theme } = useUnistyles();
  const { user } = useAuthStore();

  // State
  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<TextInput>(null);

  // Animation values
  const searchExpandProgress = useSharedValue(0);

  // Fetch topics from API
  const { data: topicsData, isLoading: isLoadingTopics } = useTopics(100);

  // Search topics when user types (only if query length >= 2)
  const { data: searchData, isLoading: isSearching } = useSearchTopics(
    searchText.length >= 2 ? searchText : null,
    { limit: 50 }
  );

  // User's profile as first community option
  const userCommunity: Community = useMemo(
    () => ({
      id: user?.id ?? "user",
      name: user?.username ?? "Your Profile",
      avatar: user?.avatar,
      memberCount: user?.followerCount ?? 0,
      description: "Post to your profile",
      isSubscribed: true,
    }),
    [user]
  );

  // Transform topics to communities and filter based on search
  const filteredCommunities = useMemo(() => {
    // If searching, use search results
    if (searchText.length >= 2 && searchData?.topics) {
      const searchCommunities = searchData.topics.map(topicToCommunity);
      // Also filter user profile if it matches
      const userMatches = userCommunity.name
        .toLowerCase()
        .includes(searchText.toLowerCase());
      return userMatches
        ? [userCommunity, ...searchCommunities]
        : searchCommunities;
    }

    // If searching but query too short, filter locally
    if (searchText.trim() && topicsData?.topics) {
      const query = searchText.toLowerCase();
      const apiCommunities = topicsData.topics.map(topicToCommunity);
      const filtered = apiCommunities.filter((c) =>
        c.name.toLowerCase().includes(query)
      );
      const userMatches = userCommunity.name.toLowerCase().includes(query);
      return userMatches ? [userCommunity, ...filtered] : filtered;
    }

    // No search - show all topics
    const apiCommunities = topicsData?.topics?.map(topicToCommunity) ?? [];
    return [userCommunity, ...apiCommunities];
  }, [searchText, topicsData, searchData, userCommunity]);

  // Loading state
  const isLoading = isLoadingTopics || (searchText.length >= 2 && isSearching);

  // Handle search focus
  const handleSearchFocus = useCallback(() => {
    searchExpandProgress.value = withTiming(1, { duration: 200 });
  }, [searchExpandProgress]);

  const handleSearchBlur = useCallback(() => {
    if (searchText.length === 0) {
      searchExpandProgress.value = withTiming(0, { duration: 200 });
    }
  }, [searchText, searchExpandProgress]);

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    setSearchText("");
    searchExpandProgress.value = withTiming(0, { duration: 200 });
  }, [searchExpandProgress]);

  const handleClearSearch = useCallback(() => {
    setSearchText("");
    searchInputRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    setSearchText("");
    searchExpandProgress.value = 0;
    onClose();
  }, [onClose, searchExpandProgress]);

  // Animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(searchExpandProgress.value, [0, 1], [1, 0]),
    height: interpolate(searchExpandProgress.value, [0, 1], [48, 0]),
    overflow: "hidden" as const,
  }));

  const cancelButtonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchExpandProgress.value,
    width: interpolate(searchExpandProgress.value, [0, 1], [0, 68]),
  }));

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setSearchText("");
      searchExpandProgress.value = 0;
    }
  }, [visible, searchExpandProgress]);

  const renderCommunityItem = useCallback(
    ({ item }: { item: Community }) => (
      <CommunityItem
        community={item}
        isSelected={selectedCommunity?.id === item.id}
        isUserProfile={item.id === userCommunity.id}
        onPress={() => {
          triggerHaptic("selection");
          onSelect(item);
        }}
      />
    ),
    [selectedCommunity, onSelect, userCommunity.id]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <Box
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background.default,
          },
        ]}
      >
        {/* Header */}
        <Animated.View style={[styles.header, headerAnimatedStyle]}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <EvilIcons
              name="close"
              size={36}
              color={theme.colors.text.default}
            />
          </Pressable>
          <Text size="md" weight="semibold" style={styles.headerTitle}>
            Post to
          </Text>
          <View style={styles.closeButton} />
        </Animated.View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <View
              style={[
                styles.searchInputWrapper,
                {
                  backgroundColor: theme.colors.background.subtle,
                },
              ]}
            >
              <Feather
                name="search"
                size={16}
                color={theme.colors.text.subtle}
                style={{ marginRight: 6 }}
              />
              <TextInput
                ref={searchInputRef}
                style={[
                  styles.searchInput,
                  { color: theme.colors.text.default },
                ]}
                placeholder="Search for a community"
                placeholderTextColor={theme.colors.text.subtle}
                value={searchText}
                onChangeText={setSearchText}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchText.length > 0 && (
                <Animated.View
                  entering={FadeIn.duration(150)}
                  exiting={FadeOut.duration(150)}
                >
                  <Pressable
                    onPress={handleClearSearch}
                    style={styles.clearButton}
                  >
                    <Feather
                      name="x-circle"
                      size={14}
                      color={theme.colors.text.subtle}
                    />
                  </Pressable>
                </Animated.View>
              )}
            </View>
          </View>

          {/* Cancel Button */}
          <Animated.View
            style={[styles.cancelButtonContainer, cancelButtonAnimatedStyle]}
          >
            <Pressable onPress={handleCancel} hitSlop={8}>
              <Text size="md" style={{ color: "rgb(29,68,150)" }}>
                Cancel
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* Communities List */}
        {isLoading ? (
          <Box flex center>
            <ActivityIndicator size="large" color={theme.colors.brand[500]} />
            <Text mode="subtle" style={{ marginTop: 12 }}>
              Loading topics...
            </Text>
          </Box>
        ) : (
          <FlatList
            data={filteredCommunities}
            renderItem={renderCommunityItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <Box center p="lg">
                <Text mode="subtle">
                  {searchText.length > 0
                    ? "No topics found matching your search"
                    : "No topics available"}
                </Text>
              </Box>
            }
            ListFooterComponent={() => <View style={{ height: 100 }} />}
          />
        )}
      </Box>
    </Modal>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xs,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    textAlign: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  searchInputContainer: {
    flex: 1,
  },
  cancelButtonContainer: {
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "flex-end",
    height: 36,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: theme.typography.family.mono,
    height: "100%",
    fontWeight: "400",
  },
  clearButton: {
    padding: theme.spacing.xs,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
  },
  communityItem: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  communityInfo: {
    flex: 1,
  },
  communityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  subscribedBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  separator: {
    height: 0.5,
    backgroundColor: theme.colors.border.subtle,
  },
}));
