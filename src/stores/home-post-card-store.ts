import { create } from "zustand";
import type { Post } from "@/src/domain/content";
import type { ShareServer } from "./preferences-store";

type VoteOverride = {
  hasLiked?: boolean;
  hasDisliked?: boolean;
  likes?: number;
};

type CommentCountOverride = {
  commentDelta: number;
  baseComments: number;
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
  onBlockTopic?: (postId: string, topic: string) => void;
  onReport?: (postId: string) => void;
};

type HomePostCardContext = {
 currentUserId?: string;
 followedUsers: Set<string>;
 followedTopics: Set<string>;
 revealedPosts: Set<string>;
 shareServer: ShareServer;
 allowAutoplay?: boolean;
};

type HomePostCardState = {
 currentUserId?: string;
 followedUsers: Set<string>;
 followedTopics: Set<string>;
 followLoadingUsers: Set<string>;
 revealedPosts: Set<string>;
 activeVideoPostIds: Record<string, string | null>;
 visibleVideoPostIds: Record<string, Set<string>>;
 nearbyVideoPostIds: Record<string, Set<string>>;
 voteOverrides: Record<string, VoteOverride>;
 commentCountOverrides: Record<string, CommentCountOverride>;
 followUserOverrides: Record<string, boolean>;
 handlers: HomePostCardHandlers;
 shareServer: ShareServer;
 allowAutoplay: boolean;
  activeFeedScreen: 'home' | 'following' | 'topic' | null;
 sideMenuOpen: boolean;
 shouldScrollToTop: boolean;
 skipNextRefresh: boolean;
 disabledTopicName?: string;
 setCurrentUserId: (id?: string) => void;
 setFollowedUsers: (users: Set<string>) => void;
 setFollowedTopics: (topics: Set<string>) => void;
 setFollowLoadingUsers: (users: Set<string>) => void;
 setRevealedPosts: (posts: Set<string>) => void;
 setCardContext: (context: HomePostCardContext) => void;
 setActiveVideoPostId: (feedScreen: string, postId: string | null) => void;
 setVisibleVideoPostIds: (feedScreen: string, postIds: Set<string>) => void;
 setVideoViewability: (feedScreen: string, visibleIds: Set<string>, activeId: string | null, nearbyIds?: Set<string>) => void;
 setVoteOverride: (postId: string, override: VoteOverride) => void;
 clearVoteOverride: (postId: string) => void;
 setFollowUserOverride: (userId: string, isFollowing: boolean) => void;
 clearFollowUserOverride: (userId: string) => void;
 incrementCommentCount: (postId: string, currentComments: number) => void;
 decrementCommentCount: (postId: string, currentComments: number) => void;
 clearCommentCountOverride: (postId: string) => void;
 setHandlers: (handlers: HomePostCardHandlers) => void;
 setShareServer: (server: ShareServer) => void;
 setAllowAutoplay: (allow: boolean) => void;
  setActiveFeedScreen: (screen: 'home' | 'following' | 'topic' | null) => void;
 setSideMenuOpen: (open: boolean) => void;
 triggerScrollToTop: () => void;
 clearScrollToTop: () => void;
 setSkipNextRefresh: (skip: boolean) => void;
 setDisabledTopicName: (name?: string) => void;
 reset: () => void;
};

const emptySet = new Set<string>();

