import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import {
  View,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  runOnJS,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

import { Box, Text, Button } from "@/src/components/ui/primitives";
import { Avatar } from "@/src/components/atoms";
import { type Community } from "@/src/stores/draft-store";
import { useAuthStore } from "@/src/stores/auth-store";
import { triggerHaptic } from "@/src/components/utils/haptics";

// Mock communities data
const MOCK_COMMUNITIES: Community[] = [
  {
    id: "tech",
    name: "Technology",
    avatar: undefined,
    memberCount: 125000,
    description: "Discuss the latest in tech, gadgets, and innovation",
    isSubscribed: true,
  },
  {
    id: "gaming",
    name: "Gaming",
    avatar: undefined,
    memberCount: 89000,
    description: "For gamers, by gamers. Share your plays and reviews",
    isSubscribed: true,
  },
  {
    id: "crypto",
    name: "Cryptocurrency",
    avatar: undefined,
    memberCount: 56000,
    description: "Crypto news, trading strategies, and blockchain tech",
    isSubscribed: false,
  },
  {
    id: "music",
    name: "Music",
    avatar: undefined,
    memberCount: 78000,
    description: "Share and discover music across all genres",
    isSubscribed: true,
  },
  {
    id: "movies",
    name: "Movies & TV",
    avatar: undefined,
    memberCount: 95000,
    description: "Reviews, discussions, and recommendations",
    isSubscribed: false,
  },
  {
    id: "art",
    name: "Art & Design",
    avatar: undefined,
    memberCount: 42000,
    description: "Showcase your creativity and get inspired",
    isSubscribed: false,
  },
  {
    id: "news",
    name: "News",
    avatar: undefined,
    memberCount: 156000,
    description: "Stay informed with the latest news from around the world",
    isSubscribed: true,
  },
  {
    id: "sports",
    name: "Sports",
    avatar: undefined,
    memberCount: 112000,
    description: "All things sports - scores, highlights, and discussions",
    isSubscribed: false,
  },
];

type CommunitySelectionModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (community: Community) => void;
  selectedCommunity?: Community;
};

// Format member count
const formatMemberCount = (count: number): string => {
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
  onPress,
}: {
  community: Community;
  isSelected: boolean;
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
            <Text size="md" weight="semibold" numberOfLines={1}>
              {community.name}
            </Text>
            {community.isSubscribed && (
              <View
                style={[
                  styles.subscribedBadge,
                  { backgroundColor: theme.colors.success[500] + "20" },
                ]}
              >
                <Text
                  size="xs"
                  style={{ color: theme.colors.success[500] }}
                  weight="medium"
                >
                  Subscribed
                </Text>
              </View>
            )}
          </View>
          <Text size="sm" mode="subtle">
            {formatMemberCount(community.memberCount)} members
          </Text>
          {community.description && (
            <Text size="sm" mode="subtle" numberOfLines={2} style={{ marginTop: 2 }}>
              {community.description}
            </Text>
          )}
        </View>
        {isSelected && (
          <Feather name="check" size={20} color={theme.colors.brand} />
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
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const { user } = useAuthStore();

  // State
  const [searchText, setSearchText] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // Animation values
  const headerOpacity = useSharedValue(1);
  const searchExpandProgress = useSharedValue(0);

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

  // Filter communities based on search
  const filteredCommunities = useMemo(() => {
    const allCommunities = [userCommunity, ...MOCK_COMMUNITIES];
    if (!searchText.trim()) {
      return allCommunities;
    }
    const query = searchText.toLowerCase();
    return allCommunities.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query)
    );
  }, [searchText, userCommunity]);

  // Handle search focus
  const handleSearchFocus = useCallback(() => {
    setIsSearchFocused(true);
    headerOpacity.value = withTiming(0, { duration: 200 });
    searchExpandProgress.value = withTiming(1, { duration: 250 });
  }, []);

  const handleSearchBlur = useCallback(() => {
    if (searchText.length === 0) {
      setIsSearchFocused(false);
      headerOpacity.value = withTiming(1, { duration: 200 });
      searchExpandProgress.value = withTiming(0, { duration: 250 });
    }
  }, [searchText]);

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    setSearchText("");
    setIsSearchFocused(false);
    headerOpacity.value = withTiming(1, { duration: 200 });
    searchExpandProgress.value = withTiming(0, { duration: 250 });
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchText("");
    searchInputRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    setSearchText("");
    setIsSearchFocused(false);
    headerOpacity.value = 1;
    searchExpandProgress.value = 0;
    onClose();
  }, [onClose]);

  // Animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    height: headerOpacity.value === 0 ? 0 : "auto",
    overflow: "hidden",
  }));

  const searchContainerAnimatedStyle = useAnimatedStyle(() => ({
    marginLeft: searchExpandProgress.value * -40,
  }));

  const cancelButtonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchExpandProgress.value,
    width: searchExpandProgress.value * 70,
    marginLeft: searchExpandProgress.value * 8,
  }));

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setSearchText("");
      setIsSearchFocused(false);
      headerOpacity.value = 1;
      searchExpandProgress.value = 0;
    }
  }, [visible]);

  const renderCommunityItem = useCallback(
    ({ item }: { item: Community }) => (
      <CommunityItem
        community={item}
        isSelected={selectedCommunity?.id === item.id}
        onPress={() => {
          triggerHaptic("selection");
          onSelect(item);
        }}
      />
    ),
    [selectedCommunity, onSelect]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background.default,
            paddingTop: insets.top,
          },
        ]}
      >
        {/* Header */}
        <Animated.View style={[styles.header, headerAnimatedStyle]}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Feather name="x" size={24} color={theme.colors.text.default} />
          </Pressable>
          <Text size="lg" weight="semibold" style={styles.headerTitle}>
            Post to
          </Text>
          <View style={styles.closeButton} />
        </Animated.View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Animated.View
            style={[styles.searchInputContainer, searchContainerAnimatedStyle]}
          >
            <View
              style={[
                styles.searchInputWrapper,
                {
                  backgroundColor: theme.colors.background.subtle,
                  borderColor: isSearchFocused
                    ? theme.colors.brand
                    : theme.colors.border.subtle,
                },
              ]}
            >
              <Feather
                name="search"
                size={18}
                color={theme.colors.text.subtle}
                style={{ marginRight: 8 }}
              />
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { color: theme.colors.text.default }]}
                placeholder="Search communities"
                placeholderTextColor={theme.colors.text.subtle}
                value={searchText}
                onChangeText={setSearchText}
                onFocus={handleSearchFocus}
                onBlur={handleSearchBlur}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchText.length > 0 && (
                <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
                  <Pressable onPress={handleClearSearch} style={styles.clearButton}>
                    <Feather name="x-circle" size={18} color={theme.colors.text.subtle} />
                  </Pressable>
                </Animated.View>
              )}
            </View>
          </Animated.View>

          {/* Cancel Button */}
          <Animated.View style={cancelButtonAnimatedStyle}>
            <Pressable onPress={handleCancel}>
              <Text size="md" style={{ color: theme.colors.brand }}>
                Cancel
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* Communities List */}
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
              <Text mode="subtle">No communities found</Text>
            </Box>
          }
        />
      </View>
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
    paddingVertical: theme.spacing.sm,
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
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  searchInputContainer: {
    flex: 1,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: theme.typography.family.mono,
    height: "100%",
  },
  clearButton: {
    padding: theme.spacing.xs,
  },
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  communityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
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

