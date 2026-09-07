import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "expo-router/react-navigation";
import { getPosts, queryKeys, type PostsResponse } from "@/src/api";
import { consumeBootstrapFeedPreview } from "@/src/api/cache/bootstrap-cache";
import { prepareReadyFeedUpdate, revealReadyFeedUpdate } from "@/src/api/cache/ready-feed-update";
import { createFeedUpdateRequestGuard } from "@/src/api/cache/feed-update-request";
import { apiClient } from "@/src/api/client";
import { usePreferencesStore } from "@/src/stores/preferences-store";
import { withSessionLensPicks } from "@/src/api/read/request-params";
import { useAuthStore, useEncodedLensPicks } from "@/src/stores";
import { getEncodedLensPicks } from "@/src/stores/lens-picks-store";
import { prefetchFeedImages } from "@/src/utils/feed-image-prefetch";
import { useAppState } from "./use-app-state";
import { selectUnseenNewerPosts } from "./new-posts-check";

export type NewPostAvatar = { userId: string; username: string };

type UseNewPostsCheckerOptions = {
  feed?: "home" | "following";
  by?: "magic" | "newest";
  community?: string;
  allowed_tags?: string;
  enabled?: boolean;
  intervalMs?: number;
  latestPostTimestamp?: number | null;
  knownPostIds?: Iterable<string> | null;
};

type ReadyUpdate = {
  identity: string;
  liveIdentity: string;
  serverGeneration: number;
  posts: PostsResponse["posts"];
};

