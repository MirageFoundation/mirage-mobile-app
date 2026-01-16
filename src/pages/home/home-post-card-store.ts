import { create } from "zustand";
import type { Post } from "@/src/components/molecules";

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
  handlers: HomePostCardHandlers;
  setCurrentUserId: (id?: string) => void;
  setFollowedUsers: (users: Set<string>) => void;
  setFollowLoadingUsers: (users: Set<string>) => void;
  setRevealedPosts: (posts: Set<string>) => void;
  setVisiblePostIds: (posts: Set<string>) => void;
  setHandlers: (handlers: HomePostCardHandlers) => void;
  isOwnPost: (post: Post) => boolean;
};

const emptySet = new Set<string>();

export const useHomePostCardStore = create<HomePostCardState>((set, get) => ({
  currentUserId: undefined,
  followedUsers: emptySet,
  followLoadingUsers: emptySet,
  revealedPosts: emptySet,
  visiblePostIds: emptySet,
  handlers: {},
  setCurrentUserId: (id) => set({ currentUserId: id }),
  setFollowedUsers: (users) => set({ followedUsers: users }),
  setFollowLoadingUsers: (users) => set({ followLoadingUsers: users }),
  setRevealedPosts: (posts) => set({ revealedPosts: posts }),
  setVisiblePostIds: (posts) =>
    set((state) => {
      if (state.visiblePostIds.size === posts.size) {
        for (const value of state.visiblePostIds) {
          if (!posts.has(value)) {
            return { visiblePostIds: posts };
          }
        }
        return state;
      }
      return { visiblePostIds: posts };
    }),
  setHandlers: (handlers) => set({ handlers }),
  isOwnPost: (post) => {
    const currentUserId = get().currentUserId;
    return !!currentUserId && currentUserId === post.author.id;
  },
}));

export const useIsPostVisible = (postId: string) =>
  useHomePostCardStore((state) => state.visiblePostIds.has(postId));

export const useIsPostRevealed = (postId: string) =>
  useHomePostCardStore((state) => state.revealedPosts.has(postId));

export const useIsFollowLoading = (authorId: string) =>
  useHomePostCardStore((state) => state.followLoadingUsers.has(authorId));

export const useIsFollowing = (authorId: string) =>
  useHomePostCardStore((state) => state.followedUsers.has(authorId));
