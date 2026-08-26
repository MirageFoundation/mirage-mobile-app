export type NetworkType = "wifi" | "cellular" | "unknown" | "none";

export type NetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  networkType: NetworkType;
  isWifi: boolean;
  isCellular: boolean;
};

export const INITIAL_NETWORK_STATE: NetworkState = {
  isConnected: true,
  isInternetReachable: null,
  networkType: "unknown",
  isWifi: false,
  isCellular: false,
};

export const selectIsConnected = (state: NetworkState) => state.isConnected;
export const selectIsInternetReachable = (state: NetworkState) =>
  state.isInternetReachable;
export const selectNetworkType = (state: NetworkState) => state.networkType;

export function buildNetworkState(input: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string;
}): NetworkState {
  const isConnected = input.isConnected ?? false;
  const networkType: NetworkType = !isConnected
    ? "none"
    : input.type === "wifi"
      ? "wifi"
      : input.type === "cellular"
        ? "cellular"
        : "unknown";

  return {
    isConnected,
    isInternetReachable: input.isInternetReachable,
    networkType,
    isWifi: networkType === "wifi",
    isCellular: networkType === "cellular",
  };
}

export function mergeNetworkState(
  previous: NetworkState,
  next: NetworkState,
): NetworkState {
  return previous.isConnected === next.isConnected &&
    previous.isInternetReachable === next.isInternetReachable &&
    previous.networkType === next.networkType
    ? previous
    : next;
}
