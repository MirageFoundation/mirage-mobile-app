import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { storage } from "@/src/stores/mmkv-storage";

// MMKV adapter for TanStack Query (sync because MMKV is synchronous)
const mmkvQueryStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.remove(key),
};

const persister = createSyncStoragePersister({
  storage: mmkvQueryStorage,
  key: "mirage-query-cache",
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours (cacheTime renamed to gcTime in v5)
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

export { queryClient };

function useAppStateFocus() {
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (status: AppStateStatus) => {
        focusManager.setFocused(status === "active");
      }
    );
    return () => subscription.remove();
  }, []);
}

function useOnlineManager() {
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected != null && state.isConnected && state.isInternetReachable !== false;
      onlineManager.setOnline(isOnline);
    });
  }, []);
}

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  useAppStateFocus();
  useOnlineManager();

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
