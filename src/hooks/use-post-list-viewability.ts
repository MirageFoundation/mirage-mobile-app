import type { Post } from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, type ViewToken } from "react-native";

import { useAppState } from "./use-app-state";
import { shouldAutoplayVideo, type NetworkType } from "./use-network-state";

type PostListViewabilityParams = {
  enabled?: boolean;
  autoPlayVideos: boolean;
  networkType: NetworkType | null;
  posts: Pick<Post, "id" | "media" | "body">[];
  videoAutoplayNetwork: "always" | "wifi_only" | "never";
};

export function usePostListViewability({
  enabled = true,
  autoPlayVideos,
  networkType,
  posts,
  videoAutoplayNetwork,
}: PostListViewabilityParams) {
  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  const [visibleVideoPostIds, setVisibleVideoPostIds] = useState<Set<string>>(new Set());
  const [revealedPostIds, setRevealedPostIds] = useState<Set<string>>(new Set());

  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType ?? "unknown"),
    [autoPlayVideos, networkType, videoAutoplayNetwork],
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 30,
    minimumViewTime: 300,
  }).current;
  const pendingViewableRef = useRef<ViewToken[] | null>(null);
  const deferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeVideoPostIdRef = useRef<string | null>(null);
  const postsRef = useRef(posts);
  postsRef.current = posts;

  const clearViewabilityState = useCallback(() => {
    setVisibleVideoPostIds(new Set());
    setActiveVideoPostId(null);
  }, []);

  const flushViewability = useCallback(() => {
    const items = pendingViewableRef.current;
    if (!items || !enabled) {
      clearViewabilityState();
      return;
    }

    const visibleItems = items.filter(
      (item) =>
        item.isViewable &&
        item.item &&
        typeof item.item === "object" &&
        "id" in item.item,
    );

    if (visibleItems.length === 0) {
      clearViewabilityState();
      return;
    }

    const videoItems = visibleItems.filter((item) => postHasPlayableVideo(item.item));
    const newVisibleIds = new Set(videoItems.map((item) => (item.item as { id: string }).id));
    setVisibleVideoPostIds(newVisibleIds);

    if (videoItems.length === 0) {
      setActiveVideoPostId(null);
      return;
    }

    const sortedIndices = visibleItems
      .map((item) => item.index ?? 0)
      .sort((a, b) => a - b);
    const mid = Math.floor((sortedIndices.length - 1) / 2);
    const centerIndex = sortedIndices[mid] ?? 0;
    const visibleSpan =
      (sortedIndices[sortedIndices.length - 1] ?? 0) -
      (sortedIndices[0] ?? 0);
    const maxDist = Math.max(1, visibleSpan * 0.35);

    let best = videoItems[0];
    let bestDist = Math.abs((best.index ?? 0) - centerIndex);
    for (let i = 1; i < videoItems.length; i++) {
      const distance = Math.abs((videoItems[i].index ?? 0) - centerIndex);
      if (distance < bestDist) {
        best = videoItems[i];
        bestDist = distance;
      }
    }

    setActiveVideoPostId(bestDist <= maxDist ? ((best.item as { id: string }).id ?? null) : null);
  }, [clearViewabilityState, enabled]);

  activeVideoPostIdRef.current = activeVideoPostId;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      pendingViewableRef.current = viewableItems;

      const currentActive = activeVideoPostIdRef.current;
      if (currentActive) {
        const stillVisible = viewableItems.some(
          (item) =>
            item.isViewable &&
            item.item &&
            typeof item.item === "object" &&
            "id" in item.item &&
            (item.item as { id: string }).id === currentActive,
        );
        if (!stillVisible) {
          setActiveVideoPostId(null);
        }
      }

      if (deferHandleRef.current !== null) {
        clearTimeout(deferHandleRef.current);
      }
      deferHandleRef.current = setTimeout(
        flushViewability,
        Platform.OS === "ios" ? 200 : 150,
      );
    },
    [flushViewability],
  );

  const handleMomentumScrollEnd = useCallback(() => {
    if (deferHandleRef.current !== null) {
      clearTimeout(deferHandleRef.current);
      deferHandleRef.current = null;
    }

    if (Platform.OS === "ios") {
      requestAnimationFrame(() => {
        requestAnimationFrame(flushViewability);
      });
      return;
    }

    setTimeout(() => {
      requestAnimationFrame(flushViewability);
    }, 50);
  }, [flushViewability]);

  const handleRevealContent = useCallback((postId: string) => {
    setRevealedPostIds((prev) => {
      const next = new Set(prev);
      next.add(postId);
      return next;
    });

    const post = postsRef.current.find((candidate) => candidate.id === postId);
    if (!postHasPlayableVideo(post)) {
      return;
    }

    setVisibleVideoPostIds((prev) => {
      const next = new Set(prev);
      next.add(postId);
      return next;
    });
    setActiveVideoPostId(postId);
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearViewabilityState();
      return;
    }

    requestAnimationFrame(() => {
      flushViewability();
    });
  }, [clearViewabilityState, enabled, flushViewability]);

  useEffect(() => {
    if (posts.length !== 0) {
      return;
    }
    clearViewabilityState();
  }, [clearViewabilityState, posts.length]);

  useEffect(() => {
    return () => {
      if (deferHandleRef.current !== null) {
        clearTimeout(deferHandleRef.current);
      }
    };
  }, []);

  const { currentState } = useAppState({
    onBackground: () => {
      if (deferHandleRef.current !== null) {
        clearTimeout(deferHandleRef.current);
        deferHandleRef.current = null;
      }
      clearViewabilityState();
    },
    onForeground: () => {
      if (!enabled) {
        return;
      }
      if (deferHandleRef.current !== null) {
        clearTimeout(deferHandleRef.current);
        deferHandleRef.current = null;
      }
      requestAnimationFrame(() => {
        flushViewability();
      });
    },
  });

  return {
    activeVideoPostId,
    allowAutoplay,
    currentState,
    handleMomentumScrollEnd,
    handleRevealContent,
    onViewableItemsChanged,
    revealedPostIds,
    viewabilityConfig,
    visibleVideoPostIds,
  };
}
