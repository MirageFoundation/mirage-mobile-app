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
  enabled?: boolean;
  intervalMs?: number;
  currentFirstPostId?: string | null;
  knownPostIds?: Set<string>;
};

export function useNewPostsChecker({
  feed,
  by = "magic",
  topic,
  enabled = true,
  intervalMs = 30_000,
  currentFirstPostId = null,
  knownPostIds,
}: UseNewPostsCheckerOptions) {
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<NewPostAvatar[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);
  const baselineIdRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const hasNewPostsRef = useRef(false);
  const isFocused = useIsFocused();
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const prefetchedDataRef = useRef<PostsResponse | null>(null);

  useEffect(() => {
    if (currentFirstPostId && !hasNewPostsRef.current) {
      baselineIdRef.current = currentFirstPostId;
    }
  }, [currentFirstPostId]);

  useEffect(() => {
    if (knownPostIds && knownPostIds.size > 0 && !hasNewPostsRef.current) {
      knownIdsRef.current = knownPostIds;
    }
  }, [knownPostIds]);

  useEffect(() => {
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    prefetchedDataRef.current = null;
    baselineIdRef.current = currentFirstPostId;
    if (knownPostIds) {
      knownIdsRef.current = knownPostIds;
    }
  }, [feed, by, topic]);

  const extractNewPostInfo = useCallback((data: PostsResponse, known: Set<string>): { avatars: NewPostAvatar[]; count: number } => {
    if (known.size === 0) return { avatars: [], count: 0 };
    const avatars: NewPostAvatar[] = [];
    const seen = new Set<string>();
    let count = 0;
    for (const post of data.posts) {
      if (known.has(post.post_id)) continue;
      count++;
      if (!seen.has(post.user_id) && avatars.length < 3) {
        seen.add(post.user_id);
        avatars.push({ userId: post.user_id, username: post.username });
      }
    }
    return { avatars, count };
  }, []);

  const checkForNewPosts = useCallback(async () => {
    if (!baselineIdRef.current && knownIdsRef.current.size === 0) return;
    try {
      const result = await getPosts({
        limit: 20,
        feed: topic ? undefined : feed,
        by,
        topic: topic || undefined,
        address: walletAddress ?? undefined,
        page: 1,
      });
      const { avatars, count } = extractNewPostInfo(result, knownIdsRef.current);
      if (count > 0) {
        prefetchedDataRef.current = result;
        setNewPostAvatars(avatars);
        setNewPostCount(count);
        if (!hasNewPostsRef.current) {
          hasNewPostsRef.current = true;
          setHasNewPosts(true);
        }
      }
    } catch {}
  }, [feed, by, topic, walletAddress, extractNewPostInfo]);

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
    prefetchedDataRef.current = null;
  }, []);

  const getPrefetchedData = useCallback(() => {
    return prefetchedDataRef.current;
  }, []);

  const clearPrefetch = useCallback(() => {
    prefetchedDataRef.current = null;
  }, []);

  return { hasNewPosts, newPostAvatars, newPostCount, dismiss, checkNow: checkForNewPosts, getPrefetchedData, clearPrefetch };
}
