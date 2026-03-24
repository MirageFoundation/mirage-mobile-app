import { create } from "zustand";

type TimeTickStore = {
  tick: number;
  bump: () => void;
};

export const useTimeTickStore = create<TimeTickStore>((set) => ({
  tick: 0,
  bump: () => set((s) => ({ tick: s.tick + 1 })),
}));
