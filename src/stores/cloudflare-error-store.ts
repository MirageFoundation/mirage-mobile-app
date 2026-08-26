import { create } from "zustand";

interface CloudflareErrorState {
 hasError: boolean;
 errorCode: number | null;
 setError: (code: number) => void;
 clearError: () => void;
}

export const useCloudflareErrorStore = create<CloudflareErrorState>((set) => ({
 hasError: false,
 errorCode: null,
 setError: (code) => set({ hasError: true, errorCode: code }),
 clearError: () => set({ hasError: false, errorCode: null }),
}));
