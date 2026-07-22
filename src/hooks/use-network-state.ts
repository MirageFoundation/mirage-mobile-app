import { useEffect } from "react";
import {
  selectIsConnected,
  selectNetworkType,
  type NetworkState,
  type NetworkType,
} from "@/src/stores/network-state-model";
import {
  ensureNetworkMonitorStarted,
  useNetworkStateStore,
} from "@/src/stores/network-state-store";

export type { NetworkState, NetworkType };

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

export function useIsConnected(): boolean {
  useEffect(() => {
    ensureNetworkMonitorStarted();
  }, []);

  return useNetworkStateStore(selectIsConnected);
}

export function useNetworkType(): NetworkType {
  useEffect(() => {
    ensureNetworkMonitorStarted();
  }, []);

  return useNetworkStateStore(selectNetworkType);
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
