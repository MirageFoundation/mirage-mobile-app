import { create } from "zustand";

type VideoMuteState = {
  isMuted: boolean;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
};

export const useVideoMuteStore = create<VideoMuteState>((set) => ({
  isMuted: true,
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setMuted: (muted) => set({ isMuted: muted }),
}));
