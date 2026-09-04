import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { ModerationReminderCard } from "@/src/components/molecules";
import { useRouter } from "@/src/navigation/guarded-router";
import { MODERATION_REMINDER_SNOOZE_MS } from "@/src/services/home-entry-prompt-orchestrator";
import { useResolvedHomeEntryPrompt } from "@/src/services/use-resolved-home-entry-prompt";
import { useAuthStore, usePreferencesStore } from "@/src/stores";

export function useHomeEntryPrompts() {
  const router = useRouter();
  const nextPrompt = useResolvedHomeEntryPrompt();
  const currentUserId = useAuthStore((state) => state.user?.id ?? "");
  const setHasSeenAdultPrompt = usePreferencesStore((state) => state.setHasSeenAdultPrompt);
  const setAdultPromptDismissedAt = usePreferencesStore((state) => state.setAdultPromptDismissedAt);
  const setAdultContent = usePreferencesStore((state) => state.setAdultContent);
  const dismissModerationReminder = usePreferencesStore(
    (state) => state.dismissModerationReminder,
  );
  const snoozeModerationReminder = usePreferencesStore(
    (state) => state.snoozeModerationReminder,
  );
  const moderationReminderShownForRef = useRef<string | null>(null);

  const showAdultPopup = nextPrompt === "adult";
  const showModerationReminder = nextPrompt === "moderation";

  useEffect(() => {
    if (!showModerationReminder || !currentUserId) {
      moderationReminderShownForRef.current = null;
      return;
    }
    if (moderationReminderShownForRef.current === currentUserId) return;
    moderationReminderShownForRef.current = currentUserId;
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Moderation reminder shown",
      level: "info",
      data: { userId: currentUserId },
    });
  }, [currentUserId, showModerationReminder]);

  const chooseModerationAgents = useCallback(() => {
    if (!currentUserId) return;
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Choose agents pressed",
      level: "info",
      data: { userId: currentUserId },
    });
    dismissModerationReminder(currentUserId);
    router.push("/agents");
  }, [currentUserId, dismissModerationReminder, router]);

  const dismissReminder = useCallback(() => {
    if (!currentUserId) return;
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Moderation reminder dismissed",
      level: "info",
      data: { userId: currentUserId },
    });
    dismissModerationReminder(currentUserId);
  }, [currentUserId, dismissModerationReminder]);

  const snoozeReminder = useCallback(() => {
    if (!currentUserId) return;
    const snoozedUntil = Date.now() + MODERATION_REMINDER_SNOOZE_MS;
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Moderation reminder snoozed",
      level: "info",
      data: { userId: currentUserId, snoozedUntil },
    });
    snoozeModerationReminder(currentUserId, snoozedUntil);
  }, [currentUserId, snoozeModerationReminder]);

  const moderationReminderHeader = useMemo(() => {
    if (!showModerationReminder) return null;
    return (
      <ModerationReminderCard
        onChooseAgents={chooseModerationAgents}
        onUnderstand={dismissReminder}
        onRemindLater={snoozeReminder}
      />
    );
  }, [chooseModerationAgents, dismissReminder, showModerationReminder, snoozeReminder]);

  const updateAdultPreference = useCallback((enabled: boolean) => {
    const dismissedAt = Date.now();
    setAdultContent(enabled);
    setHasSeenAdultPrompt();
    setAdultPromptDismissedAt(dismissedAt);
    Sentry.addBreadcrumb({
      category: "content_filter",
      message: enabled
        ? "iOS: Adult content enabled via popup"
        : "iOS: Adult content declined via popup",
      level: "info",
    });
    Sentry.addBreadcrumb({
      category: "moderation_reminder",
      message: "Adult prompt dismissed",
      level: "info",
      data: {
        action: enabled ? "enabled_adult_content" : "declined_adult_content",
        userId: currentUserId,
        dismissedAt,
      },
    });
  }, [
    currentUserId,
    setAdultContent,
    setAdultPromptDismissedAt,
    setHasSeenAdultPrompt,
  ]);

  return {
    showAdultPopup,
    showModerationReminder,
    moderationReminderHeader,
    enableAdultContent: () => updateAdultPreference(true),
    declineAdultContent: () => updateAdultPreference(false),
  };
}
