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
};

export function useNewPostsChecker({
  feed,
  by = "magic",
  topic,
  enabled = true,
  intervalMs = 30_000,
  currentFirstPostId = null,
}: UseNewPostsCheckerOptions) {
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<NewPostAvatar[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);
  const baselineIdRef = useRef<string | null>(null);
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
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    prefetchedDataRef.current = null;
    baselineIdRef.current = currentFirstPostId;
  }, [feed, by, topic]);

  const extractNewPostInfo = useCallback((data: PostsResponse, baselineId: string | null): { avatars: NewPostAvatar[]; count: number } => {
    if (!baselineId) return { avatars: [], count: 0 };
    const avatars: NewPostAvatar[] = [];
    const seen = new Set<string>();
    let count = 0;
    for (const post of data.posts) {
      if (post.post_id === baselineId) break;
      count++;
      if (!seen.has(post.user_id) && avatars.length < 3) {
        seen.add(post.user_id);
        avatars.push({ userId: post.user_id, username: post.username });
      }
    }
    return { avatars, count };
  }, []);

  const checkForNewPosts = useCallback(async () => {
    if (!baselineIdRef.current) return;
    try {
      const result = await getPosts({
        limit: 20,
        feed: topic ? undefined : feed,
        by,
        topic: topic || undefined,
        address: walletAddress ?? undefined,
        page: 1,
      });
      const newestId = result.posts[0]?.post_id;
      if (newestId && newestId !== baselineIdRef.current) {
        prefetchedDataRef.current = result;
        const { avatars, count } = extractNewPostInfo(result, baselineIdRef.current);
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
