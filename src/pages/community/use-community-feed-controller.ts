import { navigateToEditPost } from "@/src/utils/edit-post";
import { markSeen } from "@/src/services/seen-posts";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import { useRouter } from "@/src/navigation/guarded-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import {
  transformApiPosts,
  useCommunity,
  useCommunityTeams,
  useInfinitePosts,
  useUserFollowed,
} from "@/src/api";
import { useSetCommunityPreference } from "@/src/api/write";
import type { Post } from "@/src/components/molecules";
import {
  buildJoinedCommunitySet,
  communityPath,
  communityTeamsPath,
  isCommunityJoined,
  isRoutableCommunitySlug,
  normalizeCommunitySlug,
  type CommunityDetail,
} from "@/src/domain/communities";
import { useAuthGuard } from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import { usePostActionController } from "../post/use-post-action-controller";
import {
  getAllowedTagsFromContentTypes,
  useAuthStore,
  useContentModerationStore,
  useFeedScrollStore,
  useLensPicksStore,
  usePreferencesStore,
  useSavedPostsStore,
} from "@/src/stores";
import {
  collectDetailTeamLensOptions,
  collectTeamListLensOptions,
  type CommunityLensChoice,
} from "./community-lens-picker";

export function useCommunityFeedController(rawSlug?: string) {
  const slug = normalizeCommunitySlug(
    (() => {
      try {
        return decodeURIComponent(rawSlug ?? "");
      } catch {
        return rawSlug ?? "";
      }
    })(),
  );
  const isValidSlug = isRoutableCommunitySlug(slug);
  const router = useRouter();
  const toast = useToast();
  const { requireAuth } = useAuthGuard();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const savedPosts = useSavedPostsStore((s) => s.savedPosts);
  const hiddenPostIds = useContentModerationStore((s) => s.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((s) => s.blockedUserIds);
  const blockedCommunityNames = useContentModerationStore((s) => s.blockedCommunityNames);
  const hidePost = useContentModerationStore((s) => s.hidePost);
  const unhidePost = useContentModerationStore((s) => s.unhidePost);
  const blockUser = useContentModerationStore((s) => s.blockUser);
  const blockCommunityOptimistic = useContentModerationStore((s) => s.blockCommunity);
  const selectedContentTypes = usePreferencesStore((s) => s.selectedContentTypes);
  const adultContentEnabled = usePreferencesStore((s) => s.adultContentEnabled);
  const hideDownvotedPosts = usePreferencesStore((s) => s.hideDownvotedPosts);
  const setContextScrolling = useFeedScrollStore((state) => state.setContextScrolling);
  const setPick = useLensPicksStore((s) => s.setPick);
  const sessionPick = useLensPicksStore((s) => {
    const viewer = walletAddress?.trim().toLowerCase() || "anonymous";
    return s.picksByViewer[viewer]?.find((entry) => entry.community === slug);
  });
  const { mutate: persistPreference } = useSetCommunityPreference();

  const [sortBy, setSortBy] = useState<"magic" | "newest">("magic");
  const [userLensChoice, setUserLensChoice] = useState<CommunityLensChoice | null>(null);
  const [optimisticJoined, setOptimisticJoined] = useState<boolean | null>(null);
  const [followUserOverrides, setFollowUserOverrides] = useState<Record<string, boolean>>({});
  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const {
    data: detail,
    isLoading: isDetailLoading,
    isError: isDetailError,
    error: detailError,
    refetch: refetchDetail,
  } = useCommunity(isValidSlug ? slug : undefined, {
    viewer: walletAddress,
    enabled: isValidSlug,
  });
  const { data: teams } = useCommunityTeams(isValidSlug ? slug : undefined, {
    viewer: walletAddress,
    enabled: isValidSlug,
  });

  const allowedTags = useMemo(
    () => getAllowedTagsFromContentTypes(selectedContentTypes, adultContentEnabled),
    [selectedContentTypes, adultContentEnabled],
  );
  const teamOptions = useMemo(() => {
    const fromList = collectTeamListLensOptions(teams?.items);
    return fromList.length > 0 ? fromList : collectDetailTeamLensOptions(detail);
  }, [detail, teams?.items]);
  const lensChoice = useMemo<CommunityLensChoice>(() => (
    userLensChoice
      ?? (sessionPick
        ? { lens: sessionPick.lens, team_id: sessionPick.team_id }
        : storedLensChoice(detail, teamOptions))
      ?? { lens: "default", team_id: null }
  ), [detail, sessionPick, teamOptions, userLensChoice]);

  const {
    data,
    isLoading: isFeedLoading,
    isError: isFeedError,
    error: feedError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchFeed,
  } = useInfinitePosts({
    limit: 10,
    community: isValidSlug ? slug : undefined,
    allowed_tags: allowedTags || undefined,
    by: sortBy,
    lens: lensChoice.lens,
    team_id: lensChoice.team_id,
  }, { enabled: isValidSlug, pageLimit: 20 });

  const { data: followedData } = useUserFollowed();
  const followedUsers = useMemo(
    () => followedData?.followed_users ?? [],
    [followedData],
  );
  const joinedCommunities = useMemo(
    () => followedData?.joined_communities ?? [],
    [followedData],
  );
  const isJoined = optimisticJoined
    ?? detail?.viewer_joined
    ?? isCommunityJoined(joinedCommunities, slug);

  const postEditOverrides = usePostEditStore((s) => s.overrides);
  const posts = useMemo(() => {
    if (!data?.pages) return [];
    const allPosts = data.pages.flatMap((page) => page.posts);
    const uniquePostsMap = new Map<string, (typeof allPosts)[0]>();
    for (const post of allPosts) {
      if (!uniquePostsMap.has(post.post_id)) uniquePostsMap.set(post.post_id, post);
    }
    const uniquePosts = Array.from(uniquePostsMap.values());
    const filteredPosts = hideDownvotedPosts
      ? uniquePosts.filter((post) => post.user_vote !== -1)
      : uniquePosts;
    const patchedPosts = filteredPosts.map((post) => {
      const ov = postEditOverrides[post.post_id];
      if (!ov) return post;
      return {
        ...post,
        title: ov.title,
        content: ov.content,
        community: ov.community ?? post.community,
        media: ov.media ?? post.media,
      };
    });
    return transformApiPosts(patchedPosts, {
      currentUser: currentUser ? { id: currentUser.id, username: currentUser.username } : undefined,
    }).filter(
      (post) =>
        !hiddenPostIds.has(post.id) &&
        !blockedUserIds.has(post.author.id) &&
        !(post.community && blockedCommunityNames.has(post.community.toLowerCase())),
    );
  }, [
    blockedCommunityNames,
    blockedUserIds,
    currentUser,
    data,
    hiddenPostIds,
    hideDownvotedPosts,
    postEditOverrides,
  ]);

  const displayFollowedUsers = useMemo(() => {
    const next = new Set(followedUsers);
    for (const [userId, isFollowing] of Object.entries(followUserOverrides)) {
      if (isFollowing) next.add(userId);
      else next.delete(userId);
    }
    return Array.from(next);
  }, [followedUsers, followUserOverrides]);

  const postActions = usePostActionController({
    currentUserId: currentUser?.id,
    followedUsers: displayFollowedUsers,
    joinedCommunities,
    savedPostIds: new Set(savedPosts.map((post) => post.id)),
    onFollowUserOptimistic: (userId, isFollowing) => {
      setFollowUserOverrides((current) => ({ ...current, [userId]: isFollowing }));
    },
    onFollowUserRollback: (userId) => {
      setFollowUserOverrides((current) => {
        const { [userId]: _, ...rest } = current;
        return rest;
      });
    },
    onJoinCommunityOptimistic: (_community, joined) => setOptimisticJoined(joined),
    onJoinCommunityRollback: () => setOptimisticJoined(null),
    onVoteOptimistic: () => {},
    onVoteRollback: () => {},
    onBlockConfirmed: (pending) => {
      if (pending.type === "user") blockUser(pending.id);
      else if (pending.type === "post") hidePost(pending.id);
      else if (pending.type === "community") blockCommunityOptimistic(pending.id);
    },
    onDeleteConfirmed: hidePost,
    onDeleteRollback: unhidePost,
    onReportSubmitted: hidePost,
    onEditPost: (post) => navigateToEditPost(router, post),
    onToggleSave: (post) => useSavedPostsStore.getState().toggleSavePost(post),
    onSaveChanged: (saved) => {
      toast.success(
        saved ? "Post saved" : "Post unsaved",
        saved ? "You can find it in your saved items." : "Removed from saved items.",
      );
    },
    onCopyText: () => toast.success("Copied", "Text copied to clipboard."),
    onShowFewer: () => toast.success("Got it", "We'll show fewer posts like this."),
  });

  const handleSortChange = useCallback((value: "magic" | "newest") => {
    const oldFeedContext = `community:${slug}:${sortBy}`;
    const newFeedContext = `community:${slug}:${value}`;
    setContextScrolling(oldFeedContext, false);
    setContextScrolling(newFeedContext, false);
    setSortBy(value);
  }, [setContextScrolling, slug, sortBy]);

  const handleLensChange = useCallback((choice: CommunityLensChoice) => {
    setUserLensChoice(choice);
    if (isJoined) {
      persistPreference({ community: slug, selection: choice });
    } else {
      setPick({
        viewer: walletAddress,
        community: slug,
        lens: choice.lens,
        team_id: choice.team_id,
      });
    }
  }, [isJoined, persistPreference, setPick, slug, walletAddress]);

  const handleJoinToggle = useCallback(() => {
    requireAuth(() => {
      postActions.cardActions.toggleCommunityMembership(slug, isJoined, isJoined ? undefined : lensChoice);
    });
  }, [isJoined, lensChoice, postActions.cardActions, requireAuth, slug]);

  const handleCommunityPress = useCallback((community: string) => {
    router.push(communityPath(community) as never);
  }, [router]);

  const handleTeamsPress = useCallback(() => {
    router.push(communityTeamsPath(slug) as never);
  }, [router, slug]);

  const handlePostPress = useCallback((postId: string) => {
    markSeen(postId, "open");
    router.push(`/post/${postId}?syncContext=${encodeURIComponent(`community:${slug}:${sortBy}`)}`);
  }, [router, slug, sortBy]);

  const handleAuthorPress = useCallback((authorId: string) => {
    router.push(`/user/${authorId}`);
  }, [router]);

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPosts((prev) => new Set(prev).add(postId));
  }, []);

  const handleMorePress = useCallback((post: Post) => {
    requireAuth(() => postActions.cardActions.openOptions(post));
  }, [postActions.cardActions, requireAuth]);

  return {
    slug,
    isValidSlug,
    detail,
    isDetailLoading,
    isDetailError,
    detailError,
    refetchDetail,
    posts,
    isFeedLoading,
    isFeedError,
    feedError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetchFeed,
    sortBy,
    handleSortChange,
    isJoined,
    lensChoice,
    teamOptions,
    handleLensChange,
    handleJoinToggle,
    handleTeamsPress,
    handleCommunityPress,
    handlePostPress,
    handleAuthorPress,
    handleRevealContent,
    handleMorePress,
    revealedPosts,
    followUserOverrides,
    followedUsers,
    joinedCommunities: buildJoinedCommunitySet(joinedCommunities),
    postActions,
    queryClient,
    allowedTags,
    currentUser,
    shareServer: usePreferencesStore.getState().apiServer,
  };
}

function storedLensChoice(
  detail: CommunityDetail | undefined,
  teamOptions: { teamId: number }[],
): CommunityLensChoice | null {
  if (!detail?.viewer_joined) return null;
  if (detail.stored_mode === 2) return { lens: "raw", team_id: null };
  if (detail.stored_mode === 1) {
    const teamId = Number(detail.stored_team_id);
    if (teamOptions.some((option) => option.teamId === teamId)) {
      return { lens: "team", team_id: teamId };
    }
  }
  if (detail.stored_mode === 0) return { lens: "default", team_id: null };
  return null;
}
