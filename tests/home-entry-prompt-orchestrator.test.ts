// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, test } from "bun:test";

import {
  HAS_SEEN_ADULT_PROMPT_DEFAULT,
  MODERATION_REMINDER_SNOOZE_MS,
  claimHomeEntryOsPrompt,
  getHomeEntryFocused,
  isHomeEntrySurfaceReady,
  normalizeReminderUserKey,
  resetHomeEntryOsPromptClaims,
  resetHomeEntryPromptOrchestrator,
  resolveHomeEntryPrompt,
  resolvePersistedHasSeenAdultPrompt,
  selectModerationReminderState,
  setHomeEntryFocused,
  subscribeHomeEntryFocused,
  type HomeEntryPromptState,
} from "../src/services/home-entry-prompt-orchestrator";

const readyState: HomeEntryPromptState = {
  isInitializing: false,
  isAuthenticated: true,
  isAppActive: true,
  isHomeFocused: true,
  hasCurrentUser: true,
  hasSeenAdultPrompt: true,
  moderationReminderUnderstood: true,
  moderationReminderSnoozedUntil: 0,
  nowMs: 1_000,
  analyticsConsentAsked: true,
  canRequestOsPermissions: true,
  hasWalletAddress: true,
};

afterEach(() => {
  resetHomeEntryPromptOrchestrator();
});

describe("persisted adult prompt default", () => {
  test("new users default to unseen without resetting explicit answers", () => {
    expect(HAS_SEEN_ADULT_PROMPT_DEFAULT).toBe(false);
    expect(resolvePersistedHasSeenAdultPrompt(undefined)).toBe(false);
    expect(resolvePersistedHasSeenAdultPrompt(true)).toBe(true);
    expect(resolvePersistedHasSeenAdultPrompt(false)).toBe(false);
  });
});

describe("home-entry prompt eligibility", () => {
  test("waits until an authenticated, initialized, active, focused Home landing", () => {
    expect(isHomeEntrySurfaceReady(readyState)).toBe(true);
    expect(isHomeEntrySurfaceReady({
      ...readyState,
      isInitializing: true,
    })).toBe(false);
    expect(isHomeEntrySurfaceReady({
      ...readyState,
      isAuthenticated: false,
    })).toBe(false);
    expect(isHomeEntrySurfaceReady({
      ...readyState,
      isAppActive: false,
    })).toBe(false);
    expect(isHomeEntrySurfaceReady({
      ...readyState,
      isHomeFocused: false,
    })).toBe(false);
    expect(isHomeEntrySurfaceReady({
      ...readyState,
      hasCurrentUser: false,
    })).toBe(false);
    expect(resolveHomeEntryPrompt({
      ...readyState,
      isInitializing: true,
      hasSeenAdultPrompt: false,
    })).toBeNull();
    expect(resolveHomeEntryPrompt({
      ...readyState,
      isAuthenticated: false,
      hasSeenAdultPrompt: false,
    })).toBeNull();
  });
});

