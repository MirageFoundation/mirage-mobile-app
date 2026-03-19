import { useCallback } from "react";
import { useAuthStore, useUIStore } from "@/src/stores";
import { useRouter } from "@/src/hooks/use-router";

export const useAuthGuard = () => {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const hasUsername = useAuthStore((s) => s.hasUsername);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const router = useRouter();

  const requireAuth = useCallback(
    (action: () => void) => {
      if (!isLoggedIn) {
        showAuthSheet();
        return;
      }
      if (!hasUsername) {
        router.push("/change-username");
        return;
      }
      action();
    },
    [isLoggedIn, hasUsername, showAuthSheet, router]
  );

  return { requireAuth, isLoggedIn, hasUsername };
};
