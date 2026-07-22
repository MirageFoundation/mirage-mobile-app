import * as Sentry from "@sentry/react-native";
import { MutationCache, QueryCache, QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
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
  isLaunchCriticalFeedQuery,
  preparePersistedQueryClient,
  restorePersistedQueryClient,
  type PersistedQueryMetrics,
} from "@/src/api/cache/persisted-post-cache";
import { getApiBaseUrl, useAuthStore, usePreferencesStore } from "@/src/stores";
import {
  buildMutationErrorMetadata,
  buildQueryErrorMetadata,
  sanitizedTelemetryError,
} from "@/src/services/react-query-telemetry";

// Remove the pre-v3 broad cache, which was not identity scoped or allowlisted.
storage.remove("mirage-query-cache");

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

function getErrorStatus(error: unknown): number | undefined {
  const status =
    (error as { response?: { status?: number }; status?: number })?.response
      ?.status ?? (error as { status?: number })?.status;

  return typeof status === "number" ? status : undefined;
}

function shouldCaptureReactQueryError(error: unknown): boolean {
  const code = (error as any)?.code;
  if (code === "ERR_NETWORK") return false;
  return getErrorStatus(error) === undefined;
}

function addPersistedCacheRestoredBreadcrumb() {
  if (restoredMetrics) addPersistenceBreadcrumb("restore", restoredMetrics);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const metadata = buildQueryErrorMetadata(query.queryKey, error);

      Sentry.addBreadcrumb({
        category: "react-query",
        message: "Query failed",
        level: "error",
        data: metadata,
      });

      if (!shouldCaptureReactQueryError(error)) {
        return;
      }

      Sentry.captureException(sanitizedTelemetryError("query", metadata), {
        tags: {
          feature: "react-query",
          type: "query",
          operation: metadata.operation,
          error_class: metadata.error_class,
        },
        extra: metadata,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      const metadata = buildMutationErrorMetadata(mutation.options.mutationKey, error);

      Sentry.addBreadcrumb({
        category: "react-query",
        message: "Mutation failed",
        level: "error",
        data: metadata,
      });

      if (!shouldCaptureReactQueryError(error)) {
        return;
      }

      Sentry.captureException(sanitizedTelemetryError("mutation", metadata), {
        tags: {
          feature: "react-query",
          type: "mutation",
          operation: metadata.operation,
          error_class: metadata.error_class,
        },
        extra: metadata,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours (cacheTime renamed to gcTime in v5)
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

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
        buster: "launch-feed-cache-v3",
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            isLaunchCriticalFeedQuery(query.queryKey),
        },
      }}
      onSuccess={addPersistedCacheRestoredBreadcrumb}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
