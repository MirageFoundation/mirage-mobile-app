import { Image } from "expo-image";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import {
  selectCommunitySlugs,
  useInfiniteCommunities,
  useJoinedCommunities,
} from "@/src/api/read";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  buildJoinedCommunitySet,
  communityPath,
  isCommunityJoined,
  normalizeTypedCommunitySlug,
  type CommunitySummary,
} from "@/src/domain/communities";
import { useFollowHandler } from "@/src/hooks";
import { CommunityListHeader } from "./community-list-header";
import { CommunityListRow } from "./community-list-row";
import { styles } from "./community-list-styles";

const emptyInfoImage = require("@/assets/images/empty-info.png");

function ListSkeleton() {
  return (
    <View style={{ paddingTop: 8 }}>
      {Array.from({ length: 8 }).map((_, index) => (
        <View key={index} style={[styles.communityRow, { opacity: 0.5 }]}>
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ height: 16, width: 140, borderRadius: 6, backgroundColor: "rgba(128,128,128,0.2)" }} />
            <View style={{ height: 12, width: 180, borderRadius: 6, backgroundColor: "rgba(128,128,128,0.15)" }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function CommunityListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const searchInputRef = useRef<TextInput>(null);
  const [searchText, setSearchText] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [joinOverrides, setJoinOverrides] = useState<Record<string, boolean>>({});
  const { handleToggleCommunityMembership } = useFollowHandler({
    onOptimisticJoinCommunity: (community, isJoined) => {
      setJoinOverrides((current) => ({ ...current, [community]: isJoined }));
    },
    onRollbackJoinCommunity: (community) => {
      setJoinOverrides((current) => {
        const { [community]: _, ...rest } = current;
        return rest;
      });
    },
  });

  const normalizedQuery = normalizeTypedCommunitySlug(searchText);
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useInfiniteCommunities({
    query: normalizedQuery || undefined,
    limit: 50,
  });
  const { data: joinedData } = useJoinedCommunities({ limit: 200 });

  const HEADER_HEIGHT = 56 + 58 + insets.top;
  const lastScrollY = useSharedValue(0);
  const headerTranslateY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;
      if (currentY <= 0) {
        headerTranslateY.value = 0;
      } else if (diff > 0) {
        headerTranslateY.value = Math.max(-HEADER_HEIGHT, headerTranslateY.value - diff);
      } else if (diff < 0) {
        headerTranslateY.value = Math.min(0, headerTranslateY.value - diff);
      }
      lastScrollY.value = currentY;
    },
  });
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const joinedSet = useMemo(
    () => buildJoinedCommunitySet(selectCommunitySlugs(joinedData)),
    [joinedData],
  );

  const communities = useMemo(() => {
    const pages = data?.pages ?? [];
    const unique = new Map<string, CommunitySummary>();
    for (const page of pages) {
      for (const item of page.items ?? []) {
        if (!unique.has(item.community)) unique.set(item.community, item);
      }
    }
    return Array.from(unique.values());
  }, [data]);

  const isSearchActive = normalizedQuery.length > 0;
  const isSearchLoading = isSearchActive && isFetching && communities.length === 0;

  const handleCommunityPress = useCallback(
    (slug: string) => {
      router.push(communityPath(slug) as never);
    },
    [router],
  );

  const handleJoinToggle = useCallback(
    (slug: string, isCurrentlyJoined: boolean) => {
      triggerHaptic("light");
      handleToggleCommunityMembership(slug, isCurrentlyJoined);
    },
    [handleToggleCommunityMembership],
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: CommunitySummary }) => {
      const joined = joinOverrides[item.community] ?? isCommunityJoined(joinedSet, item.community);
      return (
        <CommunityListRow
          item={item}
          isJoined={joined}
          isLoading={false}
          onPress={() => handleCommunityPress(item.community)}
          onJoinToggle={() => handleJoinToggle(item.community, joined)}
        />
      );
    },
    [handleCommunityPress, handleJoinToggle, joinOverrides, joinedSet],
  );

  const ListEmptyComponent = useCallback(() => {
    if (isLoading || isSearchLoading) return <ListSkeleton />;
    if (isError) {
      return (
        <Box center p="lg" style={{ paddingTop: 80 }}>
          <Text size="lg" weight="medium">
            Failed to load communities
          </Text>
          <Text size="sm" mode="subtle" style={{ marginTop: 8, textAlign: "center" }}>
            {error?.message || "Something went wrong. Try again."}
          </Text>
          <Pressable
            onPress={() => void refetch()}
            style={[styles.retryButton, { borderColor: theme.colors.border.default }]}
          >
            <Text size="sm" weight="semibold">Retry</Text>
          </Pressable>
        </Box>
      );
    }
    if (isSearchActive) {
      return (
        <Box center p="lg">
          <Text mode="subtle">No communities found matching your search</Text>
        </Box>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Image
          source={emptyInfoImage}
          style={styles.emptyImage}
          contentFit="contain"
        />
        <Text size="lg" weight="bold" style={{ textAlign: "center" }}>
          No communities yet
        </Text>
        <Text
          size="sm"
          mode="subtle"
          style={{ marginTop: 8, textAlign: "center", maxWidth: 280 }}
        >
          Communities will appear here once they are created.
        </Text>
      </View>
    );
  }, [error?.message, isError, isLoading, isSearchActive, isSearchLoading, refetch, theme.colors.border.default]);

  return (
    <Box flex background="base">
      <CommunityListHeader
        insetsTop={insets.top}
        searchText={searchText}
        isSearchLoading={isSearchLoading}
        searchInputRef={searchInputRef}
        headerAnimatedStyle={headerAnimatedStyle}
        onBack={() => router.back()}
        onChangeSearch={setSearchText}
        onClearSearch={() => {
          setSearchText("");
          searchInputRef.current?.focus();
        }}
        onCancelSearch={() => setSearchText("")}
      />
      <Animated.FlatList
        data={communities}
        renderItem={renderItem}
        keyExtractor={(item) => item.community}
        contentContainerStyle={{
          paddingTop: HEADER_HEIGHT,
          paddingBottom: insets.bottom + 20,
          flexGrow: communities.length === 0 ? 1 : undefined,
        }}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator color={theme.colors.text.subtle} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.text.subtle}
            progressViewOffset={HEADER_HEIGHT}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
      />
    </Box>
  );
}
