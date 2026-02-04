import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlatList } from "react-native";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  getPosts,
  queryKeys,
  transformApiPosts,
  useInfinitePosts,
  useToggleFollowTopic,
  useToggleFollowUser,
  useUserFollowed,
} from "@/src/api";
import {
  AdultContentPopup,
  ConfirmationPopup,
  FeedHeader,
  type Post,
  PostCardSkeleton,
  PostCardSkeletonList,
  PostOptionsSheet,
  type PostOptionsSheetRef,
  ReportSheet,
  type ReportSheetRef,
  SideMenu,
  type SideMenuRef,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import {
  useAuthGuard,
  useBlockHandler,
  useDeleteHandler,
  useNetworkState,
  useReportHandler,
  useVoteHandler,
  shouldAutoplayVideo,
  type VoteResult,
} from "@/src/hooks";
import {
  HEADER_HEIGHT,
  TAB_BAR_HEIGHT,
  useScrollAnimationContext,
} from "@/src/providers/scroll-animation-context";
import { useToast } from "@/src/providers/toast-provider";
import { HomePostList } from "./home/home-post-list";
import { useHomePostCardStore } from "./home/home-post-card-store";
import {
  getAllowedTagsFromContentTypes,
  getShareBaseUrl,
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
} from "@/src/stores";

export function HomeScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    scrollHandler,
    headerAnimatedStyle,
    registerScrollRef,
    registerRefreshCallback,
  } = useScrollAnimationContext();
  const { requireAuth } = useAuthGuard();
  const toast = useToast();

  // Ref for FlatList to enable scroll-to-top
  const flatListRef = useRef<FlatList<Post> | null>(null);

  // Refs for sheets
  const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);
  const reportSheetRef = useRef<ReportSheetRef>(null);
  const sideMenuRef = useRef<SideMenuRef>(null);

  // Selected post for options
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // Track visible posts inside list component to avoid HomeScreen rerenders.
  // Track user-initiated refresh (tab press or pull-to-refresh)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Global content moderation state (syncs across screens)
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);
  const hidePost = useContentModerationStore((s) => s.hidePost);
  const unhidePost = useContentModerationStore((s) => s.unhidePost);
  const blockUser = useContentModerationStore((s) => s.blockUser);

  const feedType = usePreferencesStore((s) => s.feedType);
  const setFeedType = usePreferencesStore((s) => s.setFeedType);
  const hasSeenAdultPrompt = usePreferencesStore((s) => s.hasSeenAdultPrompt);
  const setHasSeenAdultPrompt = usePreferencesStore(
    (s) => s.setHasSeenAdultPrompt
  );
  const setAdultContent = usePreferencesStore((s) => s.setAdultContent);
  const selectedContentTypes = usePreferencesStore(
    (s) => s.selectedContentTypes
  );
  const shareServer = usePreferencesStore((s) => s.shareServer);
  const autoPlayVideos = usePreferencesStore((s) => s.autoPlayVideos);
  const videoAutoplayNetwork = usePreferencesStore((s) => s.videoAutoplayNetwork);
  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // Network state for video autoplay
  const { networkType } = useNetworkState();

  // Fetch user's followed list (for showing "Following" status on posts)
  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData]
  );
  const followedTopics = useMemo(
    () => followedData?.followed_topics ?? [],
    [followedData]
  );

  // Follow/unfollow mutation
  const toggleFollowMutation = useToggleFollowUser();
  const toggleFollowTopicMutation = useToggleFollowTopic();
  const toggleFollowAsyncRef = useRef(toggleFollowMutation.mutateAsync);

  useEffect(() => {
    toggleFollowAsyncRef.current = toggleFollowMutation.mutateAsync;
  }, [toggleFollowMutation.mutateAsync]);

  // Track which users are currently being followed/unfollowed (for loading state)
  const [followLoadingUsers, setFollowLoadingUsers] = useState<Set<string>>(
    new Set()
  );
  const followLoadingUsersRef = useRef<Set<string>>(new Set());

  // Show adult content popup if user hasn't seen it
  const showAdultPopup = !!currentUser && !hasSeenAdultPrompt;

  const allowedTags = useMemo(
    () => getAllowedTagsFromContentTypes(selectedContentTypes),
    [selectedContentTypes]
  );

  // Map feed type to API sort parameter
  const sortBy = useMemo(() => {
    switch (feedType) {
      case "latest":
        return "newest" as const;
      default:
        // Default to "magic" for algorithm-based feed
        return "magic" as const;
    }
  }, [feedType]);

  // Fetch posts from API
  const {
    data,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePosts({
    limit: 20,
    feed: "home",
    by: sortBy,
    allowed_tags: allowedTags || undefined,
  });

  // Transform API data to UI format
  // Note: isFollowing is handled by HomePostCardItem via the store, not here
  const posts = useMemo(() => {
    if (!data?.pages) return [];
    const allPosts = data.pages.flatMap((page) => page.posts);

    // Deduplicate posts by post_id (in case same post appears in multiple pages)
    const uniquePostsMap = new Map<string, (typeof allPosts)[0]>();
    for (const post of allPosts) {
      if (!uniquePostsMap.has(post.post_id)) {
        uniquePostsMap.set(post.post_id, post);
      }
    }
    const uniquePosts = Array.from(uniquePostsMap.values());

    const transformedPosts = transformApiPosts(uniquePosts);

    // Filter out hidden posts and posts from blocked users
    return transformedPosts.filter(
      (post) =>
        !hiddenPostIds.has(post.id) && !blockedUserIds.has(post.author.id)
    );
  }, [data, hiddenPostIds, blockedUserIds]);

 // Revealed posts for content warnings
 const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

 // Vote overrides are now stored in the home post card store
 const setVoteOverride = useHomePostCardStore((state) => state.setVoteOverride);
 const clearVoteOverride = useHomePostCardStore((state) => state.clearVoteOverride);
 const shouldScrollToTop = useHomePostCardStore((state) => state.shouldScrollToTop);
 const clearScrollToTop = useHomePostCardStore((state) => state.clearScrollToTop);

 // Vote handler with toast notifications
 const { handleUpvote, handleDownvote } = useVoteHandler({
   onOptimisticUpdate: useCallback((targetId: string, result: VoteResult) => {
     setVoteOverride(targetId, {
       hasLiked: result.hasLiked,
       hasDisliked: result.hasDisliked,
       likeDelta: result.likeDelta,
     });
   }, [setVoteOverride]),
   onRollback: useCallback(
     (
       targetId: string,
       previousState: {
         hasLiked: boolean;
         hasDisliked: boolean;
         likes: number;
       }
     ) => {
       // Revert to previous state by removing the override
       clearVoteOverride(targetId);
     },
     [clearVoteOverride]
   ),
 });

  const handleEnableAdultContent = useCallback(() => {
    setAdultContent(true);
    setHasSeenAdultPrompt();
  }, [setAdultContent, setHasSeenAdultPrompt]);

  const handleDeclineAdultContent = useCallback(() => {
    setAdultContent(false);
    setHasSeenAdultPrompt();
  }, [setAdultContent, setHasSeenAdultPrompt]);

  // Side menu handlers
  const handleMenuPress = useCallback(() => {
    sideMenuRef.current?.present();
  }, []);

  const handleMenuSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const handleMenuSubscription = useCallback(() => {
    router.push("/subscription");
  }, [router]);

  const handleMenuSaved = useCallback(() => {
    // TODO: Navigate to saved posts
    console.log("Navigate to saved");
  }, []);

  const handleMenuHistory = useCallback(() => {
    // TODO: Navigate to history
    console.log("Navigate to history");
  }, []);

  const handleMenuDrafts = useCallback(() => {
    // TODO: Navigate to drafts
    console.log("Navigate to drafts");
  }, []);

  const handleMenuNetwork = useCallback(() => {
    // TODO: Navigate to network
    console.log("Navigate to network");
  }, []);

  const handleMenuInvite = useCallback(() => {
    router.push("/invite-and-earn");
  }, [router]);

  const handleMenuHelp = useCallback(() => {
    // TODO: Navigate to help
    console.log("Navigate to help");
  }, []);

  const handleMenuAbout = useCallback(() => {
    // TODO: Navigate to about
    console.log("Navigate to about");
  }, []);

  const handleMenuLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const getFeedTitle = () => {
    switch (feedType) {
      case "popular":
        return "Popular";
      case "latest":
        return "Latest";
      case "news":
        return "News";
      case "watch":
        return "Watch";
      default:
        return "Mirage";
    }
  };

  const handlePostPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router]
  );

  const handleAuthorPress = useCallback((authorId: string) => {
    router.push(`/user/${authorId}`);
  }, [router]);

  const postsByIdRef = useRef<Map<string, Post>>(new Map());

  useEffect(() => {
    const map = new Map<string, Post>();
    for (const post of posts) {
      map.set(post.id, post);
    }
    postsByIdRef.current = map;
  }, [posts]);

  const handleMorePress = useCallback((postId: string) => {
    const post = postsByIdRef.current.get(postId);
    if (post) {
      setSelectedPost(post);
      postOptionsSheetRef.current?.present();
    }
  }, []);

  // Block handler with API integration
  const blockHandler = useBlockHandler({});

  // Report handler with API integration
  const reportHandler = useReportHandler({});

  // Delete handler with API integration
  const deleteHandler = useDeleteHandler({
    onRollback: (targetId, targetType) => {
      if (targetType === "post") {
        unhidePost(targetId);
      }
    },
  });

  // Optimistic confirm handlers - hide content immediately before API call
  const handleConfirmBlock = useCallback(() => {
    const pending = blockHandler.pendingBlock;
    if (pending) {
      // Hide content immediately using global store
      if (pending.type === "user") {
        blockUser(pending.id);
      } else if (pending.type === "post") {
        hidePost(pending.id);
      }
    }
    // Then proceed with API call
    blockHandler.confirmBlock();
  }, [blockHandler, blockUser, hidePost]);

  const handleConfirmDelete = useCallback(() => {
    const pending = deleteHandler.pendingTarget;
    if (pending) {
      // Hide content immediately using global store
      hidePost(pending.id);
    }
    // Then proceed with API call
    deleteHandler.confirmDelete();
  }, [deleteHandler, hidePost]);

  const handleReportSubmitWithOptimistic = useCallback(
    (reason: string) => {
      const pending = reportHandler.pendingTarget;
      if (pending) {
        // Hide content immediately using global store
        hidePost(pending.id);
      }
      // Close the report sheet immediately
      reportSheetRef.current?.dismiss();
      // Then proceed with API call
      reportHandler.submitReport(reason);
    },
    [reportHandler, hidePost]
  );

  // Sync report sheet with hook state
  useEffect(() => {
    if (reportHandler.showReportSheet) {
      reportSheetRef.current?.present();
    }
  }, [reportHandler.showReportSheet]);

  // Post options handlers
  const handleReport = useCallback(() => {
    if (selectedPost) {
      reportHandler.requestReport(selectedPost.id, "post");
    }
  }, [selectedPost, reportHandler]);

  const handleBlockUser = useCallback(() => {
    if (selectedPost) {
      blockHandler.requestBlockUser(
        selectedPost.author.id,
        selectedPost.author.username
      );
    }
  }, [selectedPost, blockHandler]);

  const handleHidePost = useCallback(() => {
    if (selectedPost) {
      blockHandler.requestBlockPost(selectedPost.id);
    }
  }, [selectedPost, blockHandler]);

  const handleBlockUserFromCard = useCallback(
    (postId: string, authorId: string, authorUsername: string) => {
      blockHandler.requestBlockUser(authorId, authorUsername);
    },
    [blockHandler]
  );

  const handleBlockPostFromCard = useCallback(
    (postId: string) => {
      blockHandler.requestBlockPost(postId);
    },
    [blockHandler]
  );

  const handleReportFromCard = useCallback(
    (postId: string) => {
      reportHandler.requestReport(postId, "post");
    },
    [reportHandler]
  );

  const handleDeletePost = useCallback(() => {
    if (selectedPost) {
      deleteHandler.requestDelete(selectedPost.id, "post");
    }
  }, [selectedPost, deleteHandler]);

  const handleSavePost = useCallback(() => {
    // TODO: Call save API
    console.log("Save post:", selectedPost?.id);
    toast.success("Post saved", "You can find it in your saved items.");
  }, [selectedPost?.id, toast]);

  const handleCopyText = useCallback(() => {
    // Toast will be shown after copy (handled in sheet)
    toast.success("Copied", "Text copied to clipboard.");
  }, [toast]);


  const handleFollowTopic = useCallback(() => {
    if (!selectedPost?.topic) return;

    const topic = selectedPost.topic;
    const isCurrentlyFollowed = followedTopics.includes(topic);

    requireAuth(async () => {
      const action = isCurrentlyFollowed ? "Unfollowing" : "Following";
      const actionPast = isCurrentlyFollowed ? "Unfollowed" : "Now following";

      // Show initial loading toast
      const toastId = toast.loading(
        `${action} #${topic}`,
        "Computing proof of work..."
      );

      // Use setTimeout to allow toast to render before heavy operations
      setTimeout(async () => {
        try {
          await toggleFollowTopicMutation.mutateAsync({
            topic,
            isCurrentlyFollowing: isCurrentlyFollowed,
          });

          // Update to success
          toast.update(toastId, {
            type: "success",
            title: `${actionPast} #${topic}`,
            description: undefined,
            duration: 3000,
          });

          // Auto dismiss after duration
          setTimeout(() => toast.dismiss(toastId), 3000);
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const isAlreadyFollowed = errorMessage.toLowerCase().includes("already follow");
          const isNotFollowing =
            errorMessage.toLowerCase().includes("not following") ||
            errorMessage.includes("not in followed");

          if (isAlreadyFollowed) {
            toast.update(toastId, {
              type: "success",
              title: `Already following #${topic}`,
              description: undefined,
              duration: 3000,
            });
            setTimeout(() => toast.dismiss(toastId), 3000);
          } else if (isNotFollowing) {
            toast.update(toastId, {
              type: "success",
              title: `Already not following #${topic}`,
              description: undefined,
              duration: 3000,
            });
            setTimeout(() => toast.dismiss(toastId), 3000);
          } else {
            console.error("Follow/unfollow topic failed:", error);
            toast.update(toastId, {
              type: "error",
              title: `Failed to ${action.toLowerCase()} #${topic}`,
              description: "Please try again",
              duration: 4000,
            });
            setTimeout(() => toast.dismiss(toastId), 4000);
          }
        }
      }, 0);
    });
  }, [
    selectedPost?.topic,
    followedTopics,
    toggleFollowTopicMutation,
    toast,
    requireAuth,
  ]);

  const handleShowFewer = useCallback(() => {
    // TODO: Call show fewer API
    console.log("Show fewer posts like:", selectedPost?.id);
    toast.success("Got it", "We'll show fewer posts like this.");
  }, [selectedPost?.id, toast]);

  const handleCommentPress = useCallback(
    (postId: string) => {
      router.push(`/post/${postId}`);
    },
    [router]
  );

  const handleFollowPress = useCallback(
    (
      authorId: string,
      authorUsername: string,
      isCurrentlyFollowing: boolean
    ) => {
      // Prevent double-clicks while loading
      if (followLoadingUsersRef.current.has(authorId)) {
        return;
      }

      requireAuth(async () => {
        const action = isCurrentlyFollowing ? "Unfollowing" : "Following";
        const actionPast = isCurrentlyFollowing ? "Unfollowed" : "Followed";

        // Show initial loading toast
        const toastId = toast.loading(
          `${action} @${authorUsername}`,
          "Computing proof of work..."
        );

        // Use setTimeout to allow toast to render before heavy operations
        setTimeout(async () => {
          // Add to loading state
          setFollowLoadingUsers((prev) => new Set(prev).add(authorId));

          try {
            await toggleFollowAsyncRef.current({
              userAddress: authorId,
              isCurrentlyFollowing,
            });

            // Update to success
            toast.update(toastId, {
              type: "success",
              title: `${actionPast} @${authorUsername}`,
              description: undefined,
              duration: 3000,
            });

            // Auto dismiss after duration
            setTimeout(() => toast.dismiss(toastId), 3000);
          } catch (error: unknown) {
          // Handle "already followed" or "not following" errors gracefully
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const isAlreadyFollowed = errorMessage.toLowerCase().includes("already follow");
          const isNotFollowing =
            errorMessage.toLowerCase().includes("not following") ||
            errorMessage.includes("not in followed");

          if (isAlreadyFollowed) {
            // Not a real error - show success
            toast.update(toastId, {
              type: "success",
              title: `Already following @${authorUsername}`,
              description: undefined,
              duration: 3000,
            });
            setTimeout(() => toast.dismiss(toastId), 3000);
          } else if (isNotFollowing) {
            // Not a real error - show success
            toast.update(toastId, {
              type: "success",
              title: `Already not following @${authorUsername}`,
              description: undefined,
              duration: 3000,
            });
            setTimeout(() => toast.dismiss(toastId), 3000);
          } else {
            // Actual error
            console.error("Follow/unfollow failed:", error);
            toast.update(toastId, {
              type: "error",
              title: `Failed to ${action.toLowerCase()} @${authorUsername}`,
              description: "Please try again",
              duration: 4000,
            });
            setTimeout(() => toast.dismiss(toastId), 4000);
          }
        } finally {
          // Remove from loading state
          setFollowLoadingUsers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(authorId);
            return newSet;
          });
        }
        }, 0);
      });
    },
    [requireAuth, toast]
  );

  const handleFollowUserFromSheet = useCallback(() => {
    if (!selectedPost) return;
    const authorId = selectedPost.author.id;
    const authorUsername = selectedPost.author.username;
    const isCurrentlyFollowing = followedUsers.includes(authorId);
    handleFollowPress(authorId, authorUsername, isCurrentlyFollowing);
  }, [selectedPost, followedUsers, handleFollowPress]);

  const handleFollowTopicFromCard = useCallback(
    (topic: string, isCurrentlyFollowed: boolean) => {
      requireAuth(async () => {
        const action = isCurrentlyFollowed ? "Unfollowing" : "Following";
        const actionPast = isCurrentlyFollowed ? "Unfollowed" : "Now following";

        // Show initial loading toast
        const toastId = toast.loading(
          `${action} #${topic}`,
          "Computing proof of work..."
        );

        // Use setTimeout to allow toast to render before heavy operations
        setTimeout(async () => {
          try {
            await toggleFollowTopicMutation.mutateAsync({
              topic,
              isCurrentlyFollowing: isCurrentlyFollowed,
            });

            // Update to success
            toast.update(toastId, {
              type: "success",
              title: `${actionPast} #${topic}`,
              description: undefined,
              duration: 3000,
            });

            // Auto dismiss after duration
            setTimeout(() => toast.dismiss(toastId), 3000);
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const isAlreadyFollowed = errorMessage.toLowerCase().includes("already follow");
            const isNotFollowing =
              errorMessage.toLowerCase().includes("not following") ||
              errorMessage.includes("not in followed");

            if (isAlreadyFollowed || isNotFollowing) {
              toast.update(toastId, {
                type: "success",
                title: isAlreadyFollowed
                  ? `Already following #${topic}`
                  : `Already not following #${topic}`,
                description: undefined,
                duration: 3000,
              });
              setTimeout(() => toast.dismiss(toastId), 3000);
            } else {
              console.error("Follow/unfollow topic failed:", error);
              toast.update(toastId, {
                type: "error",
                title: `Failed to ${action.toLowerCase()} #${topic}`,
                description: "Please try again",
                duration: 4000,
              });
              setTimeout(() => toast.dismiss(toastId), 4000);
            }
          }
        }, 0);
      });
    },
    [requireAuth, toast, toggleFollowTopicMutation]
  );

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((prev) => {
      const newSet = new Set(prev);
      newSet.add(postId);
      return newSet;
    });
  }, []);

  // Debounce ref to prevent multiple fetches
  const lastFetchTime = useRef(0);
  const isFetchingRef = useRef(false);
  const initialLoadCompleteRef = useRef(false);

  // Mark initial load as complete once we have posts
  useEffect(() => {
    if (posts.length > 0 && !isLoading) {
      // Delay to ensure FlatList has finished initial layout
      const timer = setTimeout(() => {
        initialLoadCompleteRef.current = true;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [posts.length, isLoading]);

  // Reset initial load flag when feed type changes (new query)
  useEffect(() => {
    initialLoadCompleteRef.current = false;
  }, [sortBy]);

 const handleRefresh = useCallback(async () => {
   // Reset initial load flag so pagination protection kicks in again
   initialLoadCompleteRef.current = false;

   // Show the refresh indicator
   setIsManualRefreshing(true);

   try {
     // Fetch only the first page to check for new posts
     const newFirstPage = await getPosts({
       limit: 20,
       feed: "home",
       by: sortBy,
       allowed_tags: allowedTags || undefined,
       address: currentUser?.walletAddress,
       page: 1,
     });

     // Get the query key for the infinite posts query
     const postsQueryKey = queryKeys.posts({
       limit: 20,
       feed: "home",
       by: sortBy,
       allowed_tags: allowedTags || undefined,
       address: currentUser?.walletAddress,
       page: undefined,
     });

     // Update the cache - replace only the first page, keep the rest
     queryClient.setQueryData(postsQueryKey, (oldData: any) => {
       if (!oldData) {
         return {
           pages: [newFirstPage],
           pageParams: [1],
         };
       }
       return {
         ...oldData,
         pages: [newFirstPage, ...oldData.pages.slice(1)],
         pageParams: [1, ...oldData.pageParams.slice(1)],
       };
     });
   } catch (error) {
     console.error("Failed to refresh feed:", error);
   } finally {
     // Hide the refresh indicator
     setIsManualRefreshing(false);
   }
 }, [queryClient, sortBy, allowedTags, currentUser?.walletAddress]);

 // Register scroll ref and refresh callback for tab press scroll-to-top
  useEffect(() => {
    registerScrollRef(flatListRef.current);
    registerRefreshCallback(handleRefresh);
  }, [registerScrollRef, registerRefreshCallback, handleRefresh]);

  // Listen for scroll to top trigger (e.g., after creating a new post)
  useEffect(() => {
    if (shouldScrollToTop && flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: true });
      clearScrollToTop();
    }
  }, [shouldScrollToTop, clearScrollToTop]);

  useEffect(() => {
    followLoadingUsersRef.current = followLoadingUsers;
  }, [followLoadingUsers]);

  const handleEndReached = useCallback(() => {
    const now = Date.now();
    // Only fetch if:
    // 1. Initial load is complete (prevents fetching during first render)
    // 2. We have at least 15 posts (fetch more when near 15th post of 20)
    // 3. There are more pages to fetch
    // 4. Not currently fetching
    // 5. At least 1 second has passed since last fetch (debounce)
    // 6. Not already in a fetch cycle (extra guard)
    if (
      initialLoadCompleteRef.current &&
      posts.length >= 15 &&
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
  }, [posts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return <PostCardSkeletonList count={5} />;
    }

    if (isError) {
      return (
        <Box flex center p="lg" style={{ paddingTop: 100 }}>
          <Text size="lg" weight="medium" mode="subtle">
            Failed to load posts
          </Text>
          <Text
            size="sm"
            mode="subtle"
            style={{ marginTop: 8, textAlign: "center" }}
          >
            {error?.message || "Something went wrong. Pull to refresh."}
          </Text>
        </Box>
      );
    }

    return (
      <Box flex center p="lg" style={{ paddingTop: 100 }}>
        <Text size="lg" weight="medium" mode="subtle">
          No posts yet
        </Text>
        <Text
          size="sm"
          mode="subtle"
          style={{ marginTop: 8, textAlign: "center" }}
        >
          Be the first to share something interesting!
        </Text>
      </Box>
    );
  }, [isLoading, isError, error]);

 const ListHeaderComponent = useCallback(() => {
    if (!isManualRefreshing) return null;
   return (
     <Box center p="md">
       <ActivityIndicator
         size="small"
         color={theme.colors.background.emphasis}
       />
     </Box>
   );
  }, [isManualRefreshing, theme.colors.background.emphasis]);

  // Show skeleton when loading next page
  const ListFooterComponent = useCallback(() => {
    if (isFetchingNextPage) {
      return <PostCardSkeleton showMedia={false} showBody={true} />;
    }
    return <Box p="sm" />;
  }, [isFetchingNextPage]);

  const listContentStyle = useMemo(
    () => ({
      paddingTop: insets.top + HEADER_HEIGHT,
      paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16,
      flexGrow: posts.length === 0 ? 1 : undefined,
    }),
    [insets.bottom, insets.top, posts.length]
  );

  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={false}
        onRefresh={handleRefresh}
        tintColor="transparent"
        progressViewOffset={insets.top + HEADER_HEIGHT}
      />
    ),
    [handleRefresh, insets.top]
  );

  const setCurrentUserId = useHomePostCardStore(
    (state) => state.setCurrentUserId
  );
  const setFollowedUsers = useHomePostCardStore(
    (state) => state.setFollowedUsers
  );
  const setFollowedTopicsStore = useHomePostCardStore(
    (state) => state.setFollowedTopics
  );
  const setFollowLoadingUsersStore = useHomePostCardStore(
    (state) => state.setFollowLoadingUsers
  );
  const setRevealedPostsStore = useHomePostCardStore(
    (state) => state.setRevealedPosts
  );
  const setHandlers = useHomePostCardStore((state) => state.setHandlers);
  const setShareServer = useHomePostCardStore((state) => state.setShareServer);
  const setAllowAutoplay = useHomePostCardStore((state) => state.setAllowAutoplay);
  const setFeedActive = useHomePostCardStore((state) => state.setFeedActive);

  const followedUsersSet = useMemo(() => new Set(followedUsers), [followedUsers]);
  const followedTopicsSet = useMemo(() => new Set(followedTopics), [followedTopics]);

  // Compute whether autoplay is allowed based on settings and network
  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, videoAutoplayNetwork, networkType]
  );

  useEffect(() => {
    setCurrentUserId(currentUser?.id);
  }, [currentUser?.id, setCurrentUserId]);

  useEffect(() => {
    setFollowedUsers(followedUsersSet);
  }, [followedUsersSet, setFollowedUsers]);

  useEffect(() => {
    setFollowedTopicsStore(followedTopicsSet);
  }, [followedTopicsSet, setFollowedTopicsStore]);

  useEffect(() => {
    setFollowLoadingUsersStore(followLoadingUsers);
  }, [followLoadingUsers, setFollowLoadingUsersStore]);

  useEffect(() => {
    setRevealedPostsStore(revealedPosts);
 }, [revealedPosts, setRevealedPostsStore]);

 useEffect(() => {
   setShareServer(shareServer);
 }, [shareServer, setShareServer]);

 useEffect(() => {
   setAllowAutoplay(allowAutoplay);
 }, [allowAutoplay, setAllowAutoplay]);

  useFocusEffect(
    useCallback(() => {
      setFeedActive(true);
      return () => {
        setFeedActive(false);
      };
    }, [setFeedActive])
  );

