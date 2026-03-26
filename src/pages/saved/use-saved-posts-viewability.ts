import type { Post } from "@/src/components/molecules";
import { usePostListViewability, type NetworkType } from "@/src/hooks";

interface UseSavedPostsViewabilityParams {
  activeTab: number;
  autoPlayVideos: boolean;
  networkType: NetworkType | null;
  postsWithOverrides: Post[];
  videoAutoplayNetwork: "always" | "wifi_only" | "never";
}

export function useSavedPostsViewability({
  activeTab,
  autoPlayVideos,
  networkType,
  postsWithOverrides,
  videoAutoplayNetwork,
}: UseSavedPostsViewabilityParams) {
  const {
    activeVideoPostId,
    allowAutoplay,
    currentState,
    handleMomentumScrollEnd,
    onViewableItemsChanged,
    viewabilityConfig,
    visibleVideoPostIds,
  } = usePostListViewability({
    enabled: activeTab === 0,
    autoPlayVideos,
    networkType,
    posts: postsWithOverrides,
    videoAutoplayNetwork,
  });

  return {
    activeVideoPostId,
    allowAutoplay,
    currentState,
    handleSavedPostsMomentumScrollEnd: handleMomentumScrollEnd,
    onSavedPostsViewableItemsChanged: onViewableItemsChanged,
    savedPostsViewabilityConfig: viewabilityConfig,
    visibleVideoPostIds,
  };
}
