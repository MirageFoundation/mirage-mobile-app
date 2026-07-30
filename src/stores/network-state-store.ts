import NetInfo from "@react-native-community/netinfo";
import { create } from "zustand";

import {
  INITIAL_NETWORK_STATE,
  buildNetworkState,
  mergeNetworkState,
  type NetworkState,
} from "./network-state-model";

export const useNetworkStateStore = create<NetworkState>(() =>
  INITIAL_NETWORK_STATE,
);

let monitorStarted = false;

function updateNetworkState(state: Parameters<typeof buildNetworkState>[0]): NetworkState {
  const next = buildNetworkState(state);
  let resolved = next;
  useNetworkStateStore.setState((previous) => {
    resolved = mergeNetworkState(previous, next);
    return resolved;
  });
  return resolved;
}

export function ensureNetworkMonitorStarted(): void {
  if (monitorStarted) return;
  monitorStarted = true;

  NetInfo.addEventListener((state) => {
    updateNetworkState(state);
  });
}

export async function refreshNetworkState(): Promise<NetworkState> {
  ensureNetworkMonitorStarted();
  return updateNetworkState(await NetInfo.fetch());
}

export function getNetworkState(): NetworkState {
  ensureNetworkMonitorStarted();
  return useNetworkStateStore.getState();
}

export function subscribeNetworkState(
  listener: (state: NetworkState) => void,
): () => void {
  ensureNetworkMonitorStarted();
  return useNetworkStateStore.subscribe(listener);
}
