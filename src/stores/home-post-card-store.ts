import { create } from "zustand";

type VoteOverride = {
  hasLiked?: boolean;
  hasDisliked?: boolean;
  likes?: number;
};

type CommentCountOverride = {
  commentDelta: number;
  baseComments: number;
};

type HomePostCardState = {
  voteOverrides: Record<string, VoteOverride>;
  commentCountOverrides: Record<string, CommentCountOverride>;
  sideMenuOpen: boolean;
  shouldScrollToTop: boolean;
  skipNextRefresh: boolean;
  setVoteOverride: (postId: string, override: VoteOverride) => void;
  clearVoteOverride: (postId: string) => void;
  incrementCommentCount: (postId: string, currentComments: number) => void;
  decrementCommentCount: (postId: string, currentComments: number) => void;
  clearCommentCountOverride: (postId: string) => void;
  setSideMenuOpen: (open: boolean) => void;
  triggerScrollToTop: () => void;
  clearScrollToTop: () => void;
  setSkipNextRefresh: (skip: boolean) => void;
  reset: () => void;
};

export const useHomePostCardStore = create<HomePostCardState>((set) => ({
  voteOverrides: {},
  commentCountOverrides: {},
  sideMenuOpen: false,
  shouldScrollToTop: false,
  skipNextRefresh: false,
  setVoteOverride: (postId, override) =>
    set((state) => ({
      voteOverrides: {
        ...state.voteOverrides,
        [postId]: {
          hasLiked: override.hasLiked,
          hasDisliked: override.hasDisliked,
          likes: override.likes,
        },
      },
    })),
  clearVoteOverride: (postId) =>
    set((state) => {
      const { [postId]: _, ...rest } = state.voteOverrides;
      return { voteOverrides: rest };
    }),
  incrementCommentCount: (postId, currentComments) =>
    set((state) => {
      const current = state.commentCountOverrides[postId];
      const shouldRebase = !current || current.baseComments !== currentComments;
      const baseComments = shouldRebase ? currentComments : current.baseComments;
      const currentDelta = shouldRebase ? 0 : current.commentDelta;
      const nextDelta = currentDelta + 1;
      if (nextDelta === 0) {
        const { [postId]: _, ...rest } = state.commentCountOverrides;
        return { commentCountOverrides: rest };
      }
      return {
        commentCountOverrides: {
          ...state.commentCountOverrides,
          [postId]: { commentDelta: nextDelta, baseComments },
        },
      };
    }),
  decrementCommentCount: (postId, currentComments) =>
    set((state) => {
      const current = state.commentCountOverrides[postId];
      const shouldRebase = !current || current.baseComments !== currentComments;
      const baseComments = shouldRebase ? currentComments : current.baseComments;
      const currentDelta = shouldRebase ? 0 : current.commentDelta;
      const nextDelta = currentDelta - 1;
      if (nextDelta === 0) {
        const { [postId]: _, ...rest } = state.commentCountOverrides;
        return { commentCountOverrides: rest };
      }
      return {
        commentCountOverrides: {
          ...state.commentCountOverrides,
          [postId]: { commentDelta: nextDelta, baseComments },
        },
      };
    }),
  clearCommentCountOverride: (postId) =>
    set((state) => {
      const { [postId]: _, ...rest } = state.commentCountOverrides;
      return { commentCountOverrides: rest };
    }),
  setSideMenuOpen: (open) => set({ sideMenuOpen: open }),
  triggerScrollToTop: () => set({ shouldScrollToTop: true }),
  clearScrollToTop: () => set({ shouldScrollToTop: false }),
  setSkipNextRefresh: (skip) => set({ skipNextRefresh: skip }),
  reset: () =>
    set({
      voteOverrides: {},
      commentCountOverrides: {},
      shouldScrollToTop: false,
      skipNextRefresh: false,
      sideMenuOpen: false,
    }),
}));

export const useVoteOverride = (postId: string) =>
  useHomePostCardStore((state) => state.voteOverrides[postId]);

export const useCommentCountOverride = (postId: string) =>
  useHomePostCardStore((state) => state.commentCountOverrides[postId]);
