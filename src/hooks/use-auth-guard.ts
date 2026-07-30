import { useCallback } from "react";
import { useAuthStore, useUIStore } from "@/src/stores";
import { useRouter } from "@/src/navigation/guarded-router";
import * as Sentry from "@sentry/react-native";

export const useAuthGuard = () => {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const hasUsername = useAuthStore((s) => s.hasUsername);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const router = useRouter();

  const requireAuth = useCallback(
    (action: () => void) => {
      if (!isLoggedIn) {
        Sentry.addBreadcrumb({
          category: "auth-gate",
          message: "Auth required for guarded action",
          level: "info",
          data: { isLoggedIn, hasUsername },
        });
        showAuthSheet();
        return;
      }
      if (!hasUsername) {
        Sentry.addBreadcrumb({
          category: "auth-gate",
          message: "Username required for guarded action",
          level: "info",
          data: { isLoggedIn, hasUsername },
        });
        router.push("/change-username");
        return;
      }
      action();
    },
    [isLoggedIn, hasUsername, showAuthSheet, router]
  );

  return { requireAuth, isLoggedIn, hasUsername };
};
