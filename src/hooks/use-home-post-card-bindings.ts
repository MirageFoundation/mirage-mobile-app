import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo } from "react";

import type { Post } from "@/src/domain/posts/types";
import { useTimeTickStore } from "@/src/stores";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import type { ShareServer } from "@/src/stores/preferences-store";

type FeedScreen = "home" | "following" | "topic";

type FeedScreenHandlers = {
  onPostPress: (postId: string) => void;
  onAuthorPress: (authorId: string) => void;
  onTopicPress: (topic: string) => void;
  onMorePress: (post: Post) => void;
  onLikePress: (
    postId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number,
  ) => void;
  onDislikePress: (
    postId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number,
  ) => void;
  onCommentPress: (postId: string) => void;
  onFollowUser: (
    authorId: string,
    authorUsername: string,
    isCurrentlyFollowing: boolean,
  ) => void;
  onFollowTopic: (topic: string, isCurrentlyFollowed: boolean) => void;
  onRevealContent: (postId: string) => void;
  onBlockUser: (postId: string, authorId: string, authorUsername: string) => void;
  onBlockPost: (postId: string) => void;
  onBlockTopic: (postId: string, topic: string) => void;
  onReport: (postId: string) => void;
};

type UseHomePostCardBindingsOptions = {
  currentUserId?: string;
  followedUsers: readonly string[];
  followedTopics: readonly string[];
  revealedPosts: Set<string>;
  shareServer: ShareServer;
  allowAutoplay: boolean;
  activeFeedScreen: FeedScreen;
  disabledTopicName?: string;
  handlers: FeedScreenHandlers;
};

export function useHomePostCardBindings({
  currentUserId,
  followedUsers,
  followedTopics,
  revealedPosts,
  shareServer,
  allowAutoplay,
  activeFeedScreen,
  disabledTopicName,
  handlers,
}: UseHomePostCardBindingsOptions) {
  const syncFeedContext = useHomePostCardStore((state) => state.syncFeedContext);
  const setActiveFeedScreen = useHomePostCardStore(
    (state) => state.setActiveFeedScreen,
  );
  const setDisabledTopicName = useHomePostCardStore(
    (state) => state.setDisabledTopicName,
  );
  const setHandlers = useHomePostCardStore((state) => state.setHandlers);

  const followedUsersSet = useMemo(
    () => new Set(followedUsers),
    [followedUsers],
  );
  const followedTopicsSet = useMemo(
    () => new Set(followedTopics),
    [followedTopics],
  );

  useEffect(() => {
    syncFeedContext({
      currentUserId,
      followedUsers: followedUsersSet,
      followedTopics: followedTopicsSet,
      revealedPosts,
      shareServer,
      allowAutoplay,
    });
  }, [
    allowAutoplay,
    currentUserId,
    followedTopicsSet,
    followedUsersSet,
    revealedPosts,
    shareServer,
    syncFeedContext,
  ]);

  useFocusEffect(
    useCallback(() => {
      setActiveFeedScreen(activeFeedScreen);
      setDisabledTopicName(disabledTopicName);
      setHandlers(handlers);
      useTimeTickStore.getState().bump();

      return () => {
        const state = useHomePostCardStore.getState();
        if (state.activeFeedScreen === activeFeedScreen) {
          setActiveFeedScreen(null);
          setDisabledTopicName(undefined);
        }
        if (state.handlers === handlers) {
          state.setHandlers({});
        }
      };
    }, [
      activeFeedScreen,
      disabledTopicName,
      handlers,
      setActiveFeedScreen,
      setDisabledTopicName,
      setHandlers,
    ]),
  );
}
