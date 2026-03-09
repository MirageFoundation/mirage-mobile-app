import { create } from "zustand";

interface CloudflareErrorState {
 hasError: boolean;
 setHasError: (value: boolean) => void;
}

export const useCloudflareErrorStore = create<CloudflareErrorState>((set) => ({
 hasError: false,
 setHasError: (value) => set({ hasError: value }),
}));