export function useNewPostsChecker({
  feed,
  by = "magic",
  community,
  allowed_tags,
  enabled = true,
  intervalMs = 30_000,
  latestPostTimestamp = null,
  knownPostIds = null,
}: UseNewPostsCheckerOptions) {
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const apiServer = usePreferencesStore((s) => s.apiServer);
  const encodedPicks = useEncodedLensPicks(walletAddress);
  const feedParams = useMemo(() => withSessionLensPicks({
    limit: 10,
    feed: community ? undefined : feed,
    by,
    community: community || undefined,
    allowed_tags: allowed_tags || undefined,
    address: walletAddress ?? undefined,
    lens_picks: community ? undefined : encodedPicks,
    page: undefined,
  }, walletAddress), [allowed_tags, by, community, encodedPicks, feed, walletAddress]);
  const queryKey = queryKeys.posts(feedParams);
  const identity = JSON.stringify([apiServer, queryKey]);
  const currentRef = useRef({ identity, enabled, isFocused, latestPostTimestamp, knownPostIds });
  currentRef.current = { identity, enabled, isFocused, latestPostTimestamp, knownPostIds };
  const getLiveIdentity = useCallback(() => {
    const viewer = useAuthStore.getState().walletAddress;
    const preferences = usePreferencesStore.getState();
    return JSON.stringify([currentRef.current.identity,
      apiClient.getCurrentServerContext().generation, viewer,
      getEncodedLensPicks(viewer), preferences.apiServer,
      preferences.selectedContentTypes, preferences.adultContentEnabled]);
  }, []);
  const renderLiveIdentity = getLiveIdentity();
  const requestGuard = useMemo(() => createFeedUpdateRequestGuard(getLiveIdentity), [getLiveIdentity]);
  const lastCheckedAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [ready, setReady] = useState<ReadyUpdate | null>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const dismiss = useCallback(() => {
    requestGuard.cancel();
    readyRef.current = null;
    setReady(null);
  }, [requestGuard]);

  useEffect(() => {
    dismiss();
    lastCheckedAtRef.current = Number.NEGATIVE_INFINITY;
    return dismiss;
  }, [identity, dismiss]);

  const checkForNewPosts = useCallback(async () => {
    const current = currentRef.current;
    if (!current.enabled || !current.isFocused || current.latestPostTimestamp == null ||
      current.identity !== identity || getLiveIdentity() !== renderLiveIdentity ||
      Date.now() - lastCheckedAtRef.current < 5_000) return;
    const controller = requestGuard.start();
    if (!controller) return;
    const liveIdentity = getLiveIdentity();
    const server = apiClient.getCurrentServerContext();
    lastCheckedAtRef.current = Date.now();
    const isCurrent = () => requestGuard.isCurrent(controller) &&
      currentRef.current.enabled && currentRef.current.isFocused &&
      currentRef.current.identity === identity &&
      apiClient.getCurrentServerContext().generation === server.generation &&
      useAuthStore.getState().walletAddress === walletAddress;
    try {
      const fetchPage = async (page: number) => {
        if (!isCurrent()) throw new Error("Feed check superseded");
        return getPosts({ ...feedParams, page }, { signal: controller.signal });
      };
      const firstPage = consumeBootstrapFeedPreview({
        ...feedParams,
        serverIdentity: server.identity,
      }) ?? await fetchPage(1);
      if (!isCurrent()) return;
      const posts = await prepareReadyFeedUpdate({
        firstPage,
        fetchPage,
        by,
        baselineTimestamp: current.latestPostTimestamp,
        knownPostIds: current.knownPostIds,
      });
      if (!isCurrent()) return;
      const update = posts.length ? { identity, liveIdentity, serverGeneration: server.generation, posts } : null;
      readyRef.current = update;
      setReady(update);
      prefetchFeedImages(posts);
    } catch {
      // A failed/canceled poll must not disturb the visible feed or prior ready data.
    } finally {
      requestGuard.finish(controller);
    }
  }, [by, feedParams, getLiveIdentity, identity, renderLiveIdentity, requestGuard, walletAddress]);

  // Stable timer; request parameters are read from the latest render, without
  // restarting the 30-second interval on every cache/viewability update.
  const checkRef = useRef(checkForNewPosts);
  checkRef.current = checkForNewPosts;
  useEffect(() => {
    if (!enabled || !isFocused) return;
    const interval = setInterval(() => void checkRef.current(), intervalMs);
    return () => clearInterval(interval);
  }, [enabled, isFocused, intervalMs]);
  useAppState({
    onForeground: () => { void checkRef.current(); },
    staleThreshold: 0,
  });

  const serverGeneration = apiClient.getCurrentServerContext().generation;
  const visiblePosts = useMemo(() => enabled && ready?.identity === identity &&
    ready.liveIdentity === renderLiveIdentity &&
    ready.serverGeneration === serverGeneration
    ? selectUnseenNewerPosts(ready.posts, {
      baselineTimestamp: latestPostTimestamp ?? 0,
      knownPostIds,
    }) : [], [enabled, ready, identity, renderLiveIdentity, serverGeneration, latestPostTimestamp, knownPostIds]);
  const newPostAvatars = useMemo(() => {
    const avatars: NewPostAvatar[] = [];
    const seenUsers = new Set<string>();
    for (const post of visiblePosts) {
      if (avatars.length === 3) break;
      if (seenUsers.has(post.user_id)) continue;
      seenUsers.add(post.user_id);
      avatars.push({ userId: post.user_id, username: post.username });
    }
    return avatars;
  }, [visiblePosts]);

  const resetBaseline = useCallback((_timestamp: number | null) => dismiss(), [dismiss]);

  const applyReadyPosts = useCallback(() => {
    const update = readyRef.current;
    if (!update || currentRef.current.identity !== identity || update.identity !== identity ||
      update.liveIdentity !== getLiveIdentity() ||
      !currentRef.current.enabled || !currentRef.current.isFocused ||
      apiClient.getCurrentServerContext().generation !== update.serverGeneration ||
      useAuthStore.getState().walletAddress !== walletAddress) return false;
    const posts = selectUnseenNewerPosts(update.posts, {
      baselineTimestamp: currentRef.current.latestPostTimestamp ?? 0,
      knownPostIds: currentRef.current.knownPostIds,
    });
    const applied = posts.length > 0 && revealReadyFeedUpdate(queryClient, queryKey, posts);
    dismiss();
    return applied;
  }, [dismiss, getLiveIdentity, identity, queryClient, queryKey, walletAddress]);

  return {
    hasNewPosts: visiblePosts.length > 0,
    newPostAvatars,
    newPostCount: visiblePosts.length,
    dismiss,
    resetBaseline,
    checkNow: checkForNewPosts,
    applyReadyPosts,
  };
}
