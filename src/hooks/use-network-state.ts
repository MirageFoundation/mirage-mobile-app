import * as Network from "expo-network";
import * as Sentry from "@sentry/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { startTransition, useEffect, useRef, useState } from "react";

export type NetworkType = "wifi" | "cellular" | "unknown" | "none";

type NetworkState = {
  isConnected: boolean;
  networkType: NetworkType;
  isWifi: boolean;
  isCellular: boolean;
};

/**
 * Hook to monitor network connectivity state
 * Returns information about connection status and type (WiFi vs Cellular)
 */
export function useNetworkState(): NetworkState {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    networkType: "unknown",
    isWifi: false,
    isCellular: false,
  });
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    let mounted = true;

    const checkNetwork = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();

        if (!mounted) return;

        const isConnected = networkState.isConnected ?? false;
        let networkType: NetworkType = "unknown";

        if (!isConnected) {
          networkType = "none";
        } else if (networkState.type === Network.NetworkStateType.WIFI) {
          networkType = "wifi";
        } else if (networkState.type === Network.NetworkStateType.CELLULAR) {
          networkType = "cellular";
        }

        const next = {
          isConnected,
          networkType,
          isWifi: networkType === "wifi",
          isCellular: networkType === "cellular",
        };
        startTransition(() => {
          setState((prev) => {
            if (
              prev.isConnected === next.isConnected &&
              prev.networkType === next.networkType
            )
              return prev;
            return next;
          });
        });
      } catch (error) {
        Sentry.addBreadcrumb({ category: "network", message: "Failed to get network state", data: { error: String(error) }, level: "warning" });
      }
    };

    // Initial check
    checkNetwork();

    const subscription = AppState.addEventListener("change", (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (prevState !== nextState) {
        checkNetwork();
      }
    });

    // Poll network state periodically (every 10 seconds)
    const interval = setInterval(checkNetwork, 10000);

    return () => {
      mounted = false;
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  return state;
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
