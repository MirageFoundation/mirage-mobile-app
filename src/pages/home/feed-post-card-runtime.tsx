import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { Post } from "@/src/domain/content";
import type { ShareServer } from "@/src/stores/preferences-store";

export type FeedPostCardHandlers = {
  onPostPress?: (postId: string) => void;
  onAuthorPress?: (authorId: string) => void;
  onTopicPress?: (topic: string) => void;
  onMorePress?: (post: Post) => void;
  onLikePress?: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
  onDislikePress?: (postId: string, liked: boolean, disliked: boolean, likes: number) => void;
  onCommentPress?: (postId: string) => void;
  onFollowUser?: (authorId: string, username: string, isFollowing: boolean) => void;
  onFollowTopic?: (topic: string, isFollowed: boolean) => void;
  onRevealContent?: (postId: string) => void;
  onBlockUser?: (postId: string, authorId: string, username: string) => void;
  onBlockPost?: (postId: string) => void;
  onBlockTopic?: (postId: string, topic: string) => void;
  onReport?: (postId: string) => void;
};

export type FeedPostCardConfig = {
  currentUserId?: string;
  followedUsers: ReadonlySet<string>;
  followedTopics: ReadonlySet<string>;
  followUserOverrides: Readonly<Record<string, boolean>>;
  revealedPosts: ReadonlySet<string>;
  shareServer: ShareServer;
  allowAutoplay: boolean;
  active: boolean;
  disabledTopicName?: string;
  handlers: FeedPostCardHandlers;
};

type RuntimeState = FeedPostCardConfig & {
  visiblePostIds: ReadonlySet<string>;
  nearbyPostIds: ReadonlySet<string>;
  activePostId: string | null;
};

type Listener = () => void;

const emptySet = new Set<string>();

export function createFeedPostCardRuntime(initial: FeedPostCardConfig) {
  let disposed = false;
  let state: RuntimeState = {
    ...initial,
    visiblePostIds: emptySet,
    nearbyPostIds: emptySet,
    activePostId: null,
  };
  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    getState: () => state,
    subscribe: (listener: Listener) => {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateConfig: (config: FeedPostCardConfig) => {
      if (disposed) return;
      state = { ...state, ...config };
      notify();
    },
    setVideoViewability: (
      visiblePostIds: ReadonlySet<string>,
      activePostId: string | null,
      nearbyPostIds: ReadonlySet<string> = visiblePostIds,
    ) => {
      if (disposed) return;
      state = { ...state, visiblePostIds, activePostId, nearbyPostIds };
      notify();
    },
    setActivePostId: (activePostId: string | null) => {
      if (disposed || state.activePostId === activePostId) return;
      state = { ...state, activePostId };
      notify();
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
      state = {
        ...state,
        handlers: {},
        revealedPosts: emptySet,
        visiblePostIds: emptySet,
        nearbyPostIds: emptySet,
        activePostId: null,
      };
    },
  };
}

export type FeedPostCardRuntime = ReturnType<typeof createFeedPostCardRuntime>;

const FeedPostCardRuntimeContext = createContext<FeedPostCardRuntime | null>(null);

export function FeedPostCardRuntimeProvider({
  config,
  children,
}: {
  config: FeedPostCardConfig;
  children: ReactNode;
}) {
  const runtimeRef = useRef<FeedPostCardRuntime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = createFeedPostCardRuntime(config);
  const runtime = runtimeRef.current;

  useEffect(() => {
    runtime.updateConfig(config);
  }, [config, runtime]);
  useEffect(() => () => runtime.dispose(), [runtime]);

  return (
    <FeedPostCardRuntimeContext.Provider value={runtime}>
      {children}
    </FeedPostCardRuntimeContext.Provider>
  );
}

export function useFeedPostCardRuntime() {
  const runtime = useContext(FeedPostCardRuntimeContext);
  if (!runtime) throw new Error("FeedPostCardRuntimeProvider is required");
  return runtime;
}

export function useFeedPostCardSelector<T>(selector: (state: RuntimeState) => T): T {
  const runtime = useFeedPostCardRuntime();
  return useSyncExternalStore(
    runtime.subscribe,
    () => selector(runtime.getState()),
    () => selector(runtime.getState()),
  );
}
