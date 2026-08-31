import type { Post } from "@/src/components/molecules";
import { isTopicFollowed } from "@/src/domain/topics";

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
  followedTopics: readonly string[],
) {
  return {
    isFollowingUser: selectedPost
      ? followedUsers.includes(selectedPost.author.id)
      : false,
    isTopicFollowed: isTopicFollowed(followedTopics, selectedPost?.topic),
  };
}

type PostCardActionSources = {
  openOptions: (post: Post) => void;
  followUser: (authorId: string, username: string, isFollowing: boolean) => void;
  followTopic: (topic: string, isFollowed: boolean) => void;
  upvote: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
  downvote: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
  requestBlockUser: (authorId: string, username: string) => void;
  requestBlockPost: (postId: string) => void;
  requestBlockTopic: (topic: string) => void;
  requestReportPost: (postId: string) => void;
};

export function createPostCardActionAdapters(sources: PostCardActionSources) {
  return {
    openOptions: sources.openOptions,
    followUser: sources.followUser,
    followTopic: sources.followTopic,
    upvote: sources.upvote,
    downvote: sources.downvote,
    blockUser: (_postId: string, authorId: string, username: string) =>
      sources.requestBlockUser(authorId, username),
    blockPost: (postId: string) => sources.requestBlockPost(postId),
    blockTopic: (_postId: string, topic: string) =>
      sources.requestBlockTopic(topic),
    report: (postId: string) => sources.requestReportPost(postId),
  };
}
