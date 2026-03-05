import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { getPosts } from "@/src/api";
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
  const hasNewPostsRef = useRef(false);
  const isFocused = useIsFocused();
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  useEffect(() => {
    if (!hasNewPostsRef.current && latestPostTimestamp != null) {
      baselineTimestampRef.current = latestPostTimestamp;
    }
  }, [latestPostTimestamp]);

  useEffect(() => {
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    baselineTimestampRef.current = latestPostTimestamp;
  }, [feed, by, topic]);

  const checkForNewPosts = useCallback(async () => {
    if (baselineTimestampRef.current == null) return;
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

      const baseline = baselineTimestampRef.current!;
      const newerPosts = result.posts.filter((p) => p.timestamp > baseline);

      if (newerPosts.length > 0) {
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
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    baselineTimestampRef.current = null;
  }, []);

  const resetBaseline = useCallback((newTimestamp: number | null) => {
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    baselineTimestampRef.current = newTimestamp;
  }, []);

  return { hasNewPosts, newPostAvatars, newPostCount, dismiss, resetBaseline, checkNow: checkForNewPosts };
}
