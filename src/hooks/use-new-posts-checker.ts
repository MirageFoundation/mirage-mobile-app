import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "expo-router/react-navigation";
import { getPosts, type PostsResponse } from "@/src/api";
import { consumeBootstrapFeedPreview } from "@/src/api/cache/bootstrap-cache";
import { useAuthStore } from "@/src/stores";
import { prefetchFeedImages } from "@/src/utils/feed-image-prefetch";
import { useAppState } from "./use-app-state";
import { selectUnseenNewerPosts } from "./new-posts-check";

export type NewPostAvatar = {
  userId: string;
  username: string;
};

type UseNewPostsCheckerOptions = {
  feed?: "home" | "following";
  by?: "magic" | "newest";
  topic?: string;
  allowed_tags?: string;
  enabled?: boolean;
  intervalMs?: number;
  latestPostTimestamp?: number | null;
  knownPostIds?: Iterable<string> | null;
};

export function useNewPostsChecker({
  feed,
  by = "magic",
  topic,
  allowed_tags,
  enabled = true,
  intervalMs = 30_000,
  latestPostTimestamp = null,
  knownPostIds = null,
}: UseNewPostsCheckerOptions) {
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<NewPostAvatar[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);
  const baselineTimestampRef = useRef<number | null>(null);
  const latestPostTimestampRef = useRef<number | null>(latestPostTimestamp);
  latestPostTimestampRef.current = latestPostTimestamp;
  const hasNewPostsRef = useRef(false);
  const checkGenerationRef = useRef(0);
  const lastCheckedAtRef = useRef(Number.NEGATIVE_INFINITY);
  const prefetchedNewPostsResponseRef = useRef<PostsResponse | null>(null);
  const isFocused = useIsFocused();
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const knownPostIdsRef = useRef(knownPostIds);
  knownPostIdsRef.current = knownPostIds;

  const clearNewPosts = useCallback(() => {
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    prefetchedNewPostsResponseRef.current = null;
  }, []);

  useEffect(() => {
    if (!hasNewPostsRef.current && latestPostTimestamp != null) {
      baselineTimestampRef.current = latestPostTimestamp;
    }
  }, [latestPostTimestamp]);

  const pendingBaselineRestore = useRef(false);

  useEffect(() => {
    if (pendingBaselineRestore.current && latestPostTimestamp != null) {
      pendingBaselineRestore.current = false;
      baselineTimestampRef.current = latestPostTimestamp;
    }
  });

  useEffect(() => {
    checkGenerationRef.current += 1;
    clearNewPosts();
    baselineTimestampRef.current = latestPostTimestampRef.current;
  }, [by, clearNewPosts, feed, topic]);

  const checkForNewPosts = useCallback(async () => {
    if (baselineTimestampRef.current == null) return;
    const checkGeneration = checkGenerationRef.current;
    lastCheckedAtRef.current = Date.now();
    try {
      const result = consumeBootstrapFeedPreview({
        feed: topic ? undefined : feed,
        by,
        topic,
        allowed_tags,
        address: walletAddress ?? undefined,
      }) ?? await getPosts({
        limit: 10,
        feed: topic ? undefined : feed,
        by,
        topic: topic || undefined,
        allowed_tags: allowed_tags || undefined,
        address: walletAddress ?? undefined,
        page: 1,
      });

      if (checkGenerationRef.current !== checkGeneration) return;

      const baseline = baselineTimestampRef.current;
      if (baseline == null) return;
      const newerPosts = selectUnseenNewerPosts(result.posts, {
        baselineTimestamp: baseline,
        knownPostIds: knownPostIdsRef.current,
      });

      if (newerPosts.length > 0) {
        prefetchedNewPostsResponseRef.current = result;
        prefetchFeedImages(newerPosts);
        const avatars: NewPostAvatar[] = [];
        const seen = new Set<string>();
        for (const post of newerPosts) {
          if (!seen.has(post.user_id) && avatars.length < 3) {
            seen.add(post.user_id);
            avatars.push({ userId: post.user_id, username: post.username });
          }
        }
        setNewPostAvatars(avatars);
        setNewPostCount(newerPosts.length);
        if (!hasNewPostsRef.current) {
          hasNewPostsRef.current = true;
          setHasNewPosts(true);
        }
        return;
      }
      clearNewPosts();
    } catch {}
  }, [allowed_tags, by, clearNewPosts, feed, topic, walletAddress]);

  useEffect(() => {
    const prefetched = prefetchedNewPostsResponseRef.current;
    const baseline = baselineTimestampRef.current;
    if (!hasNewPostsRef.current || !prefetched || baseline == null) return;
    const unseen = selectUnseenNewerPosts(prefetched.posts, {
      baselineTimestamp: baseline,
      knownPostIds,
    });
    if (unseen.length === 0) clearNewPosts();
  }, [clearNewPosts, knownPostIds]);

  // Feed queries never refetch themselves (see infinite-posts-policy), so this
  // background poll discovers new posts without duplicating the aggregate cold-
  // start request immediately after bootstrap hydration.
  useEffect(() => {
    if (!enabled || !isFocused) return;
    const interval = setInterval(checkForNewPosts, intervalMs);
    return () => clearInterval(interval);
  }, [enabled, isFocused, checkForNewPosts, intervalMs]);

  useAppState({
    onForeground: () => {
      if (enabled) {
        checkForNewPosts();
      }
    },
    staleThreshold: 0,
  });

  const dismiss = useCallback(() => {
    checkGenerationRef.current += 1;
    clearNewPosts();
    // Re-arm against the current top of the feed rather than parking on null.
    // A manual refresh that returns the same newest post leaves
    // `latestPostTimestamp` unchanged, so the dependency-driven effect below
    // would never fire again and the checker would stay dormant for the rest
    // of the session.
    pendingBaselineRestore.current = true;
    baselineTimestampRef.current = latestPostTimestampRef.current;
  }, [clearNewPosts]);

  const resetBaseline = useCallback((newTimestamp: number | null) => {
    checkGenerationRef.current += 1;
    clearNewPosts();
    if (newTimestamp == null) {
      pendingBaselineRestore.current = true;
    }
    baselineTimestampRef.current = newTimestamp;
  }, [clearNewPosts]);

  const getPrefetchedNewPostsResponse = useCallback(
    () => prefetchedNewPostsResponseRef.current,
    [],
  );

  return {
    hasNewPosts,
    newPostAvatars,
    newPostCount,
    dismiss,
    resetBaseline,
    checkNow: checkForNewPosts,
    getPrefetchedNewPostsResponse,
  };
}
