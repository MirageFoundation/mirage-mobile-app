import * as Sentry from "@sentry/react-native";

import { AdultContentPopup } from "@/src/components/molecules/adult-content-popup";
import { useRouter } from "@/src/navigation/guarded-router";
import { authSessionCoordinator } from "@/src/services/auth-session-coordinator";
import { useResolvedHomeEntryPrompt } from "@/src/services/use-resolved-home-entry-prompt";
import { selectAuthSessionStatus, useAuthStore } from "@/src/stores/auth-store";
import { usePreferencesStore } from "@/src/stores/preferences-store";

export function HomeEntryAdultPrompt() {
  const nextPrompt = useResolvedHomeEntryPrompt();
  const router = useRouter();
  const session = authSessionCoordinator.current();
  const answer = (enabled: boolean) => {
    if (!authSessionCoordinator.isCurrent(session)) return;
    if (selectAuthSessionStatus(useAuthStore.getState()) !== "authenticated") return;
    if (!usePreferencesStore.persist.hasHydrated()) return;
    usePreferencesStore.getState().answerAdultPrompt(enabled);
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: "Adult content preference saved",
      level: "info",
      data: { enabled },
    });
  };

  return (
    <AdultContentPopup
      visible={nextPrompt === "adult"}
      sessionKey={`${session.generation}:${session.walletAddress ?? ""}`}
      onEnable={() => answer(true)}
      onDecline={() => answer(false)}
      onGoToSettings={() => {
        if (authSessionCoordinator.isCurrent(session)) router.push("/settings");
      }}
    />
  );
}
