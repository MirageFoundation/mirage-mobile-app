import type { Post } from "@/src/components/molecules";
import { isCommunityJoined } from "@/src/domain/communities";

export type PostActionSelection = { selectedPost: Post | null };

export type PostActionSelectionEvent =
  | { type: "select"; post: Post }
  | { type: "clear" };

export function postActionSelectionReducer(
  state: PostActionSelection,
  event: PostActionSelectionEvent,
): PostActionSelection {
  if (event.type === "select") return { selectedPost: event.post };
  if (state.selectedPost === null) return state;
  return { selectedPost: null };
}

export function isSelectedPostSaved(
  selectedPost: Post | null,
  savedPostIds: ReadonlySet<string>,
): boolean {
  return selectedPost ? savedPostIds.has(selectedPost.id) : false;
}

export function getSelectedPostFollowState(
  selectedPost: Post | null,
  followedUsers: readonly string[],
  joinedCommunities: readonly string[],
) {
  return {
    isFollowingUser: selectedPost
      ? followedUsers.includes(selectedPost.author.id)
      : false,
    isCommunityJoined: isCommunityJoined(joinedCommunities, selectedPost?.community),
  };
}

type PostCardActionSources = {
  openOptions: (post: Post) => void;
  followUser: (authorId: string, username: string, isFollowing: boolean) => void;
  toggleCommunityMembership: (community: string, isJoined: boolean, selection?: { lens: "default" | "raw" | "team"; team_id?: number | null }) => void;
  upvote: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
  downvote: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
  requestBlockUser: (authorId: string, username: string) => void;
  requestBlockPost: (postId: string) => void;
  requestBlockCommunity: (community: string) => void;
  requestReportPost: (postId: string) => void;
};

export function createPostCardActionAdapters(sources: PostCardActionSources) {
  return {
    openOptions: sources.openOptions,
    followUser: sources.followUser,
    toggleCommunityMembership: sources.toggleCommunityMembership,
    upvote: sources.upvote,
    downvote: sources.downvote,
    blockUser: (_postId: string, authorId: string, username: string) =>
      sources.requestBlockUser(authorId, username),
    blockPost: (postId: string) => sources.requestBlockPost(postId),
    blockCommunity: (_postId: string, community: string) =>
      sources.requestBlockCommunity(community),
    report: (postId: string) => sources.requestReportPost(postId),
  };
}
