import type { Post as ApiPost } from "@/src/api/types";
import type { Post } from "@/src/components/molecules";
import { postHasPlayableVideo } from "@/src/components/molecules/post-card-utils";
import { useAppState } from "@/src/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, type ViewToken } from "react-native";

import type { UserProfileListItem } from "./user-profile-utils";

type UseUserProfileViewabilityParams = {
  activeTab: number;
  isBlocked: boolean;
  isFocused: boolean;
  listData: UserProfileListItem[];
  postsWithVotes: Post[];
};

export function useUserProfileViewability({
  activeTab,
  isBlocked,
  isFocused,
  listData,
  postsWithVotes,
}: UseUserProfileViewabilityParams) {
  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  const [visibleVideoPostIds, setVisibleVideoPostIds] = useState<Set<string>>(new Set());
  const [warmVideoPostIds, setWarmVideoPostIds] = useState<Set<string>>(new Set());
  const [revealedPosts, setRevealedPosts] = useState<Set<string>>(new Set());

  const handleRevealContent = useCallback(
    (postId: string) => {
      setRevealedPosts((prev) => {
        const next = new Set(prev);
        next.add(postId);
        return next;
      });

      const post = postsWithVotes.find((candidate) => candidate.id === postId);
      if (postHasPlayableVideo(post)) {
        setActiveVideoPostId(postId);
        setVisibleVideoPostIds((prev) => {
          const next = new Set(prev);
          next.add(postId);
          return next;
        });
      }
    },
    [postsWithVotes],
  );

  const profileViewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 30,
    minimumViewTime: 300,
  }).current;

  const pendingProfileViewableRef = useRef<ViewToken[] | null>(null);
  const profileDeferHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listDataRef = useRef(listData);
  listDataRef.current = listData;

  const flushProfileViewability = useCallback(() => {
    const items = pendingProfileViewableRef.current;
    if (!items) return;

    const visibleItems = items.filter(
      (item) =>
        item.isViewable &&
        item.item &&
        typeof item.item === "object" &&
        "id" in item.item,
    );

    if (visibleItems.length === 0) {
      setVisibleVideoPostIds(new Set());
      setWarmVideoPostIds(new Set());
      setActiveVideoPostId(null);
      return;
    }

    const videoItems = visibleItems.filter((item) => postHasPlayableVideo(item.item));
    const newVisibleIds = new Set(videoItems.map((item) => (item.item as Post).id));
    setVisibleVideoPostIds(newVisibleIds);

    const warmVideoIds = new Set<string>(newVisibleIds);
    const sortedVisibleIndices = visibleItems
      .map((v) => v.index ?? 0)
      .sort((a, b) => a - b);
    const currentListData = listDataRef.current;
    const warmMinIndex = Math.max(0, (sortedVisibleIndices[0] ?? 0) - 2);
    const warmMaxIndex = Math.min(
      currentListData.length - 1,
      (sortedVisibleIndices[sortedVisibleIndices.length - 1] ?? 0) + 2,
    );

    for (let i = warmMinIndex; i <= warmMaxIndex; i++) {
      const listItem = currentListData[i];
      if (
        listItem &&
        typeof listItem === "object" &&
        "id" in listItem &&
        postHasPlayableVideo(listItem)
      ) {
        warmVideoIds.add(listItem.id);
      }
    }

    setWarmVideoPostIds(warmVideoIds);

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

      setActiveVideoPostId(
        bestDist <= maxDist ? ((best.item as Post).id ?? null) : null,
      );
    } else {
      setActiveVideoPostId(null);
    }
  }, []);

  const activeVideoPostIdRef = useRef(activeVideoPostId);
  activeVideoPostIdRef.current = activeVideoPostId;

  const onProfileViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      pendingProfileViewableRef.current = viewableItems;

      const currentActive = activeVideoPostIdRef.current;
      if (currentActive) {
        const stillVisible = viewableItems.some(
          (item) =>
            item.isViewable &&
            item.item &&
            typeof item.item === "object" &&
            "id" in item.item &&
            (item.item as Post | ApiPost).id === currentActive,
        );
        if (!stillVisible) {
          setActiveVideoPostId(null);
        }
      }

      if (profileDeferHandleRef.current !== null) {
        clearTimeout(profileDeferHandleRef.current);
      }
      profileDeferHandleRef.current = setTimeout(
        flushProfileViewability,
        Platform.OS === "ios" ? 200 : 150,
      );
    },
  ).current;

  const handleProfileMomentumScrollEnd = useCallback(() => {
    if (profileDeferHandleRef.current !== null) {
      clearTimeout(profileDeferHandleRef.current);
      profileDeferHandleRef.current = null;
    }
    if (Platform.OS === "ios") {
      requestAnimationFrame(() => {
        requestAnimationFrame(flushProfileViewability);
      });
    } else {
      setTimeout(() => {
        requestAnimationFrame(flushProfileViewability);
      }, 50);
    }
  }, [flushProfileViewability]);

  useEffect(() => {
    return () => {
      if (profileDeferHandleRef.current !== null) {
        clearTimeout(profileDeferHandleRef.current);
      }
    };
  }, []);

  useAppState({
    onBackground: () => {
      if (profileDeferHandleRef.current !== null) {
        clearTimeout(profileDeferHandleRef.current);
        profileDeferHandleRef.current = null;
      }
      setVisibleVideoPostIds(new Set());
      setWarmVideoPostIds(new Set());
      setActiveVideoPostId(null);
    },
    onForeground: () => {
      if (activeTab !== 0 || isBlocked || !isFocused) return;
      if (profileDeferHandleRef.current !== null) {
        clearTimeout(profileDeferHandleRef.current);
        profileDeferHandleRef.current = null;
      }
      requestAnimationFrame(() => {
        flushProfileViewability();
      });
    },
  });

  return {
    activeVideoPostId,
    handleProfileMomentumScrollEnd,
    handleRevealContent,
    onProfileViewableItemsChanged,
    profileViewabilityConfig,
    revealedPosts,
    visibleVideoPostIds,
    warmVideoPostIds,
  };
}
