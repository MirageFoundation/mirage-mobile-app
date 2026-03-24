import { create } from "zustand";

const MAX_ENTRIES = 100;

export function buildVideoPositionKey(videoId: string, scope?: string): string {
  return scope ? `${scope}::${videoId}` : videoId;
}

type VideoPositionState = {
  positions: Record<string, number>;
  getPosition: (videoId: string) => number;
  setPosition: (videoId: string, seconds: number) => void;
  clearPosition: (videoId: string) => void;
  clearAll: () => void;
};

export const useVideoPositionStore = create<VideoPositionState>((set, get) => ({
  positions: {},
  getPosition: (videoId) => get().positions[videoId] ?? 0,
  setPosition: (videoId, seconds) =>
    set((state) => {
      const positions = { ...state.positions, [videoId]: seconds };
      const keys = Object.keys(positions);
      if (keys.length > MAX_ENTRIES) {
        delete positions[keys[0]!];
      }
      return { positions };
    }),
  clearPosition: (videoId) =>
    set((state) => {
      const { [videoId]: _, ...rest } = state.positions;
      return { positions: rest };
    }),
  clearAll: () => set({ positions: {} }),
}));