export const useHomePostCardStore = create<HomePostCardState>((set) => ({
 currentUserId: undefined,
 followedUsers: emptySet,
 followedTopics: emptySet,
 followLoadingUsers: emptySet,
 revealedPosts: emptySet,
 activeVideoPostIds: {},
 visibleVideoPostIds: {},
 nearbyVideoPostIds: {},
 voteOverrides: {},
 commentCountOverrides: {},
 followUserOverrides: {},
 handlers: {},
 shareServer: "mirage.talk",
 allowAutoplay: true,
  activeFeedScreen: null,
 sideMenuOpen: false,
 shouldScrollToTop: false,
 skipNextRefresh: false,
 disabledTopicName: undefined,
 setCurrentUserId: (id) => set({ currentUserId: id }),
  setFollowedUsers: (users) => set({ followedUsers: users }),
  setFollowedTopics: (topics) => set({ followedTopics: topics }),
  setFollowLoadingUsers: (users) => set({ followLoadingUsers: users }),
  setRevealedPosts: (posts) => set({ revealedPosts: posts }),
 setCardContext: (context) =>
   set((state) => {
     const updates: Partial<HomePostCardState> = {};

     if (state.currentUserId !== context.currentUserId) {
       updates.currentUserId = context.currentUserId;
     }
     if (state.followedUsers !== context.followedUsers) {
       updates.followedUsers = context.followedUsers;
     }
     if (state.followedTopics !== context.followedTopics) {
       updates.followedTopics = context.followedTopics;
     }
     if (state.revealedPosts !== context.revealedPosts) {
       updates.revealedPosts = context.revealedPosts;
     }
     if (state.shareServer !== context.shareServer) {
       updates.shareServer = context.shareServer;
     }
     if (
       context.allowAutoplay !== undefined &&
       state.allowAutoplay !== context.allowAutoplay
     ) {
       updates.allowAutoplay = context.allowAutoplay;
     }

     return Object.keys(updates).length > 0 ? updates : state;
   }),
 setActiveVideoPostId: (feedScreen, postId) =>
   set((state) => {
     if (state.activeVideoPostIds[feedScreen] === postId) return state;
     return { activeVideoPostIds: { ...state.activeVideoPostIds, [feedScreen]: postId } };
   }),
 setVisibleVideoPostIds: (feedScreen, postIds) =>
   set((state) => {
     const current = state.visibleVideoPostIds[feedScreen];
     if (current && current.size === postIds.size) {
       let allMatch = true;
       for (const id of current) {
         if (!postIds.has(id)) { allMatch = false; break; }
       }
       if (allMatch) return state;
     }
     return { visibleVideoPostIds: { ...state.visibleVideoPostIds, [feedScreen]: postIds } };
   }),
 setVideoViewability: (feedScreen, visibleIds, activeId, nearbyIds) =>
   set((state) => {
     const currentVisible = state.visibleVideoPostIds[feedScreen];
     const currentActive = state.activeVideoPostIds[feedScreen];
     const currentNearby = state.nearbyVideoPostIds[feedScreen];
     let visibleChanged = !currentVisible || currentVisible.size !== visibleIds.size;
     if (!visibleChanged && currentVisible) {
       for (const id of currentVisible) {
         if (!visibleIds.has(id)) { visibleChanged = true; break; }
       }
     }
     const activeChanged = currentActive !== activeId;
     const effectiveNearby = nearbyIds ?? visibleIds;
     let nearbyChanged = !currentNearby || currentNearby.size !== effectiveNearby.size;
     if (!nearbyChanged && currentNearby) {
       for (const id of currentNearby) {
         if (!effectiveNearby.has(id)) { nearbyChanged = true; break; }
       }
     }
     if (!visibleChanged && !activeChanged && !nearbyChanged) return state;
     const updates: Partial<HomePostCardState> = {};
     if (visibleChanged) updates.visibleVideoPostIds = { ...state.visibleVideoPostIds, [feedScreen]: visibleIds };
     if (activeChanged) updates.activeVideoPostIds = { ...state.activeVideoPostIds, [feedScreen]: activeId };
     if (nearbyChanged) updates.nearbyVideoPostIds = { ...state.nearbyVideoPostIds, [feedScreen]: effectiveNearby };
     return updates;
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
 setFollowUserOverride: (userId, isFollowing) =>
   set((state) => ({
     followUserOverrides: {
       ...state.followUserOverrides,
       [userId]: isFollowing,
     },
   })),
 clearFollowUserOverride: (userId) =>
   set((state) => {
     const { [userId]: _, ...rest } = state.followUserOverrides;
     return { followUserOverrides: rest };
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
 setHandlers: (handlers) => set({ handlers }),
 setShareServer: (server) => set({ shareServer: server }),
 setAllowAutoplay: (allow) => set({ allowAutoplay: allow }),
  setActiveFeedScreen: (screen) => set({ activeFeedScreen: screen }),
 setSideMenuOpen: (open) => set({ sideMenuOpen: open }),
 triggerScrollToTop: () => set({ shouldScrollToTop: true }),
 clearScrollToTop: () => set({ shouldScrollToTop: false }),
 setSkipNextRefresh: (skip) => set({ skipNextRefresh: skip }),
 setDisabledTopicName: (name) => set({ disabledTopicName: name }),
 reset: () => set({
   currentUserId: undefined,
   followedUsers: emptySet,
   followedTopics: emptySet,
   followLoadingUsers: emptySet,
   revealedPosts: emptySet,
   activeVideoPostIds: {},
   visibleVideoPostIds: {},
   nearbyVideoPostIds: {},
   voteOverrides: {},
   commentCountOverrides: {},
   followUserOverrides: {},
   shouldScrollToTop: false,
  skipNextRefresh: false,
   disabledTopicName: undefined,
    activeFeedScreen: null,
 sideMenuOpen: false,
 }),
}));

export const useIsPostVisible = (postId: string, feedScreen: string) =>
  useHomePostCardStore((state) => state.visibleVideoPostIds[feedScreen]?.has(postId) ?? false);

export const useIsPostFocused = (postId: string, feedScreen: string) =>
  useHomePostCardStore((state) => state.activeVideoPostIds[feedScreen] === postId);

export const useVideoVisibility = (postId: string, feedScreen: string) =>
  useHomePostCardStore(
    (state) =>
      ((state.visibleVideoPostIds[feedScreen]?.has(postId) ?? false) ? 2 : 0) |
      (state.activeVideoPostIds[feedScreen] === postId ? 1 : 0) |
      ((state.nearbyVideoPostIds[feedScreen]?.has(postId) ?? false) ? 4 : 0),
  );

export const useIsPostRevealed = (postId: string) =>
  useHomePostCardStore((state) => state.revealedPosts.has(postId));

export const useIsFollowLoading = (authorId: string) =>
  useHomePostCardStore((state) => state.followLoadingUsers.has(authorId));

export const useIsFollowing = (authorId: string) =>
  useHomePostCardStore((state) =>
    state.followUserOverrides[authorId] ?? state.followedUsers.has(authorId),
  );

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
  useHomePostCardStore((state) => state.activeFeedScreen === screen && !state.sideMenuOpen);

export const useHandlers = () =>
  useHomePostCardStore((state) => state.handlers);

export const useIsTopicDisabled = (topic?: string) =>
  useHomePostCardStore((state) => topic ? state.disabledTopicName === topic : false);
