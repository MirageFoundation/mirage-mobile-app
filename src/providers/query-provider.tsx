import * as Sentry from "@sentry/react-native";
import {
  focusManager,
  hydrate,
  onlineManager,
  type DehydratedState,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useEffect } from "react";
import { storage } from "@/src/stores/mmkv-storage";
import { AppState, Platform } from "react-native";
import { apiClient } from "@/src/api/client";
import {
  StaleQueryRecoveryCoordinator,
  recoverStaleActiveQueries,
} from "@/src/api/cache/stale-query-recovery";
import {
  getNetworkState,
  subscribeNetworkState,
} from "@/src/stores/network-state-store";
import {
  buildPersistedQueryNamespace,
  buildPersistedQueryStorageKey,
  getHydratablePersistedQueryClient,
  isLaunchPersistedQuery,
  PERSISTED_QUERY_BUSTER,
  PERSISTED_QUERY_MAX_AGE_MS,
  preparePersistedQueryClient,
  removeLegacyPersistedQueryCaches,
  restorePersistedQueryClient,
  type PersistedQueryMetrics,
} from "@/src/api/cache/persisted-post-cache";
import { getApiBaseUrl, useAuthStore, usePreferencesStore } from "@/src/stores";
import { queryClient } from "@/src/providers/query-client";

removeLegacyPersistedQueryCaches(storage);

onlineManager.setEventListener((setOnline) => {
  setOnline(getNetworkState().isConnected);
  return subscribeNetworkState((state) => {
    setOnline(state.isConnected);
  });
});

focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener("change", (status) => {
    if (Platform.OS !== "web") {
      setFocused(status === "active");
    }
  });
  return () => sub.remove();
});

function getCurrentPersistedNamespace(): string {
  const server = getApiBaseUrl(usePreferencesStore.getState().apiServer);
  return buildPersistedQueryNamespace(
    server,
    useAuthStore.getState().walletAddress,
  );
}

// Resolve the key per operation so server/wallet changes rotate persistence.
const mmkvQueryStorage = {
  getItem: () =>
    storage.getString(buildPersistedQueryStorageKey(getCurrentPersistedNamespace())) ?? null,
  setItem: (_key: string, value: string) =>
    storage.set(buildPersistedQueryStorageKey(getCurrentPersistedNamespace()), value),
  removeItem: () =>
    storage.remove(buildPersistedQueryStorageKey(getCurrentPersistedNamespace())),
};

let restoredMetrics: PersistedQueryMetrics | null = null;

function hydrateLaunchFeedSynchronously(): void {
  const namespace = getCurrentPersistedNamespace();
  const storageKey = buildPersistedQueryStorageKey(namespace);
  const cachedString = storage.getString(storageKey);
  if (!cachedString) return;

  const restored = restorePersistedQueryClient(cachedString, namespace);
  const hydratable = getHydratablePersistedQueryClient(restored?.client);
  if (!restored || !hydratable) {
    storage.remove(storageKey);
    return;
  }

  hydrate(queryClient, hydratable.clientState as DehydratedState);
  restoredMetrics = restored.metrics;
}

function addPersistenceBreadcrumb(
  operation: "persist" | "restore",
  metrics: PersistedQueryMetrics,
) {
  Sentry.addBreadcrumb({
    category: "react-query.persistence",
    message: `Persisted query cache ${operation}d`,
    level: "info",
    data: metrics,
  });
}

const persister = createSyncStoragePersister({
  storage: mmkvQueryStorage,
  key: "dynamic-query-cache",
  serialize: (client) => {
    const prepared = preparePersistedQueryClient(
      client,
      getCurrentPersistedNamespace(),
    );
    addPersistenceBreadcrumb("persist", prepared.metrics);
    return prepared.serialized;
  },
  deserialize: (cachedString) => {
    const startedAt = Date.now();
    const restored = restorePersistedQueryClient(
      cachedString,
      getCurrentPersistedNamespace(),
    );
    if (!restored) mmkvQueryStorage.removeItem();
    restoredMetrics = restored?.metrics ?? {
      queryCount: 0,
      pageCount: 0,
      bytes: new TextEncoder().encode(cachedString).length,
      durationMs: Math.max(0, Date.now() - startedAt),
    };
    return restored?.client as any;
  },
});

// MMKV and Zustand hydration are synchronous, so the server/viewer namespace
// is already available here. Seed the query client before any screen renders;
// PersistQueryClientProvider still owns subsequent persistence and refreshes.
hydrateLaunchFeedSynchronously();

function addPersistedCacheRestoredBreadcrumb() {
  if (restoredMetrics) addPersistenceBreadcrumb("restore", restoredMetrics);
}

export { queryClient };

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    const coordinator = new StaleQueryRecoveryCoordinator({
      onRecovery: () => {
        void recoverStaleActiveQueries({
          queryClient,
          getServerContext: () => apiClient.getCurrentServerContext(),
          getViewerAddress: () => useAuthStore.getState().walletAddress,
        });
      },
    });

    coordinator.handleAppState(AppState.currentState);
    coordinator.handleConnectivity(getNetworkState().isConnected);

    const appStateSubscription = AppState.addEventListener("change", (status) => {
      coordinator.handleAppState(status);
    });
    const unsubscribeNetwork = subscribeNetworkState((state) => {
      coordinator.handleConnectivity(state.isConnected);
    });

    return () => {
      appStateSubscription.remove();
      unsubscribeNetwork();
    };
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: PERSISTED_QUERY_BUSTER,
        maxAge: PERSISTED_QUERY_MAX_AGE_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            isLaunchPersistedQuery(query.queryKey),
        },
      }}
      onSuccess={addPersistedCacheRestoredBreadcrumb}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
