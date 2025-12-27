import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

export type FeedType = "home" | "popular" | "news" | "watch" | "latest";

type PreferencesState = {
  adultContentEnabled: boolean;
  hasSeenAdultPrompt: boolean;
  feedType: FeedType;

  // Actions
  setAdultContent: (enabled: boolean) => void;
  setHasSeenAdultPrompt: () => void;
  setFeedType: (type: FeedType) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      adultContentEnabled: false,
      hasSeenAdultPrompt: false,
      feedType: "home",

      setAdultContent: (enabled) => set({ adultContentEnabled: enabled }),
      setHasSeenAdultPrompt: () => set({ hasSeenAdultPrompt: true }),
      setFeedType: (type) => set({ feedType: type }),
    }),
    {
      name: "preferences-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
