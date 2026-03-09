import { create } from "zustand";

interface ToastLayoutState {
 powQueueToastHeight: number;
 setPowQueueToastHeight: (height: number) => void;
}

export const useToastLayoutStore = create<ToastLayoutState>((set) => ({
 powQueueToastHeight: 0,
 setPowQueueToastHeight: (height) => set({ powQueueToastHeight: height }),
}));
