import { create } from "zustand";

type DeepLinkState = {
  pendingRoute: string | null;
  setPendingRoute: (route: string | null) => void;
  consumePendingRoute: () => string | null;
};

export const useDeepLinkStore = create<DeepLinkState>((set, get) => ({
  pendingRoute: null,
  setPendingRoute: (route) => set({ pendingRoute: route }),
  consumePendingRoute: () => {
    const route = get().pendingRoute;
    set({ pendingRoute: null });
    return route;
  },
}));
