import { useInfiniteUserPosts, useUserFollowed } from "@/src/api/read";
import { transformApiPost } from "@/src/api/read/utils";
import type { Post as ApiPost } from "@/src/api/types";
import { Text } from "@/src/components/ui/primitives";
import { useAuthStore, useContentModerationStore } from "@/src/stores";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useMemo, useRef } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { type Post as UIPost } from "./post-card";
import { PostCardItem } from "./post-card-item";
import { PostCardSkeletonList } from "./post-card-skeleton";
import { ProfileCommentItem } from "./profile-comment-item";
import { ProfilePostsSkeleton } from "./profile-posts-skeleton";

type ListType = "submissions" | "comments";

interface ProfilePostsListProps {
  owner: string;
  type: ListType;
  onPostPress: (postId: string) => void;
  onCommentPress: (commentId: string, rootPostId: string) => void;
  onAuthorPress?: (authorId: string) => void;
  onTopicPress?: (topic: string) => void;
  onMorePress?: (post: UIPost) => void;
  ListEmptyComponent?: React.ReactNode;
}

/**
 * Reusable list component for profile posts and comments
 * Handles infinite scroll, loading states, and empty states
 */
export const ProfilePostsList = memo(function ProfilePostsList({
  owner,
  type,
  onPostPress,
  onCommentPress,
  onAuthorPress,
  onMorePress,
  ListEmptyComponent,
}: ProfilePostsListProps) {
  const { theme } = useUnistyles();

  // Content moderation - filter out hidden posts/comments
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const hiddenCommentIds = useContentModerationStore((s) => s.hiddenCommentIds);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useInfiniteUserPosts(owner, { type, limit: 20 });

  // Fetch followed users for PostCard display
  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData]
  );

  // Flatten pages into single array and filter out hidden content
  const apiPosts = useMemo(() => {
    const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];
    // Filter out hidden posts/comments based on type
    if (type === "submissions") {
      return allPosts.filter((post) => !hiddenPostIds.has(post.post_id));
    } else {
      return allPosts.filter((post) => !hiddenCommentIds.has(post.post_id));
    }
  }, [data, type, hiddenPostIds, hiddenCommentIds]);

  // Transform API posts to UI posts for PostCard
  // Note: isFollowing is computed per-post, not from followedUsers dependency
  const currentUser = useAuthStore((s) => s.user);
  const uiPosts = useMemo(
    () => apiPosts.map((post) => transformApiPost(post, {
      currentUser: currentUser ? { id: currentUser.id, username: currentUser.username } : undefined,
    })),
    [apiPosts, currentUser]
  );

  const postsById = useMemo(() => {
    const map = new Map<string, UIPost>();
    for (const post of uiPosts) {
      map.set(post.id, post);
    }
    return map;
  }, [uiPosts]);

  const handleMorePress = useCallback(
    (postId: string) => {
      const post = postsById.get(postId);
      if (post) {
        onMorePress?.(post);
      }
    },
    [postsById, onMorePress]
  );

  // Debounce ref to prevent multiple fetches
  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);

  const handleEndReached = useCallback(() => {
    const now = Date.now();
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchingRef.current &&
      now - lastFetchTime.current > 1000
    ) {
      lastFetchTime.current = now;
      isFetchingRef.current = true;
      fetchNextPage().finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const renderPostItem = useCallback(
    ({ item }: { item: UIPost }) => {
      // Remove content warnings from own posts on profile
      const postWithoutWarnings = {
        ...item,
        contentWarnings: undefined,
      };
     return (
       <PostCardItem
         post={postWithoutWarnings}
         isOwnPost={true}
          showUrlCard={false}
         onPostPress={onPostPress}
         onAuthorPress={onAuthorPress}
         onCommentPress={onPostPress}
         onMorePress={handleMorePress}
       />
     );
    },
    [onPostPress, onAuthorPress, handleMorePress]
  );

  const renderCommentItem = useCallback(
    ({ item }: { item: ApiPost }) => {
      return <ProfileCommentItem comment={item} onPress={onCommentPress} />;
    },
    [onCommentPress]
  );

  const keyExtractor = useCallback((item: UIPost | ApiPost) => {
    return "id" in item ? item.id : item.post_id;
  }, []);

  const borderColor = theme.colors.border.subtle;

  const ItemSeparatorComponent = useCallback(
    () => <View style={[styles.separator, { backgroundColor: borderColor }]} />,
    [borderColor]
  );

 const ListFooterComponent = useCallback(() => {
   return (
      <View style={styles.footerContainer}>
        {isFetchingNextPage && (
          <View style={styles.loadingFooter}>
            <ActivityIndicator size="small" color={theme.colors.text.subtle} />
          </View>
        )}
        <View style={styles.bottomSpacer} />
      </View>
   );
 }, [isFetchingNextPage, theme.colors.text.subtle]);

  // Loading state
  if (isLoading) {
    if (type === "submissions") {
      return <PostCardSkeletonList count={3} />;
    }
    return <ProfilePostsSkeleton count={5} type={type} />;
  }

  // Error state
  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={theme.colors.text.subtle}
        />
        <Text size="md" weight="semibold" style={styles.errorTitle}>
          Something went wrong
        </Text>
        <Text size="sm" mode="subtle" style={styles.errorMessage}>
          We couldn't load your {type === "submissions" ? "posts" : "comments"}.
        </Text>
        <Pressable
          onPress={handleRefresh}
          style={[styles.retryButton, { backgroundColor: theme.colors.primary[500] }]}
        >
          <Text size="sm" weight="semibold" style={{ color: "#fff" }}>
            Try Again
          </Text>
        </Pressable>
      </View>
    );
  }

  // Empty state
  if (type === "submissions" ? uiPosts.length === 0 : apiPosts.length === 0) {
    return ListEmptyComponent ? <>{ListEmptyComponent}</> : null;
  }

  // Render posts with PostCard
  // Note: RefreshControl removed because FlatList has scrollEnabled={false}
  // Pull-to-refresh is handled by the parent ScrollView in profile-screen.tsx
  if (type === "submissions") {
    return (
      <FlatList
        data={uiPosts}
        keyExtractor={(item) => item.id}
        renderItem={renderPostItem}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={ListFooterComponent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        nestedScrollEnabled
      />
    );
  }

  // Render comments
  return (
    <FlatList
      data={apiPosts}
      keyExtractor={(item) => item.post_id}
      renderItem={renderCommentItem}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      ItemSeparatorComponent={ItemSeparatorComponent}
      ListFooterComponent={ListFooterComponent}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
      nestedScrollEnabled
    />
  );
});

const styles = StyleSheet.create((theme) => ({
 separator: {
   height: 1,
 },
  footerContainer: {},
  loadingFooter: {
   paddingVertical: theme.spacing.lg,
   alignItems: "center",
 },
  bottomSpacer: {
    height: 80,
  },
 errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  },
  errorTitle: {
    marginTop: theme.spacing.md,
    textAlign: "center",
  },
  errorMessage: {
    marginTop: theme.spacing.xs,
    textAlign: "center",
  },
  retryButton: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.full,
  },
}));
