import { useCallback } from "react";
import { useAuthStore, useUIStore } from "@/src/stores";

export const useAuthGuard = () => {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);

  const requireAuth = useCallback(
    (action: () => void) => {
      if (isLoggedIn) {
        action();
      } else {
        showAuthSheet();
      }
    },
    [isLoggedIn, showAuthSheet]
  );

  return { requireAuth, isLoggedIn };
};

