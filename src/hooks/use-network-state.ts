import * as Network from "expo-network";
import * as Sentry from "@sentry/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { useEffect } from "react";
import { create } from "zustand";

export type NetworkType = "wifi" | "cellular" | "unknown" | "none";

type NetworkState = {
  isConnected: boolean;
  networkType: NetworkType;
  isWifi: boolean;
  isCellular: boolean;
};

const INITIAL_STATE: NetworkState = {
  isConnected: true,
  networkType: "unknown",
  isWifi: false,
  isCellular: false,
};

const NETWORK_POLL_MS = 10_000;

const useNetworkStateStore = create<NetworkState>(() => INITIAL_STATE);

let isNetworkMonitorStarted = false;
let networkInterval: ReturnType<typeof setInterval> | null = null;
let appState: AppStateStatus = AppState.currentState;

function buildNetworkState(networkState: Network.NetworkState): NetworkState {
  const isConnected = networkState.isConnected ?? false;
  let networkType: NetworkType = "unknown";

  if (!isConnected) {
    networkType = "none";
  } else if (networkState.type === Network.NetworkStateType.WIFI) {
    networkType = "wifi";
  } else if (networkState.type === Network.NetworkStateType.CELLULAR) {
    networkType = "cellular";
  }

  return {
    isConnected,
    networkType,
    isWifi: networkType === "wifi",
    isCellular: networkType === "cellular",
  };
}

async function checkNetwork() {
  try {
    const networkState = await Network.getNetworkStateAsync();
    const next = buildNetworkState(networkState);

    useNetworkStateStore.setState((prev) => {
      if (
        prev.isConnected === next.isConnected &&
        prev.networkType === next.networkType
      ) {
        return prev;
      }
      return next;
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

function restartNetworkPolling() {
  if (networkInterval) {
    clearInterval(networkInterval);
    networkInterval = null;
  }

  if (appState !== "active") return;

  networkInterval = setInterval(() => {
    void checkNetwork();
  }, NETWORK_POLL_MS);
}

function ensureNetworkMonitorStarted() {
  if (isNetworkMonitorStarted) return;
  isNetworkMonitorStarted = true;
  appState = AppState.currentState;

  void checkNetwork();
  restartNetworkPolling();

  AppState.addEventListener("change", (nextState) => {
    const prevState = appState;
    appState = nextState;

    if (prevState !== nextState) {
      void checkNetwork();
    }

    restartNetworkPolling();
  });
}

/**
 * Hook to monitor network connectivity state
 * Returns information about connection status and type (WiFi vs Cellular)
 */
export function useNetworkState(): NetworkState {
  useEffect(() => {
    ensureNetworkMonitorStarted();
  }, []);

  return useNetworkStateStore();
}

/**
 * Utility function to check if video autoplay should be enabled
 * based on user preferences and current network state
 */
export function shouldAutoplayVideo(
  autoPlayEnabled: boolean,
  networkPreference: "always" | "wifi_only" | "never",
  currentNetworkType: NetworkType
): boolean {
  // If autoplay is disabled globally, don't autoplay
  if (!autoPlayEnabled) return false;

  // Check network preference
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
