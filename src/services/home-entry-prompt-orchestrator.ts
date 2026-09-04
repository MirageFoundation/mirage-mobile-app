export const HAS_SEEN_ADULT_PROMPT_DEFAULT = false;

export const MODERATION_REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export const HOME_ENTRY_PROMPT_ORDER = [
  "adult",
  "moderation",
  "analytics_consent",
  "notification_permission",
] as const;

export type HomeEntryPromptId = (typeof HOME_ENTRY_PROMPT_ORDER)[number];

export type HomeEntryOsPromptId = Extract<
  HomeEntryPromptId,
  "analytics_consent" | "notification_permission"
>;

export type HomeEntryPromptState = {
  isInitializing: boolean;
  isAuthenticated: boolean;
  isAppActive: boolean;
  isHomeFocused: boolean;
  hasCurrentUser: boolean;
  hasSeenAdultPrompt: boolean;
  moderationReminderUnderstood: boolean;
  moderationReminderSnoozedUntil: number;
  nowMs: number;
  analyticsConsentAsked: boolean;
  canRequestOsPermissions: boolean;
  hasWalletAddress: boolean;
};

let homeFocused = false;
const focusListeners = new Set<() => void>();
const claimedOsPrompts = new Set<HomeEntryOsPromptId>();

export function resolvePersistedHasSeenAdultPrompt(
  persistedValue: boolean | undefined,
): boolean {
  return typeof persistedValue === "boolean"
    ? persistedValue
    : HAS_SEEN_ADULT_PROMPT_DEFAULT;
}

export function normalizeReminderUserKey(userId: string): string {
  return userId.trim().toLowerCase();
}

export function selectModerationReminderState(
  userId: string,
  understoodByUser: Record<string, boolean>,
  snoozedUntilByUser: Record<string, number>,
): { understood: boolean; snoozedUntil: number } {
  const key = normalizeReminderUserKey(userId);
  if (!key) return { understood: false, snoozedUntil: 0 };
  return {
    understood: understoodByUser[key] === true,
    snoozedUntil: snoozedUntilByUser[key] ?? 0,
  };
}

export function isHomeEntrySurfaceReady(state: HomeEntryPromptState): boolean {
  return (
    !state.isInitializing &&
    state.isAuthenticated &&
    state.isAppActive &&
    state.isHomeFocused &&
    state.hasCurrentUser
  );
}

export function resolveHomeEntryPrompt(
  state: HomeEntryPromptState,
): HomeEntryPromptId | null {
  if (!isHomeEntrySurfaceReady(state)) return null;

  if (!state.hasSeenAdultPrompt) return "adult";

  if (
    !state.moderationReminderUnderstood &&
    state.moderationReminderSnoozedUntil <= state.nowMs
  ) {
    return "moderation";
  }

  if (!state.canRequestOsPermissions) return null;
  if (!state.analyticsConsentAsked) return "analytics_consent";
  if (state.hasWalletAddress) return "notification_permission";
  return null;
}

export function setHomeEntryFocused(focused: boolean): void {
  if (homeFocused === focused) return;
  homeFocused = focused;
  focusListeners.forEach((listener) => listener());
}

export function getHomeEntryFocused(): boolean {
  return homeFocused;
}

export function subscribeHomeEntryFocused(listener: () => void): () => void {
  focusListeners.add(listener);
  return () => {
    focusListeners.delete(listener);
  };
}

export function claimHomeEntryOsPrompt(id: HomeEntryOsPromptId): boolean {
  if (claimedOsPrompts.has(id)) return false;
  claimedOsPrompts.add(id);
  return true;
}

export function resetHomeEntryOsPromptClaims(): void {
  claimedOsPrompts.clear();
}

export function resetHomeEntryPromptOrchestrator(): void {
  homeFocused = false;
  focusListeners.clear();
  resetHomeEntryOsPromptClaims();
}
