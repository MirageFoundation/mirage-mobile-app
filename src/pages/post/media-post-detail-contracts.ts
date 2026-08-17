import type { LegendListRef } from "@legendapp/list/react-native";
import type { RefObject } from "react";
import type { LayoutChangeEvent } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import type { Comment, Post } from "@/src/components/molecules";
import { isTopicFollowed } from "@/src/domain/topics";

export type MediaPostDetailFocusedMode = "single" | "context" | "full";

export type MediaPostDetailCommentsListRef = LegendListRef;

export type MediaPostDetailThreadState = {
  comments: Comment[];
  currentUserId: string | null;
  followedUsers: string[];
  focusedCommentId: string | null;
  focusedMode: MediaPostDetailFocusedMode;
  focusedCommentNotFound: boolean;
  isLoadingComments: boolean;
  isLoadingFocusedComment: boolean;
  isLoadingFocusedContextThread: boolean;
  recentContextDisabled: boolean;
  recentContextDone: boolean;
  hasFullThreadBeyondFocus: boolean;
  highlightedCommentId: string | null;
};

export type MediaPostDetailPostState = {
  post: Post;
  currentUserId: string | null;
  followedUsers: string[];
  followedTopics: string[];
  isOwnPost: boolean;
  shareUrl: string;
};

export type MediaPostDetailPostActions = {
  authorPress: () => void;
  authorIdPress: (authorId: string) => void;
  followAuthor: () => void;
  followTopic: () => void;
  upvote: () => void;
  downvote: () => void;
  comment: () => void;
  share: () => void;
  blockUser: () => void;
  blockPost: () => void;
  blockTopic: () => void;
  reportPost: () => void;
  hidePost: () => void;
  expandSheet: () => void;
};

type CommentVoteAction = (
  id: string,
  hasLiked: boolean,
  hasDisliked: boolean,
  likes: number,
) => void;

export type MediaPostDetailCommentActions = {
  scrollYChange: (y: number) => void;
  scrollToIndex: (index: number) => void;
  contentSizeChange: (contentHeight?: number) => void;
  followAuthor: (authorId: string, isCurrentlyFollowing: boolean) => void;
  setFocusedMode: (mode: MediaPostDetailFocusedMode) => void;
  refetchFocusedContext: () => void;
  upvote: CommentVoteAction;
  downvote: CommentVoteAction;
  replyPress: (comment: Comment) => void;
  morePress: (comment: Comment) => void;
  highlightedLayout: (event: LayoutChangeEvent) => void;
};

export type MediaPostDetailVideoControls = {
  isVideo: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  isMuted: boolean;
  playPause: () => void;
  seek: (ms: number) => void;
  muteToggle: () => void;
};

export type MediaPostDetailListLayout = {
  commentsListRef: RefObject<MediaPostDetailCommentsListRef | null>;
  collapseDistance: number;
  inputDockTotalH: number;
  isCollapsed: boolean;
  listTopY: number;
  measuredPostSummaryH: number;
  postSummaryHeightChange: (height: number) => void;
  scrollOffset: SharedValue<number>;
  shouldOpenInitially: boolean;
};

export type MediaPostDetailListController = {
  threadState: MediaPostDetailThreadState;
  postState: MediaPostDetailPostState;
  postActions: MediaPostDetailPostActions;
  commentActions: MediaPostDetailCommentActions;
  videoControls: MediaPostDetailVideoControls;
  listLayout: MediaPostDetailListLayout;
};

export type MediaPostDetailFooterContract = {
  post: Post;
  presentation: {
    isExpanded: boolean;
    hideVideoControls: boolean;
  };
  followState: {
    isFollowing: boolean;
    isTopicFollowed: boolean;
    topic?: string;
    isOwnAuthor: boolean;
  };
  actions: MediaPostDetailPostActions;
  videoControls: MediaPostDetailVideoControls;
  isOwnPost: boolean;
  shareUrl: string;
};

export function createMediaPostDetailListController(
  controller: MediaPostDetailListController,
): MediaPostDetailListController {
  return controller;
}

export function createMediaPostDetailFooterContract(
  postState: MediaPostDetailPostState,
  postActions: MediaPostDetailPostActions,
  videoControls: MediaPostDetailVideoControls,
  presentation: MediaPostDetailFooterContract["presentation"],
): MediaPostDetailFooterContract {
  const { post, currentUserId, followedUsers, followedTopics, isOwnPost, shareUrl } =
    postState;
  return {
    post,
    presentation,
    followState: {
      isFollowing: post.isFollowing ?? followedUsers.includes(post.author.id),
      isTopicFollowed: isTopicFollowed(followedTopics, post.topic),
      topic: post.topic,
      isOwnAuthor: currentUserId === post.author.id,
    },
    actions: postActions,
    videoControls,
    isOwnPost,
    shareUrl,
  };
}

const noop = () => {};
const noopSeek = (_ms: number) => {};

export function createMediaPostDetailMeasurementFooterContract(
  footer: MediaPostDetailFooterContract,
): MediaPostDetailFooterContract {
  return {
    ...footer,
    presentation: { isExpanded: false, hideVideoControls: false },
    actions: {
      authorPress: noop,
      authorIdPress: noop,
      followAuthor: noop,
      followTopic: noop,
      upvote: noop,
      downvote: noop,
      comment: noop,
      share: noop,
      blockUser: noop,
      blockPost: noop,
      blockTopic: noop,
      reportPost: noop,
      hidePost: noop,
      expandSheet: noop,
    },
    videoControls: {
      ...footer.videoControls,
      isPlaying: false,
      positionMs: 0,
      playPause: noop,
      seek: noopSeek,
      muteToggle: noop,
    },
  };
}
