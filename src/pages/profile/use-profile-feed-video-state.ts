import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, type ViewToken } from "react-native";

import type { Post as ApiPost } from "@/src/api/types";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import type { Post } from "@/src/components/molecules";
import { useAppState } from "@/src/hooks";
import {
  createScrollDirectionTracker,
  getWarmWindowBounds,
} from "@/src/utils/video-warm-window";

export type ProfileFeedListItem = Post | ApiPost | "header" | "tabs";

type UseProfileFeedVideoStateOptions = {
  activeTab: number;
  listData: ProfileFeedListItem[];
};

const isUiPost = (item: unknown): item is Post => {
  return !!item && typeof item === "object" && "id" in item;
};

export function useProfileFeedVideoState({
  activeTab,
  listData,
}: UseProfileFeedVideoStateOptions) {
  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  const [visibleVideoPostIds, setVisibleVideoPostIds] = useState<Set<string>>(
    new Set(),
  );
  const [nearbyVideoPostIds, setNearbyVideoPostIds] = useState<Set<string>>(
    new Set(),
  );

  const profileViewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 30,
    minimumViewTime: 300,
  }).current;

  const pendingProfileViewableRef = useRef<ViewToken[] | null>(null);
  const profileDeferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const listDataRef = useRef(listData);
  listDataRef.current = listData;
  const scrollDirectionTrackerRef = useRef(createScrollDirectionTracker());

  const clearDeferredViewability = useCallback(() => {
    if (profileDeferHandleRef.current !== null) {
      clearTimeout(profileDeferHandleRef.current);
      profileDeferHandleRef.current = null;
    }
  }, []);

  const resetVideoState = useCallback(() => {
    scrollDirectionTrackerRef.current.reset();
    setVisibleVideoPostIds(new Set());
    setNearbyVideoPostIds(new Set());
    setActiveVideoPostId(null);
  }, []);

  const flushProfileViewability = useCallback(() => {
    const items = pendingProfileViewableRef.current;
    if (!items) return;

    const visibleItems = items.filter((item) => {
      return item.isViewable && isUiPost(item.item);
    });

    if (visibleItems.length === 0) {
      resetVideoState();
      return;
    }

    const videoItems = visibleItems.filter((item) => {
      return isUiPost(item.item) && postHasPlayableVideo(item.item);
    });
    const newVisibleIds = new Set(videoItems.map((item) => item.item.id));
    setVisibleVideoPostIds(newVisibleIds);

    const nearbyIds = new Set(newVisibleIds);
    const allData = listDataRef.current;
    if (allData.length > 0 && visibleItems.length > 0) {
      const indices = visibleItems.map((v) => v.index ?? 0);
      const minIdx = Math.min(...indices);
      const maxIdx = Math.max(...indices);
      const direction = scrollDirectionTrackerRef.current.update(minIdx);
      const { lo, hi } = getWarmWindowBounds(minIdx, maxIdx, direction, allData.length);
      for (let i = lo; i <= hi; i++) {
        const post = allData[i];
        if (isUiPost(post) && postHasPlayableVideo(post)) {
          nearbyIds.add(post.id);
        }
      }
    }
    setNearbyVideoPostIds(nearbyIds);

    if (videoItems.length === 0) {
      setActiveVideoPostId(null);
      return;
    }

    const sortedIndices = visibleItems
      .map((v) => v.index ?? 0)
      .sort((a, b) => a - b);
    const mid = Math.floor((sortedIndices.length - 1) / 2);
    const centerIndex = sortedIndices[mid] ?? 0;
    const visibleSpan =
      (sortedIndices[sortedIndices.length - 1] ?? 0) - (sortedIndices[0] ?? 0);
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

    setActiveVideoPostId(bestDist <= maxDist ? best.item.id : null);
  }, [resetVideoState]);

  const activeVideoPostIdRef = useRef(activeVideoPostId);
  activeVideoPostIdRef.current = activeVideoPostId;

  const onProfileViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      pendingProfileViewableRef.current = viewableItems;

      const currentActive = activeVideoPostIdRef.current;
      if (currentActive) {
        const stillVisible = viewableItems.some((item) => {
          return (
            item.isViewable &&
            isUiPost(item.item) &&
            item.item.id === currentActive
          );
        });
        if (!stillVisible) {
          setActiveVideoPostId(null);
        }
      }

      clearDeferredViewability();
      profileDeferHandleRef.current = setTimeout(
        flushProfileViewability,
        Platform.OS === "ios" ? 200 : 150,
      );
    },
    [clearDeferredViewability, flushProfileViewability],
  );

  const handleProfileMomentumScrollEnd = useCallback(() => {
    clearDeferredViewability();
    if (Platform.OS === "ios") {
      requestAnimationFrame(() => {
        requestAnimationFrame(flushProfileViewability);
      });
    } else {
      setTimeout(() => {
        requestAnimationFrame(flushProfileViewability);
      }, 50);
    }
  }, [clearDeferredViewability, flushProfileViewability]);

  const revealVideoPost = useCallback((postId: string) => {
    setActiveVideoPostId(postId);
    setVisibleVideoPostIds((prev) => {
      const next = new Set(prev);
      next.add(postId);
      return next;
    });
  }, []);

  useEffect(() => {
    return clearDeferredViewability;
  }, [clearDeferredViewability]);

  useAppState({
    onBackground: () => {
      clearDeferredViewability();
      resetVideoState();
    },
    onForeground: () => {
      if (activeTab !== 0) return;
      clearDeferredViewability();
      requestAnimationFrame(() => {
        flushProfileViewability();
      });
    },
  });

  return {
    activeVideoPostId,
    visibleVideoPostIds,
    nearbyVideoPostIds,
    profileViewabilityConfig,
    onProfileViewableItemsChanged,
    handleProfileMomentumScrollEnd,
    revealVideoPost,
  };
}
