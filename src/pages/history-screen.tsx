import { navigateToEditPost } from "@/src/utils/edit-post";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "@/src/navigation/guarded-router";
import { useIsFocused } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  type Post,
  PostOptionsSheet,
  type PostOptionsSheetRef,
} from "@/src/components/molecules";
import { PostCardItem } from "@/src/components/molecules/post-card-item";
import { Text } from "@/src/components/ui/primitives";
import {
  useAuthGuard,
  useNetworkState,
  usePostListViewability,
  useVoteHandler,
  type VoteResult,
} from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import {
  useAuthStore,
  useContentModerationStore,
  useSavedPostsStore,
  usePreferencesStore,
  getShareBaseUrl,
} from "@/src/stores";
import { useHistoryStore, type HistoryEntry } from "@/src/stores/history-store";

const emptyInfoImage = require("@/assets/images/empty-info.png");

type VoteOverride = {
  hasLiked: boolean;
  hasDisliked: boolean;
  likeDelta: number;
};

export function HistoryScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const toast = useToast();
  const { requireAuth } = useAuthGuard();

  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [voteOverrides, setVoteOverrides] = useState<Record<string, VoteOverride>>({});

  const currentUser = useAuthStore((s) => s.user);
  const entries = useHistoryStore((s) => s.entries);
  const clearAll = useHistoryStore((s) => s.clearAll);
  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((s) => s.videoAutoplayNetwork);
  const { networkType } = useNetworkState();

  const { handleUpvote, handleDownvote } = useVoteHandler({
    onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
      setVoteOverrides((prev) => {
        const existing = prev[targetId];
        return {
          ...prev,
          [targetId]: {
            hasLiked: result.hasLiked,
            hasDisliked: result.hasDisliked,
            likeDelta: (existing?.likeDelta ?? 0) + result.likeDelta,
          },
        };
      });
    }, []),
    onRollback: useCallback((targetId: string) => {
      setVoteOverrides((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    }, []),
  });

  const visibleEntries = useMemo(
    () => entries.filter((e) => !hiddenPostIds.has(e.id)),
    [entries, hiddenPostIds],
  );

  const entriesWithOverrides = useMemo(
    () =>
      visibleEntries.map((entry) => {
        const override = voteOverrides[entry.id];
        if (!override) return entry;
        return {
          ...entry,
          hasLiked: override.hasLiked,
          hasDisliked: override.hasDisliked,
          likes: entry.likes + override.likeDelta,
        };
      }),
    [visibleEntries, voteOverrides],
  );

  const {
    activeVideoPostId,
    allowAutoplay,
    currentState,
    handleMomentumScrollEnd,
    handleRevealContent,
    onViewableItemsChanged,
    revealedPostIds,
    viewabilityConfig,
    visibleVideoPostIds,
  } = usePostListViewability({
    enabled: isFocused,
    autoPlayVideos,
    networkType,
    posts: entriesWithOverrides,
    videoAutoplayNetwork,
  });

  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router],
  );

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      router.push(`/user/${authorId}`);
    },
    [router],
  );

  const handleMorePress = useCallback(
    (postId: string) => {
      const post = entriesWithOverrides.find((p) => p.id === postId);
      if (post) {
        setSelectedPost(post);
        postOptionsSheetRef.current?.present();
      }
    },
    [entriesWithOverrides],
  );

  const handleLikePress = useCallback(
    (
      postId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number,
    ) => {
      requireAuth(() => {
        handleUpvote(postId, currentlyLiked, currentlyDisliked, currentLikes);
      });
    },
    [requireAuth, handleUpvote],
  );

  const handleDislikePress = useCallback(
    (
      postId: string,
      currentlyLiked: boolean,
      currentlyDisliked: boolean,
      currentLikes: number,
    ) => {
      requireAuth(() => {
        handleDownvote(postId, currentlyLiked, currentlyDisliked, currentLikes);
      });
    },
    [requireAuth, handleDownvote],
  );

  const handleCommentPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router],
  );

  const handleEditPost = useCallback(() => {
    if (!selectedPost) return;
    navigateToEditPost(router, selectedPost);
  }, [selectedPost, router]);

  const handleSavePost = useCallback(() => {
    if (!selectedPost) return;
    const saved = useSavedPostsStore.getState().toggleSavePost(selectedPost);
    toast.success(
      saved ? "Post saved" : "Post unsaved",
      saved ? "You can find it in your saved items." : "Removed from saved items.",
    );
  }, [selectedPost, toast]);

  const handleCopyText = useCallback(() => {
    toast.success("Copied", "Text copied to clipboard.");
  }, [toast]);

  const handleClearAll = useCallback(() => {
    clearAll();
    toast.success("History cleared", "Your viewing history has been cleared.");
  }, [clearAll, toast]);

  const renderPostItem = useCallback(
    ({ item }: { item: HistoryEntry }) => (
      <PostCardItem
        post={item}
        isVisible={visibleVideoPostIds.has(item.id)}
        isFocused={activeVideoPostId === item.id}
        screenActive={isFocused && currentState === "active"}
        isOwnPost={currentUser?.id === item.author.id}
        contentRevealed={revealedPostIds.has(item.id)}
        shareUrl={`${getShareBaseUrl(shareServer)}/p/${item.id}`}
        showUrlCard={false}
        allowAutoplay={allowAutoplay}
        onPostPress={handlePostPress}
        onAuthorPress={handleAuthorPress}
        onMorePress={handleMorePress}
        onLikePress={handleLikePress}
        onDislikePress={handleDislikePress}
        onCommentPress={handleCommentPress}
        onRevealContent={handleRevealContent}
      />
    ),
    [
      currentUser?.id,
      shareServer,
      handlePostPress,
      handleAuthorPress,
      handleMorePress,
      handleLikePress,
      handleDislikePress,
      activeVideoPostId,
      allowAutoplay,
      currentState,
      handleCommentPress,
      handleRevealContent,
      isFocused,
      revealedPostIds,
      visibleVideoPostIds,
    ],
  );

  const keyExtractor = useCallback((item: HistoryEntry) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background.default }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.default,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.text.default}
          />
        </Pressable>
        <Text size="lg" weight="bold">
          History
        </Text>
        {entriesWithOverrides.length > 0 ? (
          <Pressable onPress={handleClearAll} style={styles.clearButton}>
            <Text size="md" style={{ color: theme.colors.text.subtle }}>
              Clear
            </Text>
          </Pressable>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      <View style={[styles.headerDivider, { backgroundColor: theme.colors.border.subtle }]} />

      {entriesWithOverrides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Image
            source={emptyInfoImage}
            style={styles.emptyImage}
            contentFit="contain"
          />
          <Text size="lg" weight="bold" style={styles.emptyTitle}>
            No history yet
          </Text>
          <Text size="md" mode="subtle" style={styles.emptySubtitle}>
            Posts you view will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={entriesWithOverrides}
          keyExtractor={keyExtractor}
          renderItem={renderPostItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          showsVerticalScrollIndicator={false}
          windowSize={Platform.OS === "android" ? 11 : 13}
          maxToRenderPerBatch={Platform.OS === "android" ? 7 : 9}
          initialNumToRender={5}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onMomentumScrollEnd={handleMomentumScrollEnd}
        />
      )}

      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={currentUser?.id === selectedPost?.author.id}
        isSaved={selectedPost ? savedPosts.some((p) => p.id === selectedPost.id) : false}
        onSave={handleSavePost}
        onEdit={handleEditPost}
        onCopyText={handleCopyText}
        onDismiss={() => setSelectedPost(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 0,
  },
  headerDivider: {
    height: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  emptyImage: {
    width: 200,
    height: 200,
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: {
    textAlign: "center",
    marginBottom: theme.spacing.xs,
  },
  emptySubtitle: {
    textAlign: "center",
  },
}));
