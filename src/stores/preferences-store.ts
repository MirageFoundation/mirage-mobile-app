import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

export type FeedType = "home" | "popular" | "news" | "watch" | "latest";
export type ThemeMode = "light" | "dark" | "system";
export type ContentFilter = "all" | "sfw" | "custom";

type PreferencesState = {
  // Feed
  feedType: FeedType;

  // Theme
  theme: ThemeMode;

  // Content
  adultContentEnabled: boolean;
  hasSeenAdultPrompt: boolean;
  contentFilter: ContentFilter;
  blurSensitiveMedia: boolean;
  hideDownvotedPosts: boolean;

  // Comments
  autoCollapseThreshold: number | null; // -10, -5, -3, -1, 0, or null (never)

  // Sidebar
  topicsBeforeShowMore: number; // 3, 5, 7, 10, or -1 (all)
  peopleBeforeShowMore: number; // 3, 5, 7, 10, or -1 (all)

  // Actions
  setFeedType: (type: FeedType) => void;
  setTheme: (theme: ThemeMode) => void;
  setAdultContent: (enabled: boolean) => void;
  setHasSeenAdultPrompt: () => void;
  setContentFilter: (filter: ContentFilter) => void;
  setBlurSensitiveMedia: (blur: boolean) => void;
  setHideDownvotedPosts: (hide: boolean) => void;
  setAutoCollapseThreshold: (threshold: number | null) => void;
  setTopicsBeforeShowMore: (count: number) => void;
  setPeopleBeforeShowMore: (count: number) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      // Feed
      feedType: "home",

      // Theme
      theme: "system",

      // Content
      adultContentEnabled: false,
      hasSeenAdultPrompt: false,
      contentFilter: "all",
      blurSensitiveMedia: true,
      hideDownvotedPosts: false,

      // Comments
      autoCollapseThreshold: -5,

      // Sidebar
      topicsBeforeShowMore: 5,
      peopleBeforeShowMore: 5,

      // Actions
      setFeedType: (type) => set({ feedType: type }),
      setTheme: (theme) => set({ theme }),
      setAdultContent: (enabled) => set({ adultContentEnabled: enabled }),
      setHasSeenAdultPrompt: () => set({ hasSeenAdultPrompt: true }),
      setContentFilter: (filter) => set({ contentFilter: filter }),
      setBlurSensitiveMedia: (blur) => set({ blurSensitiveMedia: blur }),
      setHideDownvotedPosts: (hide) => set({ hideDownvotedPosts: hide }),
      setAutoCollapseThreshold: (threshold) =>
        set({ autoCollapseThreshold: threshold }),
      setTopicsBeforeShowMore: (count) => set({ topicsBeforeShowMore: count }),
      setPeopleBeforeShowMore: (count) => set({ peopleBeforeShowMore: count }),
    }),
    {
      name: "preferences-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
