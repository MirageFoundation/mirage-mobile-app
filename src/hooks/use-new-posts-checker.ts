import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
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
  currentFirstPostId?: string | null;
  latestTimestamp?: number | null;
};

export function useNewPostsChecker({
  feed,
  by = "magic",
  topic,
  allowed_tags,
  enabled = true,
  intervalMs = 30_000,
  currentFirstPostId = null,
  latestTimestamp = null,
}: UseNewPostsCheckerOptions) {
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<NewPostAvatar[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);
  const baselineIdRef = useRef<string | null>(null);
  const baselineTimestampRef = useRef<number | null>(null);
  const hasNewPostsRef = useRef(false);
  const isFocused = useIsFocused();
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const prefetchedDataRef = useRef<PostsResponse | null>(null);

  useEffect(() => {
    if (!hasNewPostsRef.current) {
      if (currentFirstPostId) {
        baselineIdRef.current = currentFirstPostId;
      }
      if (latestTimestamp) {
        baselineTimestampRef.current = latestTimestamp;
      }
    }
  }, [currentFirstPostId, latestTimestamp]);

  useEffect(() => {
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    prefetchedDataRef.current = null;
    baselineIdRef.current = currentFirstPostId;
    baselineTimestampRef.current = latestTimestamp;
  }, [feed, by, topic]);

  const extractNewPostInfo = useCallback((data: PostsResponse, baselineTs: number): { avatars: NewPostAvatar[]; count: number } => {
    if (!baselineTs) return { avatars: [], count: 0 };
    const avatars: NewPostAvatar[] = [];
    const seen = new Set<string>();
    let count = 0;
    for (const post of data.posts) {
      if (post.timestamp <= baselineTs) continue;
      count++;
      if (!seen.has(post.user_id) && avatars.length < 3) {
        seen.add(post.user_id);
        avatars.push({ userId: post.user_id, username: post.username });
      }
    }
    return { avatars, count };
  }, []);

  const checkForNewPosts = useCallback(async () => {
    if (!baselineTimestampRef.current) return;
    try {
      const result = await getPosts({
        limit: 20,
        feed: topic ? undefined : feed,
        by,
        topic: topic || undefined,
        allowed_tags: allowed_tags || undefined,
        address: walletAddress ?? undefined,
        page: 1,
      });
      const { avatars, count } = extractNewPostInfo(result, baselineTimestampRef.current);
      if (count > 0) {
        prefetchedDataRef.current = result;
        setNewPostAvatars(avatars);
        setNewPostCount(count);
        if (!hasNewPostsRef.current) {
          hasNewPostsRef.current = true;
          setHasNewPosts(true);
        }
      } else if (hasNewPostsRef.current) {
        hasNewPostsRef.current = false;
        setHasNewPosts(false);
        setNewPostAvatars([]);
        setNewPostCount(0);
        prefetchedDataRef.current = null;
      }
    } catch {}
  }, [feed, by, topic, allowed_tags, walletAddress, extractNewPostInfo]);

  useEffect(() => {
    if (!enabled || !isFocused) return;
    const interval = setInterval(checkForNewPosts, intervalMs);
    return () => clearInterval(interval);
  }, [enabled, isFocused, checkForNewPosts, intervalMs]);

  useAppState({
    onForeground: ({ backgroundDuration }) => {
      if (enabled && backgroundDuration >= 60_000) {
        checkForNewPosts();
      }
    },
    staleThreshold: 60_000,
  });

  const dismiss = useCallback(() => {
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    baselineIdRef.current = null;
    baselineTimestampRef.current = null;
    prefetchedDataRef.current = null;
  }, []);

  const resetBaseline = useCallback((newFirstPostId: string | null, newTimestamp: number | null) => {
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    prefetchedDataRef.current = null;
    if (newFirstPostId) baselineIdRef.current = newFirstPostId;
    if (newTimestamp) baselineTimestampRef.current = newTimestamp;
  }, []);

  const getPrefetchedData = useCallback(() => {
    return prefetchedDataRef.current;
  }, []);

  const clearPrefetch = useCallback(() => {
    prefetchedDataRef.current = null;
  }, []);

  return { hasNewPosts, newPostAvatars, newPostCount, dismiss, resetBaseline, checkNow: checkForNewPosts, getPrefetchedData, clearPrefetch };
}
