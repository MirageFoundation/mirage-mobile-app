import { EvilIcons, Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  useDebouncedSearchTopics,
  useTopics,
} from "@/src/api/read/hooks/use-topics";
import type { TopicInfo } from "@/src/api/types";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { type Community } from "@/src/stores/draft-store";

const topicToCommunity = (topic: TopicInfo): Community => ({
  id: topic.topic.toLowerCase(),
  name: topic.topic.toLowerCase(),
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

const formatCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};

const CreateTopicItem = ({
  topicName,
  onPress,
}: {
  topicName: string;
  onPress: () => void;
}) => {
  const { theme } = useUnistyles();

  return (
    <Pressable onPress={onPress} style={styles.createTopicItem}>
      <Box direction="row" alignItems="center" gap="sm" py="md">
        <Feather name="plus" size={20} color={theme.colors.brand[500]} />
        <Text
          size="lg"
          weight="semibold"
          style={{ color: theme.colors.brand[500] }}
        >
          Create #{topicName.toLowerCase()}
        </Text>
      </Box>
    </Pressable>
  );
};

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
        <View style={styles.communityInfo}>
          <View style={styles.communityHeader}>
            <Text size="lg" weight="semibold" numberOfLines={1}>
              #{community.name.toLowerCase()}
            </Text>
          </View>
          {community.memberCount > 0 && (
            <Text size="md" mode="subtle" style={{ lineHeight: 18 }}>
              {formatCount(community.memberCount)} posts
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
  const insets = useSafeAreaInsets();

  const [searchText, setSearchText] = useState("");
  const searchInputRef = useRef<TextInput>(null);

  const searchExpandProgress = useSharedValue(0);

  const { data: topicsData, isLoading: isLoadingTopics } = useTopics(100);

  const {
    data: searchData,
    isSearching,
    isDebouncing,
  } = useDebouncedSearchTopics(
    searchText.length >= 2 ? searchText : null,
    750,
    { limit: 50 },
  );

  const filteredCommunities = useMemo(() => {
    if (searchText.length >= 2 && searchData?.topics) {
      return searchData.topics.map(topicToCommunity);
    }

    if (searchText.trim() && topicsData?.topics) {
      const query = searchText.toLowerCase();
      const apiCommunities = topicsData.topics.map(topicToCommunity);
      return apiCommunities.filter((c) => c.name.toLowerCase().includes(query));
    }

    return topicsData?.topics?.map(topicToCommunity) ?? [];
  }, [searchText, topicsData, searchData]);

  const exactTopicExists = useMemo(() => {
    if (!searchText.trim()) return true;
    const normalizedSearch = searchText.toLowerCase().trim();
    return filteredCommunities.some(
      (c) =>
        c.id === normalizedSearch || c.name.toLowerCase() === normalizedSearch,
    );
  }, [searchText, filteredCommunities]);

  const createTopicOption: Community | null = useMemo(() => {
    if (!searchText.trim() || exactTopicExists || isDebouncing || isSearching)
      return null;
    const cleanName = searchText
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (!cleanName) return null;

    return {
      id: cleanName,
      name: cleanName,
      avatar: undefined,
      memberCount: 0,
      description: undefined,
      isSubscribed: false,
      isNewTopic: true,
    };
  }, [searchText, exactTopicExists, isDebouncing, isSearching]);

  const isLoading = isLoadingTopics || isDebouncing || isSearching;

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

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(searchExpandProgress.value, [0, 1], [1, 0]),
    height: interpolate(searchExpandProgress.value, [0, 1], [48, 0]),
    overflow: "hidden" as const,
  }));

  const cancelButtonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchExpandProgress.value,
    width: interpolate(searchExpandProgress.value, [0, 1], [0, 68]),
  }));

  const searchContainerAnimatedStyle = useAnimatedStyle(() => ({
    marginTop: interpolate(searchExpandProgress.value, [0, 1], [16, 8]),
  }));

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
        onPress={() => {
          triggerHaptic("selection");
          onSelect(item);
        }}
      />
    ),
    [selectedCommunity, onSelect],
  );

  const ListHeaderComponent = useMemo(() => {
    if (!createTopicOption) return null;
    return (
      <CreateTopicItem
        topicName={createTopicOption.name}
        onPress={() => {
          triggerHaptic("selection");
          onSelect(createTopicOption);
        }}
      />
    );
  }, [createTopicOption, onSelect]);

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
            paddingTop: Platform.OS === "android" ? insets.top : 0,
          },
        ]}
      >
        <Animated.View style={[styles.header, headerAnimatedStyle]}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <EvilIcons
              name="close"
              size={36}
              color={theme.colors.text.default}
            />
          </Pressable>
          <Text size="lg" weight="semibold" style={styles.headerTitle}>
            Select a topic
          </Text>
          <View style={styles.closeButton} />
        </Animated.View>

        <Animated.View
          style={[styles.searchContainer, searchContainerAnimatedStyle]}
        >
          <View style={styles.searchInputContainer}>
            <View
              style={[
                styles.searchInputWrapper,
                {
                  backgroundColor: theme.colors.background.light,
                },
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
                    fontWeight: theme.typography.weight.semibold,
                    fontSize: theme.typography.size.lg,
                  },
                ]}
                placeholder="Search for a topic"
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

          <Animated.View
            style={[styles.cancelButtonContainer, cancelButtonAnimatedStyle]}
          >
            <Pressable onPress={handleCancel} hitSlop={8}>
              <Text size="md" style={{ color: theme.colors.brand[500] }}>
                Cancel
              </Text>
            </Pressable>
          </Animated.View>
        </Animated.View>

        {isLoading ? (
          <Box p="lg" alignItems="center">
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
            ListHeaderComponent={ListHeaderComponent}
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
    height: 46,
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
  createTopicItem: {
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border.subtle,
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
