import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "expo-router/react-navigation";
import { getPosts, type PostsResponse } from "@/src/api";
import { useAuthStore } from "@/src/stores";
import { useAppState } from "./use-app-state";

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
};

export function useNewPostsChecker({
  feed,
  by = "magic",
  topic,
  allowed_tags,
  enabled = true,
  intervalMs = 30_000,
  latestPostTimestamp = null,
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
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

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
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    prefetchedNewPostsResponseRef.current = null;
    baselineTimestampRef.current = latestPostTimestampRef.current;
  }, [feed, by, topic]);

  const checkForNewPosts = useCallback(async () => {
    if (baselineTimestampRef.current == null) return;
    const checkGeneration = checkGenerationRef.current;
    lastCheckedAtRef.current = Date.now();
    try {
      const result = await getPosts({
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
      const newerPosts = result.posts.filter((p) => p.timestamp > baseline);

      if (newerPosts.length > 0) {
        prefetchedNewPostsResponseRef.current = result;
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
      }
    } catch {}
  }, [feed, by, topic, allowed_tags, walletAddress]);

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
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    prefetchedNewPostsResponseRef.current = null;
    // Re-arm against the current top of the feed rather than parking on null.
    // A manual refresh that returns the same newest post leaves
    // `latestPostTimestamp` unchanged, so the dependency-driven effect below
    // would never fire again and the checker would stay dormant for the rest
    // of the session.
    pendingBaselineRestore.current = true;
    baselineTimestampRef.current = latestPostTimestampRef.current;
  }, []);

  const resetBaseline = useCallback((newTimestamp: number | null) => {
    checkGenerationRef.current += 1;
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    prefetchedNewPostsResponseRef.current = null;
    if (newTimestamp == null) {
      pendingBaselineRestore.current = true;
    }
    baselineTimestampRef.current = newTimestamp;
  }, []);

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
