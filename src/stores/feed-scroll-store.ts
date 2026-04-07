import { create } from "zustand";

type FeedScrollStore = {
  scrollingByContext: Record<string, boolean>;
  setContextScrolling: (context: string, isScrolling: boolean) => void;
};

export const useFeedScrollStore = create<FeedScrollStore>((set) => ({
  scrollingByContext: {},
  setContextScrolling: (context, isScrolling) =>
    set((state) => {
      if (!context) return state;
      if ((state.scrollingByContext[context] ?? false) === isScrolling) {
        return state;
      }
      return {
        scrollingByContext: {
          ...state.scrollingByContext,
          [context]: isScrolling,
        },
      };
    }),
}));

export const useIsFeedScrolling = (context?: string) =>
  useFeedScrollStore((state) => (context ? (state.scrollingByContext[context] ?? false) : false));
