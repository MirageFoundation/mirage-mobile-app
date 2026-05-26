import { create } from "zustand";

type PostDetailActionState = {
  postFollowOverrides: Record<string, boolean | undefined>;
  topicFollowOverrides: Record<string, boolean | undefined>;
  setPostFollowOverride: (postId: string, isFollowing: boolean) => void;
  clearPostFollowOverride: (postId: string) => void;
  setTopicFollowOverride: (postId: string, isFollowing: boolean) => void;
  clearTopicFollowOverride: (postId: string) => void;
};

export const usePostDetailActionStateStore = create<PostDetailActionState>((set) => ({
  postFollowOverrides: {},
  topicFollowOverrides: {},
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
      topicFollowOverrides: {
        ...state.topicFollowOverrides,
        [postId]: isFollowing,
      },
    })),
  clearTopicFollowOverride: (postId) =>
    set((state) => {
      const { [postId]: _removed, ...rest } = state.topicFollowOverrides;
      return { topicFollowOverrides: rest };
    }),
}));
