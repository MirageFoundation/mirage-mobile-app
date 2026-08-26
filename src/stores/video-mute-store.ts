import { create } from "zustand";

type VideoMuteState = {
  isMuted: boolean;
  audioOwnerId: string | null;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  requestAudioFocus: (ownerId: string) => void;
  releaseAudioFocus: (ownerId: string) => void;
  clearAudioFocus: () => void;
};

export const useVideoMuteStore = create<VideoMuteState>((set) => ({
  isMuted: true,
  audioOwnerId: null,
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setMuted: (muted) => set({ isMuted: muted }),
  requestAudioFocus: (ownerId) =>
    set((state) => (state.audioOwnerId === ownerId ? state : { audioOwnerId: ownerId })),
  releaseAudioFocus: (ownerId) =>
    set((state) => (state.audioOwnerId === ownerId ? { audioOwnerId: null } : state)),
  clearAudioFocus: () => set({ audioOwnerId: null }),
}));
