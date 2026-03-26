import * as Network from "expo-network";
import * as Sentry from "@sentry/react-native";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

export type NetworkType = "wifi" | "cellular" | "unknown" | "none";

type NetworkState = {
  isConnected: boolean;
  networkType: NetworkType;
  isWifi: boolean;
  isCellular: boolean;
};

const DEFAULT_NETWORK_STATE: NetworkState = {
  isConnected: true,
  networkType: "unknown",
  isWifi: false,
  isCellular: false,
};

let currentNetworkState: NetworkState = DEFAULT_NETWORK_STATE;
let monitoringStarted = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
const listeners = new Set<() => void>();

function emitNetworkState(nextState: NetworkState) {
  if (
    currentNetworkState.isConnected === nextState.isConnected &&
    currentNetworkState.networkType === nextState.networkType
  ) {
    return;
  }

  currentNetworkState = nextState;
  for (const listener of listeners) {
    listener();
  }
}

async function checkNetworkState() {
  try {
    const networkState = await Network.getNetworkStateAsync();
    const isConnected = networkState.isConnected ?? false;

    let networkType: NetworkType = "unknown";
    if (!isConnected) {
      networkType = "none";
    } else if (networkState.type === Network.NetworkStateType.WIFI) {
      networkType = "wifi";
    } else if (networkState.type === Network.NetworkStateType.CELLULAR) {
      networkType = "cellular";
    }

    emitNetworkState({
      isConnected,
      networkType,
      isWifi: networkType === "wifi",
      isCellular: networkType === "cellular",
    });
  } catch (error) {
    Sentry.addBreadcrumb({
      category: "network",
      message: "Failed to get network state",
      data: { error: String(error) },
      level: "warning",
    });
  }
}

function ensureNetworkMonitoringStarted() {
  if (monitoringStarted) {
    return;
  }

  monitoringStarted = true;
  void checkNetworkState();

  appStateSubscription = AppState.addEventListener("change", () => {
    void checkNetworkState();
  });

  intervalHandle = setInterval(() => {
    void checkNetworkState();
  }, 10000);
}

function subscribe(listener: () => void) {
  ensureNetworkMonitoringStarted();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
      }
      appStateSubscription?.remove();
      appStateSubscription = null;
      monitoringStarted = false;
    }
  };
}

function getSnapshot() {
  return currentNetworkState;
}

/**
 * Hook to monitor network connectivity state.
 * Uses a single shared monitor for the whole app so many cards/lists
 * do not each create their own timer and AppState listener.
 */
export function useNetworkState(): NetworkState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Utility function to check if video autoplay should be enabled
 * based on user preferences and current network state.
 */
export function shouldAutoplayVideo(
  autoPlayEnabled: boolean,
  networkPreference: "always" | "wifi_only" | "never",
  currentNetworkType: NetworkType,
): boolean {
  if (!autoPlayEnabled) return false;

  switch (networkPreference) {
    case "never":
      return false;
    case "wifi_only":
      return currentNetworkType === "wifi";
    case "always":
    default:
      return true;
  }
}
