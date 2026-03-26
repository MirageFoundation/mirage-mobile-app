import { type Post } from "@/src/components/molecules";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useMemo, useState } from "react";

interface PostVoteHandlerLike {
  handleUpvote: (
    targetId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number,
  ) => void;
  handleDownvote: (
    targetId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number,
  ) => void;
}

interface UsePostDetailPostInteractionsParams {
  displayPost: Post | null;
  followedTopics: string[];
  handleFollowTopicViaQueue: (topic: string, isCurrentlyFollowed: boolean) => void;
  handleFollowUserViaQueue: (
    authorId: string,
    authorUsername: string,
    isCurrentlyFollowing: boolean,
  ) => void;
  localPostUpdates: Partial<Post>;
  localTopicFollowed: boolean | null;
  postVoteHandler: PostVoteHandlerLike;
  revealInitially: boolean;
}

export function usePostDetailPostInteractions({
  displayPost,
  followedTopics,
  handleFollowTopicViaQueue,
  handleFollowUserViaQueue,
  localPostUpdates,
  localTopicFollowed,
  postVoteHandler,
  revealInitially,
}: UsePostDetailPostInteractionsParams) {
  const router = useRouter();
  const [revealedContent, setRevealedContent] = useState(revealInitially);

  const handleLikePost = useCallback(() => {
    if (!displayPost) return;

    postVoteHandler.handleUpvote(
      displayPost.id,
      displayPost.hasLiked ?? false,
      displayPost.hasDisliked ?? false,
      displayPost.likes,
    );
  }, [displayPost, postVoteHandler]);

  const handleDislikePost = useCallback(() => {
    if (!displayPost) return;

    postVoteHandler.handleDownvote(
      displayPost.id,
      displayPost.hasLiked ?? false,
      displayPost.hasDisliked ?? false,
      displayPost.likes,
    );
  }, [displayPost, postVoteHandler]);

  const handleAuthorPress = useCallback(
    (authorId: string) => {
      router.push(`/user/${authorId}`);
    },
    [router],
  );

  const handleTopicPress = useCallback(() => {
    if (!displayPost?.topic) return;
    router.push(`/topic/${encodeURIComponent(displayPost.topic)}`);
  }, [displayPost?.topic, router]);

  const handleFollowPost = useCallback(() => {
    if (!displayPost) return;

    const authorId = displayPost.author.id;
    const authorUsername = displayPost.author.username;
    const isCurrentlyFollowing =
      localPostUpdates.isFollowing ?? displayPost.isFollowing ?? false;

    handleFollowUserViaQueue(authorId, authorUsername, isCurrentlyFollowing);
  }, [displayPost, handleFollowUserViaQueue, localPostUpdates.isFollowing]);

  const handleFollowTopic = useCallback(() => {
    if (!displayPost?.topic) return;
    const isCurrentlyFollowed =
      localTopicFollowed ?? followedTopics.includes(displayPost.topic);
    handleFollowTopicViaQueue(displayPost.topic, isCurrentlyFollowed);
  }, [displayPost?.topic, followedTopics, handleFollowTopicViaQueue, localTopicFollowed]);

  const handleRevealContent = useCallback(() => {
    setRevealedContent(true);
  }, []);

  const isTopicFollowed = useMemo(
    () =>
      localTopicFollowed ??
      (displayPost?.topic ? followedTopics.includes(displayPost.topic) : false),
    [displayPost?.topic, followedTopics, localTopicFollowed],
  );

  const postThumbnail = displayPost?.media?.[0]?.uri;

  return {
    handleAuthorPress,
    handleDislikePost,
    handleFollowPost,
    handleFollowTopic,
    handleLikePost,
    handleRevealContent,
    handleTopicPress,
    isTopicFollowed,
    postThumbnail,
    revealedContent,
  };
}
