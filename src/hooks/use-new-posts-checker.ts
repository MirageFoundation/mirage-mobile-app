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
  currentPostIds?: Set<string>;
  firstPostId?: string | null;
};

export function useNewPostsChecker({
  feed,
  by = "magic",
  topic,
  allowed_tags,
  enabled = true,
  intervalMs = 30_000,
  currentPostIds,
  firstPostId = null,
}: UseNewPostsCheckerOptions) {
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [newPostAvatars, setNewPostAvatars] = useState<NewPostAvatar[]>([]);
  const [newPostCount, setNewPostCount] = useState(0);
  const baselinePostIdsRef = useRef<Set<string>>(new Set());
  const baselineFirstPostIdRef = useRef<string | null>(null);
  const hasNewPostsRef = useRef(false);
  const isFocused = useIsFocused();
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  useEffect(() => {
    if (!hasNewPostsRef.current && currentPostIds && currentPostIds.size > 0) {
      baselinePostIdsRef.current = currentPostIds;
    }
  }, [currentPostIds]);

  useEffect(() => {
    if (!hasNewPostsRef.current && firstPostId) {
      baselineFirstPostIdRef.current = firstPostId;
    }
  }, [firstPostId]);

  useEffect(() => {
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    if (currentPostIds && currentPostIds.size > 0) {
      baselinePostIdsRef.current = currentPostIds;
    }
    baselineFirstPostIdRef.current = firstPostId;
  }, [feed, by, topic]);

  const extractNewPostInfo = useCallback((data: PostsResponse, knownIds: Set<string>): { avatars: NewPostAvatar[]; count: number } => {
    if (knownIds.size === 0) return { avatars: [], count: 0 };
    const avatars: NewPostAvatar[] = [];
    const seen = new Set<string>();
    let count = 0;
    for (const post of data.posts) {
      if (knownIds.has(post.post_id)) continue;
      count++;
      if (!seen.has(post.user_id) && avatars.length < 3) {
        seen.add(post.user_id);
        avatars.push({ userId: post.user_id, username: post.username });
      }
    }
    return { avatars, count };
  }, []);

  const checkForNewPosts = useCallback(async () => {
    if (baselinePostIdsRef.current.size === 0) return;
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
      const fetchedFirstPostId = result.posts[0]?.post_id ?? null;
      const firstPostChanged = !!fetchedFirstPostId && fetchedFirstPostId !== baselineFirstPostIdRef.current;
      const { avatars, count } = extractNewPostInfo(result, baselinePostIdsRef.current);
      if (firstPostChanged) {
        setNewPostAvatars(avatars);
        setNewPostCount(Math.max(count, 1));
        if (!hasNewPostsRef.current) {
          hasNewPostsRef.current = true;
          setHasNewPosts(true);
        }
      } else if (hasNewPostsRef.current) {
        hasNewPostsRef.current = false;
        setHasNewPosts(false);
        setNewPostAvatars([]);
        setNewPostCount(0);
      }
    } catch {}
  }, [feed, by, topic, allowed_tags, walletAddress, extractNewPostInfo]);

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
    baselinePostIdsRef.current = new Set();
    baselineFirstPostIdRef.current = null;
  }, []);

  const resetBaseline = useCallback((newPostIds: Set<string> | null, newFirstPostId: string | null) => {
    hasNewPostsRef.current = false;
    setHasNewPosts(false);
    setNewPostAvatars([]);
    setNewPostCount(0);
    if (newPostIds && newPostIds.size > 0) {
      baselinePostIdsRef.current = newPostIds;
    }
    if (newFirstPostId) {
      baselineFirstPostIdRef.current = newFirstPostId;
    }
  }, []);

  return { hasNewPosts, newPostAvatars, newPostCount, dismiss, resetBaseline, checkNow: checkForNewPosts };
}
