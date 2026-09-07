import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { canRequestOsPermissions } from "@/src/navigation/auth-flow-policy";
import { isPowQueueBusy, usePowQueueStore } from "@/src/services/pow-queue";
import {
  getHomeEntryFocused,
  getAdultPromptActive,
  subscribeAdultPromptActive,
  resolveHomeEntryPrompt,
  subscribeHomeEntryFocused,
  type HomeEntryPromptId,
} from "@/src/services/home-entry-prompt-orchestrator";
import { selectAuthSessionStatus, useAuthStore } from "@/src/stores/auth-store";
import { usePreferencesStore, useTimeTickStore } from "@/src/stores";

function subscribeAppActive(onStoreChange: () => void) {
  const subscription = AppState.addEventListener("change", onStoreChange);
  return () => subscription.remove();
}

function subscribePreferencesHydration(listener: () => void) {
  const start = usePreferencesStore.persist.onHydrate(listener);
  const finish = usePreferencesStore.persist.onFinishHydration(listener);
  return () => { start(); finish(); };
}

function getAppActive() {
  return AppState.currentState === "active";
}

export function useResolvedHomeEntryPrompt(): HomeEntryPromptId | null {
  const preferencesHydrated = useSyncExternalStore(
    subscribePreferencesHydration,
    usePreferencesStore.persist.hasHydrated,
    () => false,
  );
  useSyncExternalStore(subscribeAdultPromptActive, getAdultPromptActive, getAdultPromptActive);
  const isHomeFocused = useSyncExternalStore(
    subscribeHomeEntryFocused,
    getHomeEntryFocused,
    getHomeEntryFocused,
  );
  const isAppActive = useSyncExternalStore(subscribeAppActive, getAppActive, getAppActive);
  const currentUserId = useAuthStore((state) => state.user?.id ?? "");
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const sessionStatus = useAuthStore(selectAuthSessionStatus);
  const walletAddress = useAuthStore((state) => state.walletAddress);
  const isPowBusy = usePowQueueStore(isPowQueueBusy);
  const hasSeenAdultPrompt = usePreferencesStore((state) => state.hasSeenAdultPrompt);
  const analyticsConsentAsked = usePreferencesStore((state) => state.analyticsConsentAsked);
  const timeTick = useTimeTickStore((state) => state.tick);
  void timeTick;

  return resolveHomeEntryPrompt({
    preferencesHydrated,
    isInitializing,
    isAuthenticated: sessionStatus === "authenticated",
    isAppActive,
    isHomeFocused,
    hasCurrentUser: Boolean(currentUserId),
    hasSeenAdultPrompt,
    nowMs: Date.now(),
    analyticsConsentAsked,
    canRequestOsPermissions: canRequestOsPermissions({
      sessionStatus,
      isInitializing,
      isPowBusy,
    }),
    hasWalletAddress: Boolean(walletAddress),
  });
}
