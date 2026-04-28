import { AppState, type AppStateStatus, type NativeEventSubscription } from "react-native";
import { create } from "zustand";

type TimeTickStore = {
  tick: number;
  bump: () => void;
};

const TIME_TICK_INTERVAL_MS = 10_000;

let tickInterval: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
let startCount = 0;
let appState: AppStateStatus = AppState.currentState;

function clearTickInterval() {
  if (!tickInterval) return;
  clearInterval(tickInterval);
  tickInterval = null;
}

function bumpTimeTick() {
  useTimeTickStore.getState().bump();
}

function restartTickInterval() {
  clearTickInterval();
  if (appState !== "active") return;
  tickInterval = setInterval(() => {
    bumpTimeTick();
  }, TIME_TICK_INTERVAL_MS);
}

export const useTimeTickStore = create<TimeTickStore>((set) => ({
  tick: 0,
  bump: () => set((s) => ({ tick: s.tick + 1 })),
}));

export function startTimeTicking() {
  startCount += 1;
  if (startCount > 1) return;

  appState = AppState.currentState;
  bumpTimeTick();
  restartTickInterval();

  appStateSubscription = AppState.addEventListener("change", (nextState) => {
    appState = nextState;
    if (nextState === "active") {
      bumpTimeTick();
    }
    restartTickInterval();
  });
}

export function stopTimeTicking() {
  startCount = Math.max(0, startCount - 1);
  if (startCount > 0) return;

  clearTickInterval();
  appStateSubscription?.remove();
  appStateSubscription = null;
}
