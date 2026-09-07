import { create } from "zustand";

type PostDetailActionState = {
  commentsRequestedFor: string | null;
  requestComments: (postId: string | null) => void;
  postFollowOverrides: Record<string, boolean | undefined>;
  communityJoinOverrides: Record<string, boolean | undefined>;
  setPostFollowOverride: (postId: string, isFollowing: boolean) => void;
  clearPostFollowOverride: (postId: string) => void;
  setTopicFollowOverride: (postId: string, isFollowing: boolean) => void;
  clearTopicFollowOverride: (postId: string) => void;
};

export const usePostDetailActionStateStore = create<PostDetailActionState>((set) => ({
  commentsRequestedFor: null,
  requestComments: (commentsRequestedFor) => set({ commentsRequestedFor }),
  postFollowOverrides: {},
  communityJoinOverrides: {},
  setPostFollowOverride: (postId, isFollowing) =>
    set((state) => ({
      postFollowOverrides: {
        ...state.postFollowOverrides,
        [postId]: isFollowing,
      },
    })),
  clearPostFollowOverride: (postId) =>
    set((state) => {
      const { [postId]: _removed, ...rest } = state.postFollowOverrides;
      return { postFollowOverrides: rest };
    }),
  setTopicFollowOverride: (postId, isFollowing) =>
    set((state) => ({
      communityJoinOverrides: {
        ...state.communityJoinOverrides,
        [postId]: isFollowing,
      },
    })),
  clearTopicFollowOverride: (postId) =>
    set((state) => {
      const { [postId]: _removed, ...rest } = state.communityJoinOverrides;
      return { communityJoinOverrides: rest };
    }),
}));