describe("home-entry prompt order", () => {
  test("shows adult first and never overlaps later prompts", () => {
    expect(resolveHomeEntryPrompt({
      ...readyState,
      hasSeenAdultPrompt: false,
      moderationReminderUnderstood: false,
      analyticsConsentAsked: false,
    })).toBe("adult");
  });

  test("shows moderation immediately after adult with no age timer", () => {
    expect(resolveHomeEntryPrompt({
      ...readyState,
      hasSeenAdultPrompt: true,
      moderationReminderUnderstood: false,
      moderationReminderSnoozedUntil: 0,
      nowMs: 1,
      analyticsConsentAsked: false,
    })).toBe("moderation");
  });

  test("uses a 7-day explicit snooze and no timer-based initial gate", () => {
    expect(MODERATION_REMINDER_SNOOZE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(resolveHomeEntryPrompt({
      ...readyState,
      hasSeenAdultPrompt: true,
      moderationReminderUnderstood: false,
      moderationReminderSnoozedUntil: 0,
      nowMs: 1,
    })).toBe("moderation");
    expect(resolveHomeEntryPrompt({
      ...readyState,
      hasSeenAdultPrompt: true,
      moderationReminderUnderstood: false,
      moderationReminderSnoozedUntil: 1 + MODERATION_REMINDER_SNOOZE_MS,
      nowMs: 1,
    })).toBe("notification_permission");
  });

  test("preserves understood and explicit snooze state", () => {
    expect(resolveHomeEntryPrompt({
      ...readyState,
      moderationReminderUnderstood: true,
      analyticsConsentAsked: false,
    })).toBe("analytics_consent");
    expect(resolveHomeEntryPrompt({
      ...readyState,
      moderationReminderUnderstood: false,
      moderationReminderSnoozedUntil: 2_000,
      nowMs: 1_000,
      analyticsConsentAsked: false,
    })).toBe("analytics_consent");
    expect(resolveHomeEntryPrompt({
      ...readyState,
      moderationReminderUnderstood: false,
      moderationReminderSnoozedUntil: 1_000,
      nowMs: 1_000,
      analyticsConsentAsked: true,
    })).toBe("moderation");
  });

  test("requests analytics then notification permission after home prompts", () => {
    expect(resolveHomeEntryPrompt({
      ...readyState,
      analyticsConsentAsked: false,
    })).toBe("analytics_consent");
    expect(resolveHomeEntryPrompt(readyState)).toBe("notification_permission");
    expect(resolveHomeEntryPrompt({
      ...readyState,
      canRequestOsPermissions: false,
      analyticsConsentAsked: false,
    })).toBeNull();
    expect(resolveHomeEntryPrompt({
      ...readyState,
      hasWalletAddress: false,
    })).toBeNull();
  });

  test("does not request analytics or notification permission before Home is focused", () => {
    expect(resolveHomeEntryPrompt({
      ...readyState,
      isHomeFocused: false,
      analyticsConsentAsked: false,
    })).toBeNull();
    expect(resolveHomeEntryPrompt({
      ...readyState,
      isHomeFocused: false,
    })).toBeNull();
  });
});

describe("home-entry focus and OS prompt claims", () => {
  test("notifies listeners only when Home focus changes", () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeHomeEntryFocused(() => {
      seen.push(getHomeEntryFocused());
    });

    setHomeEntryFocused(false);
    setHomeEntryFocused(true);
    setHomeEntryFocused(true);
    setHomeEntryFocused(false);
    unsubscribe();
    setHomeEntryFocused(true);

    expect(seen).toEqual([true, false]);
    expect(getHomeEntryFocused()).toBe(true);
  });

  test("keys snooze and dismiss per lowercased wallet so account switch is isolated", () => {
    expect(normalizeReminderUserKey("  MIRAGE1ABC  ")).toBe("mirage1abc");
    const understood = { mirage1abc: true };
    const snoozed = { mirage1xyz: 9_000 };

    expect(selectModerationReminderState("MIRAGE1ABC", understood, snoozed)).toEqual({
      understood: true,
      snoozedUntil: 0,
    });
    expect(selectModerationReminderState("mirage1xyz", understood, snoozed)).toEqual({
      understood: false,
      snoozedUntil: 9_000,
    });
    expect(selectModerationReminderState("mirage1other", understood, snoozed)).toEqual({
      understood: false,
      snoozedUntil: 0,
    });
  });

  test("claims each OS prompt once so analytics and notification cannot race", () => {
    expect(claimHomeEntryOsPrompt("analytics_consent")).toBe(true);
    expect(claimHomeEntryOsPrompt("analytics_consent")).toBe(false);
    expect(claimHomeEntryOsPrompt("notification_permission")).toBe(true);
    expect(claimHomeEntryOsPrompt("notification_permission")).toBe(false);
    resetHomeEntryOsPromptClaims();
    expect(claimHomeEntryOsPrompt("analytics_consent")).toBe(true);
  });
});
