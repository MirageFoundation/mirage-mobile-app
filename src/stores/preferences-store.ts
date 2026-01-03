import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

export type FeedType = "home" | "popular" | "news" | "watch" | "latest";
export type ThemeMode = "light" | "dark" | "system";
export type ContentType =
  | "sensitive"
  | "porn"
  | "violence"
  | "gore"
  | "death"
  | "none"
  | "all";

type PreferencesState = {
  // Feed
  feedType: FeedType;

  // Theme
  theme: ThemeMode;

  // Content
  adultContentEnabled: boolean;
  hasSeenAdultPrompt: boolean;
  selectedContentTypes: ContentType[];
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
  setSelectedContentTypes: (types: ContentType[]) => void;
  toggleContentType: (type: ContentType) => void;
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
      selectedContentTypes: ["none"],
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
      setSelectedContentTypes: (types) => set({ selectedContentTypes: types }),
      toggleContentType: (type) =>
        set((state) => {
          // If selecting "all", clear others and set only "all"
          if (type === "all") {
            return { selectedContentTypes: ["all"] };
          }
          // If selecting "none", clear others and set only "none"
          if (type === "none") {
            return { selectedContentTypes: ["none"] };
          }

          // Remove "all" and "none" if selecting specific types
          let newTypes = state.selectedContentTypes.filter(
            (t) => t !== "all" && t !== "none"
          );

          // Toggle the selected type
          if (newTypes.includes(type)) {
            newTypes = newTypes.filter((t) => t !== type);
          } else {
            newTypes = [...newTypes, type];
          }

          // If nothing selected, default to "none"
          if (newTypes.length === 0) {
            return { selectedContentTypes: ["none"] };
          }

          return { selectedContentTypes: newTypes };
        }),
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
