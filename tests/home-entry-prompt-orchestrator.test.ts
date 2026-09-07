// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, test } from "bun:test";

import {
  HAS_SEEN_ADULT_PROMPT_DEFAULT,
  claimHomeEntryOsPrompt,
  getHomeEntryFocused,
  isHomeEntrySurfaceReady,
  resetHomeEntryOsPromptClaims,
  resetHomeEntryPromptOrchestrator,
  resolveHomeEntryPrompt,
  resolvePersistedHasSeenAdultPrompt,
  setHomeEntryFocused,
  subscribeHomeEntryFocused,
  type HomeEntryPromptState,
} from "../src/services/home-entry-prompt-orchestrator";

const readyState: HomeEntryPromptState = {
  preferencesHydrated: true,
  isInitializing: false,
  isAuthenticated: true,
  isAppActive: true,
  isHomeFocused: true,
  hasCurrentUser: true,
  hasSeenAdultPrompt: true,
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
      analyticsConsentAsked: false,
    })).toBe("adult");
  });

  test("does not insert a retired agent moderation reminder", () => {
    expect(resolveHomeEntryPrompt({
      ...readyState,
      hasSeenAdultPrompt: true,
      analyticsConsentAsked: false,
    })).toBe("analytics_consent");
    expect(resolveHomeEntryPrompt(readyState)).toBe("notification_permission");
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

  test("claims each OS prompt once so analytics and notification cannot race", () => {
    expect(claimHomeEntryOsPrompt("analytics_consent")).toBe(true);
    expect(claimHomeEntryOsPrompt("analytics_consent")).toBe(false);
    expect(claimHomeEntryOsPrompt("notification_permission")).toBe(true);
    expect(claimHomeEntryOsPrompt("notification_permission")).toBe(false);
    resetHomeEntryOsPromptClaims();
    expect(claimHomeEntryOsPrompt("analytics_consent")).toBe(true);
  });
});
