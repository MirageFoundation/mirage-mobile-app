import { create } from "zustand";
import type { Post } from "@/src/components/molecules";
import type { ShareServer } from "@/src/stores";

type VoteOverride = {
  hasLiked?: boolean;
  hasDisliked?: boolean;
  likes?: number;
};

type CommentCountOverride = {
  commentDelta: number;
};

type HomePostCardHandlers = {
  onPostPress?: (postId: string) => void;
  onAuthorPress?: (authorId: string) => void;
  onTopicPress?: (topic: string) => void;
  onMorePress?: (post: Post) => void;
  onLikePress?: (
    postId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  onDislikePress?: (
    postId: string,
    currentlyLiked: boolean,
    currentlyDisliked: boolean,
    currentLikes: number
  ) => void;
  onCommentPress?: (postId: string) => void;
  onFollowUser?: (
    authorId: string,
    authorUsername: string,
    isCurrentlyFollowing: boolean
  ) => void;
  onFollowTopic?: (topic: string, isCurrentlyFollowed: boolean) => void;
  onRevealContent?: (postId: string) => void;
  onBlockUser?: (postId: string, authorId: string, authorUsername: string) => void;
  onBlockPost?: (postId: string) => void;
  onReport?: (postId: string) => void;
};

type HomePostCardState = {
 currentUserId?: string;
 followedUsers: Set<string>;
 followedTopics: Set<string>;
 followLoadingUsers: Set<string>;
 revealedPosts: Set<string>;
 visiblePostIds: Set<string>;
 voteOverrides: Record<string, VoteOverride>;
 commentCountOverrides: Record<string, CommentCountOverride>;
 handlers: HomePostCardHandlers;
 shareServer: ShareServer;
 allowAutoplay: boolean;
  activeFeedScreen: 'home' | 'following' | 'topic' | null;
 shouldScrollToTop: boolean;
 disabledTopicName?: string;
 setCurrentUserId: (id?: string) => void;
 setFollowedUsers: (users: Set<string>) => void;
 setFollowedTopics: (topics: Set<string>) => void;
 setFollowLoadingUsers: (users: Set<string>) => void;
 setRevealedPosts: (posts: Set<string>) => void;
 setVisiblePostIds: (posts: Set<string>) => void;
 setVoteOverride: (postId: string, override: VoteOverride) => void;
 clearVoteOverride: (postId: string) => void;
 incrementCommentCount: (postId: string) => void;
 decrementCommentCount: (postId: string) => void;
 clearCommentCountOverride: (postId: string) => void;
 setHandlers: (handlers: HomePostCardHandlers) => void;
 setShareServer: (server: ShareServer) => void;
 setAllowAutoplay: (allow: boolean) => void;
  setActiveFeedScreen: (screen: 'home' | 'following' | 'topic' | null) => void;
 triggerScrollToTop: () => void;
 clearScrollToTop: () => void;
 setDisabledTopicName: (name?: string) => void;
 reset: () => void;
};

const emptySet = new Set<string>();

export const useHomePostCardStore = create<HomePostCardState>((set, get) => ({
 currentUserId: undefined,
 followedUsers: emptySet,
 followedTopics: emptySet,
 followLoadingUsers: emptySet,
 revealedPosts: emptySet,
 visiblePostIds: emptySet,
 voteOverrides: {},
 commentCountOverrides: {},
 handlers: {},
 shareServer: "mirage.talk",
 allowAutoplay: true,
  activeFeedScreen: null,
 shouldScrollToTop: false,
 disabledTopicName: undefined,
 setCurrentUserId: (id) => set({ currentUserId: id }),
  setFollowedUsers: (users) => set({ followedUsers: users }),
  setFollowedTopics: (topics) => set({ followedTopics: topics }),
  setFollowLoadingUsers: (users) => set({ followLoadingUsers: users }),
  setRevealedPosts: (posts) => set({ revealedPosts: posts }),
  setVisiblePostIds: (posts) =>
    set((state) => {
      if (state.visiblePostIds.size === posts.size) {
        let allMatch = true;
        for (const value of state.visiblePostIds) {
          if (!posts.has(value)) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return state;
      }
      return { visiblePostIds: posts };
    }),
setVoteOverride: (postId, override) =>
  set((state) => {
    return {
      voteOverrides: {
        ...state.voteOverrides,
        [postId]: {
          hasLiked: override.hasLiked,
          hasDisliked: override.hasDisliked,
          likes: override.likes,
        },
      },
    };
  }),
  clearVoteOverride: (postId) =>
    set((state) => {
      const { [postId]: _, ...rest } = state.voteOverrides;
      return { voteOverrides: rest };
    }),
 incrementCommentCount: (postId) =>
   set((state) => {
     const current = state.commentCountOverrides[postId];
     const currentDelta = current?.commentDelta ?? 0;
     return {
       commentCountOverrides: {
         ...state.commentCountOverrides,
         [postId]: { commentDelta: currentDelta + 1 },
       },
     };
   }),
 decrementCommentCount: (postId) =>
   set((state) => {
     const current = state.commentCountOverrides[postId];
     const currentDelta = current?.commentDelta ?? 0;
     return {
       commentCountOverrides: {
         ...state.commentCountOverrides,
         [postId]: { commentDelta: currentDelta - 1 },
       },
     };
   }),
 clearCommentCountOverride: (postId) =>
   set((state) => {
     const { [postId]: _, ...rest } = state.commentCountOverrides;
     return { commentCountOverrides: rest };
   }),
 setHandlers: (handlers) => set({ handlers }),
 setShareServer: (server) => set({ shareServer: server }),
 setAllowAutoplay: (allow) => set({ allowAutoplay: allow }),
  setActiveFeedScreen: (screen) => set({ activeFeedScreen: screen }),
 triggerScrollToTop: () => set({ shouldScrollToTop: true }),
 clearScrollToTop: () => set({ shouldScrollToTop: false }),
 setDisabledTopicName: (name) => set({ disabledTopicName: name }),
 reset: () => set({
   currentUserId: undefined,
   followedUsers: emptySet,
   followedTopics: emptySet,
   followLoadingUsers: emptySet,
   revealedPosts: emptySet,
   visiblePostIds: emptySet,
   voteOverrides: {},
   commentCountOverrides: {},
   shouldScrollToTop: false,
   disabledTopicName: undefined,
    activeFeedScreen: null,
 }),
}));

// Primitive selectors that return stable values
// These only trigger re-render when the specific value changes

export const useIsPostVisible = (postId: string) =>
  useHomePostCardStore((state) => state.visiblePostIds.has(postId));

export const useIsPostRevealed = (postId: string) =>
  useHomePostCardStore((state) => state.revealedPosts.has(postId));

export const useIsFollowLoading = (authorId: string) =>
  useHomePostCardStore((state) => state.followLoadingUsers.has(authorId));

export const useIsFollowing = (authorId: string) =>
  useHomePostCardStore((state) => state.followedUsers.has(authorId));

export const useIsTopicFollowed = (topic?: string) =>
  useHomePostCardStore((state) => topic ? state.followedTopics.has(topic) : false);

export const useVoteOverride = (postId: string) =>
  useHomePostCardStore((state) => state.voteOverrides[postId]);

export const useCommentCountOverride = (postId: string) =>
  useHomePostCardStore((state) => state.commentCountOverrides[postId]);

export const useIsOwnPost = (authorId: string) =>
 useHomePostCardStore((state) => state.currentUserId === authorId);

export const useShareServer = () =>
  useHomePostCardStore((state) => state.shareServer);

export const useAllowAutoplay = () =>
 useHomePostCardStore((state) => state.allowAutoplay);

export const useFeedActive = (screen: 'home' | 'following' | 'topic') =>
  useHomePostCardStore((state) => state.activeFeedScreen === screen);

// Handler selectors - these return stable function references
export const useHandlers = () =>
  useHomePostCardStore((state) => state.handlers);

export const useIsTopicDisabled = (topic?: string) =>
  useHomePostCardStore((state) => topic ? state.disabledTopicName === topic : false);
