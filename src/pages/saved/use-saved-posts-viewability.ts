import { useAppState, shouldAutoplayVideo } from "@/src/hooks";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import type { Post } from "@/src/components/molecules";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, type ViewToken } from "react-native";

interface UseSavedPostsViewabilityParams {
  activeTab: number;
  autoPlayVideos: boolean;
  networkType: string | null;
  postsWithOverrides: Post[];
  videoAutoplayNetwork: string;
}

export function useSavedPostsViewability({
  activeTab,
  autoPlayVideos,
  networkType,
  postsWithOverrides,
  videoAutoplayNetwork,
}: UseSavedPostsViewabilityParams) {
  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  const [visibleVideoPostIds, setVisibleVideoPostIds] = useState<Set<string>>(new Set());

  const allowAutoplay = useMemo(
    () => shouldAutoplayVideo(autoPlayVideos, videoAutoplayNetwork, networkType),
    [autoPlayVideos, networkType, videoAutoplayNetwork],
  );

  const savedPostsViewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 30,
    minimumViewTime: 300,
  }).current;
  const pendingSavedPostsViewableRef = useRef<ViewToken[] | null>(null);
  const savedPostsDeferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSavedPostsViewability = useCallback(() => {
    const items = pendingSavedPostsViewableRef.current;
    if (!items || activeTab !== 0) {
      setVisibleVideoPostIds(new Set());
      setActiveVideoPostId(null);
      return;
    }

    const visibleItems = items.filter(
      (item) => item.isViewable && item.item && typeof item.item === "object" && "id" in item.item,
    );
    if (visibleItems.length === 0) {
      setVisibleVideoPostIds(new Set());
      setActiveVideoPostId(null);
      return;
    }

    const videoItems = visibleItems.filter((item) => postHasPlayableVideo(item.item));
    const newVisibleIds = new Set(videoItems.map((item) => (item.item as Post).id));
    setVisibleVideoPostIds(newVisibleIds);

    if (videoItems.length > 0) {
      const sortedIndices = visibleItems
        .map((v) => v.index ?? 0)
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
      setActiveVideoPostId(bestDist <= maxDist ? (best.item as Post).id : null);
    } else {
      setActiveVideoPostId(null);
    }
  }, [activeTab]);

  const activeVideoPostIdRef = useRef(activeVideoPostId);
  activeVideoPostIdRef.current = activeVideoPostId;

  const onSavedPostsViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      pendingSavedPostsViewableRef.current = viewableItems;

      const currentActive = activeVideoPostIdRef.current;
      if (currentActive) {
        const stillVisible = viewableItems.some(
          (v) =>
            v.isViewable &&
            v.item &&
            typeof v.item === "object" &&
            "id" in v.item &&
            (v.item as Post).id === currentActive,
        );
        if (!stillVisible) {
          setActiveVideoPostId(null);
        }
      }

      if (savedPostsDeferHandleRef.current !== null) {
        clearTimeout(savedPostsDeferHandleRef.current);
      }
      savedPostsDeferHandleRef.current = setTimeout(
        flushSavedPostsViewability,
        Platform.OS === "ios" ? 200 : 150,
      );
    },
  ).current;

  const handleSavedPostsMomentumScrollEnd = useCallback(() => {
    if (savedPostsDeferHandleRef.current !== null) {
      clearTimeout(savedPostsDeferHandleRef.current);
      savedPostsDeferHandleRef.current = null;
    }
    if (Platform.OS === "ios") {
      requestAnimationFrame(() => {
        requestAnimationFrame(flushSavedPostsViewability);
      });
    } else {
      setTimeout(() => {
        requestAnimationFrame(flushSavedPostsViewability);
      }, 50);
    }
  }, [flushSavedPostsViewability]);

  useEffect(() => {
    if (activeTab === 0) return;
    setVisibleVideoPostIds(new Set());
    setActiveVideoPostId(null);
  }, [activeTab]);

  useEffect(() => {
    if (postsWithOverrides.length !== 0) return;
    setVisibleVideoPostIds(new Set());
    setActiveVideoPostId(null);
  }, [postsWithOverrides.length]);

  useEffect(() => {
    return () => {
      if (savedPostsDeferHandleRef.current !== null) {
        clearTimeout(savedPostsDeferHandleRef.current);
      }
    };
  }, []);

  const { currentState } = useAppState({
    onBackground: () => {
      if (savedPostsDeferHandleRef.current !== null) {
        clearTimeout(savedPostsDeferHandleRef.current);
        savedPostsDeferHandleRef.current = null;
      }
      setVisibleVideoPostIds(new Set());
      setActiveVideoPostId(null);
    },
    onForeground: () => {
      if (activeTab !== 0) return;
      if (savedPostsDeferHandleRef.current !== null) {
        clearTimeout(savedPostsDeferHandleRef.current);
        savedPostsDeferHandleRef.current = null;
      }
      requestAnimationFrame(() => {
        flushSavedPostsViewability();
      });
    },
  });

  return {
    activeVideoPostId,
    allowAutoplay,
    currentState,
    handleSavedPostsMomentumScrollEnd,
    onSavedPostsViewableItemsChanged,
    savedPostsViewabilityConfig,
    visibleVideoPostIds,
  };
}