// Store refs to latest handlers - these update without triggering re-renders
const handlersRef = useRef({
  handlePostPress,
  handleAuthorPress,
  handleMorePress,
  handleUpvote,
  handleDownvote,
  handleCommentPress,
  handleFollowPress,
  handleFollowTopicFromCard,
  handleRevealContent,
  handleBlockUserFromCard,
  handleBlockPostFromCard,
  handleReportFromCard,
});

// Keep refs updated
useEffect(() => {
  handlersRef.current = {
    handlePostPress,
    handleAuthorPress,
    handleMorePress,
    handleUpvote,
    handleDownvote,
    handleCommentPress,
    handleFollowPress,
    handleFollowTopicFromCard,
    handleRevealContent,
    handleBlockUserFromCard,
    handleBlockPostFromCard,
    handleReportFromCard,
  };
});

// Set handlers ONCE on mount with stable wrapper functions that delegate to refs
useEffect(() => {
  setHandlers({
    onPostPress: (postId) => handlersRef.current.handlePostPress(postId),
    onAuthorPress: (authorId) => handlersRef.current.handleAuthorPress(authorId),
    onMorePress: (postId) => handlersRef.current.handleMorePress(postId),
    onLikePress: (postId, liked, disliked, likes) =>
      handlersRef.current.handleUpvote(postId, liked, disliked, likes),
    onDislikePress: (postId, liked, disliked, likes) =>
    handlersRef.current.handleDownvote(postId, liked, disliked, likes),
  onCommentPress: (postId) => handlersRef.current.handleCommentPress(postId),
  onFollowUser: (authorId, username, isFollowing) =>
    handlersRef.current.handleFollowPress(authorId, username, isFollowing),
  onFollowTopic: (topic, isFollowed) =>
    handlersRef.current.handleFollowTopicFromCard(topic, isFollowed),
  onRevealContent: (postId) => handlersRef.current.handleRevealContent(postId),
  onBlockUser: (postId, authorId, authorUsername) =>
    handlersRef.current.handleBlockUserFromCard(postId, authorId, authorUsername),
  onBlockPost: (postId) => handlersRef.current.handleBlockPostFromCard(postId),
  onReport: (postId) => handlersRef.current.handleReportFromCard(postId),
});
}, [setHandlers]); // Only run once - setHandlers is stable

  return (
    <Box flex background="base">
      {/* Fixed Status Bar Background */}
      <View style={[styles.statusBarBackground, { height: insets.top }]} />

      {/* Animated Header */}
      <FeedHeader
        title={getFeedTitle()}
        feedType={feedType}
        onFeedTypeChange={setFeedType}
        onMenuPress={handleMenuPress}
        onSearchPress={() => router.push("/search")}
        animatedStyle={headerAnimatedStyle}
      />

      {/* Scrollable Feed */}
      <HomePostList
        ref={flatListRef}
        data={posts}
        contentContainerStyle={listContentStyle}
        onScroll={scrollHandler}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        refreshControl={refreshControl}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
      />

      {/* Adult Content Permission Popup */}
      <AdultContentPopup
        visible={showAdultPopup}
        onEnable={handleEnableAdultContent}
        onDecline={handleDeclineAdultContent}
      />

      {/* Post Options Sheet */}
      <PostOptionsSheet
        ref={postOptionsSheetRef}
        post={selectedPost}
        isOwnPost={currentUser?.id === selectedPost?.author.id}
        isTopicFollowed={
          selectedPost?.topic
            ? followedTopics.includes(selectedPost.topic)
            : false
        }
        isFollowingUser={
          selectedPost?.author.id
            ? followedUsers.includes(selectedPost.author.id)
            : false
        }
        onShowFewer={handleShowFewer}
        onFollowUser={handleFollowUserFromSheet}
        onFollowTopic={handleFollowTopic}
        onSave={handleSavePost}
        onCopyText={handleCopyText}
        onReport={handleReport}
        onBlockUser={handleBlockUser}
        onHidePost={handleHidePost}
        onDelete={handleDeletePost}
        onDismiss={() => setSelectedPost(null)}
      />

      {/* Report Sheet */}
      <ReportSheet
        ref={reportSheetRef}
        targetType="post"
        onSubmit={handleReportSubmitWithOptimistic}
        onDismiss={reportHandler.cancelReport}
        isLoading={reportHandler.isReporting}
      />

      {/* Block User Confirmation Popup */}
      <ConfirmationPopup
        visible={blockHandler.showConfirmation}
        title={`Block ${blockHandler.pendingBlock?.label || "user"}?`}
        message="You won't see their content anymore."
        description="You can unblock them later from settings."
        icon="ban-outline"
        confirmText="Block"
        isDestructive
        onConfirm={handleConfirmBlock}
        onCancel={blockHandler.cancelBlock}
      />

      {/* Delete Post Confirmation Popup */}
      <ConfirmationPopup
        visible={deleteHandler.showConfirmation}
        title="Delete this post?"
        message="This action cannot be undone."
        description="Your post will be permanently removed."
        icon="trash-outline"
        confirmText="Delete"
        isDestructive
        onConfirm={handleConfirmDelete}
        onCancel={deleteHandler.cancelDelete}
      />

      {/* Side Menu */}
      <SideMenu
        ref={sideMenuRef}
        onSettings={handleMenuSettings}
        onSubscription={handleMenuSubscription}
        onSaved={handleMenuSaved}
        onHistory={handleMenuHistory}
        onDrafts={handleMenuDrafts}
        onNetwork={handleMenuNetwork}
        onInviteAndEarn={handleMenuInvite}
        onHelp={handleMenuHelp}
        onAbout={handleMenuAbout}
        onLogout={handleMenuLogout}
      />
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
}));
