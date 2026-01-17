import { create } from "zustand";
import type { Post } from "@/src/components/molecules";
import type { ShareServer } from "@/src/stores";

type VoteOverride = {
  hasLiked?: boolean;
  hasDisliked?: boolean;
  likeDelta?: number;
};

type HomePostCardHandlers = {
  onPostPress?: (postId: string) => void;
  onAuthorPress?: (authorId: string) => void;
  onMorePress?: (postId: string) => void;
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
  onFollowPress?: (
    authorId: string,
    authorUsername: string,
    isCurrentlyFollowing: boolean
  ) => void;
  onRevealContent?: (postId: string) => void;
};

type HomePostCardState = {
  currentUserId?: string;
  followedUsers: Set<string>;
  followLoadingUsers: Set<string>;
  revealedPosts: Set<string>;
  visiblePostIds: Set<string>;
  voteOverrides: Record<string, VoteOverride>;
  handlers: HomePostCardHandlers;
  shareServer: ShareServer;
  allowAutoplay: boolean;
  setCurrentUserId: (id?: string) => void;
  setFollowedUsers: (users: Set<string>) => void;
  setFollowLoadingUsers: (users: Set<string>) => void;
  setRevealedPosts: (posts: Set<string>) => void;
  setVisiblePostIds: (posts: Set<string>) => void;
  setVoteOverride: (postId: string, override: VoteOverride) => void;
  clearVoteOverride: (postId: string) => void;
  setHandlers: (handlers: HomePostCardHandlers) => void;
  setShareServer: (server: ShareServer) => void;
  setAllowAutoplay: (allow: boolean) => void;
};

const emptySet = new Set<string>();

export const useHomePostCardStore = create<HomePostCardState>((set, get) => ({
  currentUserId: undefined,
  followedUsers: emptySet,
  followLoadingUsers: emptySet,
  revealedPosts: emptySet,
  visiblePostIds: emptySet,
  voteOverrides: {},
  handlers: {},
  shareServer: "mirage.talk",
  allowAutoplay: true,
  setCurrentUserId: (id) => set({ currentUserId: id }),
  setFollowedUsers: (users) => set({ followedUsers: users }),
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
      const current = state.voteOverrides[postId];
      const currentDelta = current?.likeDelta ?? 0;
      return {
        voteOverrides: {
          ...state.voteOverrides,
          [postId]: {
            hasLiked: override.hasLiked,
            hasDisliked: override.hasDisliked,
            likeDelta: currentDelta + (override.likeDelta ?? 0),
          },
        },
      };
    }),
  clearVoteOverride: (postId) =>
    set((state) => {
      const { [postId]: _, ...rest } = state.voteOverrides;
      return { voteOverrides: rest };
    }),
  setHandlers: (handlers) => set({ handlers }),
  setShareServer: (server) => set({ shareServer: server }),
  setAllowAutoplay: (allow) => set({ allowAutoplay: allow }),
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

export const useVoteOverride = (postId: string) =>
  useHomePostCardStore((state) => state.voteOverrides[postId]);

export const useIsOwnPost = (authorId: string) =>
 useHomePostCardStore((state) => state.currentUserId === authorId);

export const useShareServer = () =>
  useHomePostCardStore((state) => state.shareServer);

export const useAllowAutoplay = () =>
  useHomePostCardStore((state) => state.allowAutoplay);

// Handler selectors - these return stable function references
export const useHandlers = () =>
  useHomePostCardStore((state) => state.handlers);
