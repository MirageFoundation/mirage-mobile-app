import { useRouter } from "@/src/navigation/guarded-router";
import { useMemo, useState } from "react";
import { useCommunityTeam, useCommunityTeamHiddenPosts, useCommunityTeamHiddenUsers, useCommunityTeamInvitations } from "@/src/api/read";
import {
  HIDDEN_LIST_INITIAL, HIDDEN_LIST_MORE, canLeaveTeam, canPerformOwnerAction,
  communityPath, curationRole, isRoutableCommunitySlug, normalizeCommunitySlug, requireTeamId,
} from "@/src/domain/communities";
import { useAuthStore } from "@/src/stores";
import { useTeamDetailActions } from "./use-team-detail-actions";

export function useCommunityTeamDetailController(rawSlug?: string, rawTeamId?: string) {
  const slug = normalizeCommunitySlug(rawSlug ?? "");
  const teamId = (() => {
    try { return requireTeamId(rawTeamId); } catch { return null; }
  })();
  const isValid = isRoutableCommunitySlug(slug) && teamId != null;
  const router = useRouter();
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const [userLimit, setUserLimit] = useState(HIDDEN_LIST_INITIAL);
  const [postLimit, setPostLimit] = useState(HIDDEN_LIST_INITIAL);
  const teamQuery = useCommunityTeam(isValid ? slug : undefined, teamId, { enabled: isValid });
  const role = useMemo(() => teamQuery.data?.deleted ? "none" : curationRole({
    owner: teamQuery.data?.owner,
    memberAddresses: teamQuery.data?.members.map(member => member.address),
    viewer: walletAddress,
  }), [teamQuery.data, walletAddress]);
  const authorized = isValid && !!walletAddress && role !== "none";
  const invitationsQuery = useCommunityTeamInvitations(slug, teamId, { viewer: walletAddress, enabled: authorized });
  const hiddenUsersQuery = useCommunityTeamHiddenUsers(slug, teamId, { offset: 0, limit: userLimit }, { viewer: walletAddress, enabled: authorized });
  const hiddenPostsQuery = useCommunityTeamHiddenPosts(slug, teamId, { offset: 0, limit: postLimit }, { viewer: walletAddress, enabled: authorized });
  const actions = useTeamDetailActions({
    slug, teamId, detail: teamQuery.data, viewer: walletAddress,
    invitations: invitationsQuery.data?.items ?? [], onExit: router.back,
  });

  return {
    slug, teamId, isValid, role, actions,
    isOwner: canPerformOwnerAction(role),
    canLeave: canLeaveTeam(role),
    detail: teamQuery.data,
    isLoading: teamQuery.isLoading,
    isError: teamQuery.isError,
    refetch: teamQuery.refetch,
    invitations: invitationsQuery.data?.items ?? [],
    invitationsLoading: invitationsQuery.isLoading,
    invitationsError: invitationsQuery.isError,
    retryInvitations: invitationsQuery.refetch,
    hiddenUsers: hiddenUsersQuery.data?.items ?? [],
    hiddenPosts: hiddenPostsQuery.data?.items ?? [],
    usersLoading: hiddenUsersQuery.isFetching,
    postsLoading: hiddenPostsQuery.isFetching,
    usersError: hiddenUsersQuery.isError,
    postsError: hiddenPostsQuery.isError,
    retryUsers: hiddenUsersQuery.refetch,
    retryPosts: hiddenPostsQuery.refetch,
    usersHasMore: !!hiddenUsersQuery.data?.has_more,
    postsHasMore: !!hiddenPostsQuery.data?.has_more,
    loadMoreUsers: () => setUserLimit(value => value + HIDDEN_LIST_MORE),
    loadMorePosts: () => setPostLimit(value => value + HIDDEN_LIST_MORE),
    openCommunity: () => router.push(communityPath(slug) as never),
  };
}

export type TeamDetailController = ReturnType<typeof useCommunityTeamDetailController>;
