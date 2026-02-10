import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
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

const emptyInfoImage = require("@/assets/images/empty-info.png");

type VoteOverride = {
  hasLiked: boolean;
  hasDisliked: boolean;
  likeDelta: number;
};

export function SavedPostsScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { requireAuth } = useAuthGuard();

  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [voteOverrides, setVoteOverrides] = useState<Record<string, VoteOverride>>({});

  const currentUser = useAuthStore((s) => s.user);
  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const shareServer = usePreferencesStore((s) => s.shareServer);

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

  const visiblePosts = useMemo(
    () => savedPosts.filter((p) => !hiddenPostIds.has(p.id)),
    [savedPosts, hiddenPostIds],
  );

  const postsWithOverrides = useMemo(
    () =>
      visiblePosts.map((post) => {
        const override = voteOverrides[post.id];
        if (!override) return post;
        return {
          ...post,
          hasLiked: override.hasLiked,
          hasDisliked: override.hasDisliked,
          likes: post.likes + override.likeDelta,
        };
      }),
    [visiblePosts, voteOverrides],
  );

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
      const post = postsWithOverrides.find((p) => p.id === postId);
      if (post) {
        setSelectedPost(post);
        postOptionsSheetRef.current?.present();
      }
    },
    [postsWithOverrides],
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

  const renderItem = useCallback(
    ({ item }: { item: Post }) => (
      <PostCardItem
        post={item}
        isOwnPost={currentUser?.id === item.author.id}
        shareUrl={`${getShareBaseUrl(shareServer)}/view_post?post_id=${item.id}`}
        showUrlCard={false}
        onPostPress={handlePostPress}
        onAuthorPress={handleAuthorPress}
        onMorePress={handleMorePress}
        onLikePress={handleLikePress}
        onDislikePress={handleDislikePress}
        onCommentPress={handleCommentPress}
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
      handleCommentPress,
    ],
  );

  const keyExtractor = useCallback((item: Post) => item.id, []);

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
          Saved Posts
        </Text>
        <View style={styles.placeholder} />
      </View>

      {postsWithOverrides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Image
            source={emptyInfoImage}
            style={styles.emptyImage}
            contentFit="contain"
          />
          <Text size="lg" weight="bold" style={styles.emptyTitle}>
            No saved posts yet
          </Text>
          <Text size="md" mode="subtle" style={styles.emptySubtitle}>
            Posts you save will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={postsWithOverrides}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={currentUser?.id === selectedPost?.author.id}
        isSaved={selectedPost ? useSavedPostsStore.getState().isPostSaved(selectedPost.id) : false}
        onSave={handleSavePost}
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
    borderBottomWidth: 1,
  },
  backButton: {
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
