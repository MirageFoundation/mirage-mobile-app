import { create } from "zustand";

type DeepLinkState = {
  pendingRoute: string | null;
  pendingRevision: number;
  clearPendingRoute: (revision: number) => void;
  setPendingRoute: (route: string | null) => void;
  consumePendingRoute: () => string | null;
};

export const useDeepLinkStore = create<DeepLinkState>((set, get) => ({
  pendingRoute: null,
  pendingRevision: 0,
  clearPendingRoute: (revision) => {
    if (get().pendingRevision === revision) set({ pendingRoute: null, pendingRevision: revision + 1 });
  },
  setPendingRoute: (route) => set({ pendingRoute: route, pendingRevision: get().pendingRevision + 1 }),
  consumePendingRoute: () => {
    const route = get().pendingRoute;
    set({ pendingRoute: null, pendingRevision: get().pendingRevision + 1 });
    return route;
  },
}));
