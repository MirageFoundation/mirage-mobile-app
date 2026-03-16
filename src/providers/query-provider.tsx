import * as Sentry from "@sentry/react-native";
import { MutationCache, QueryCache, QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { storage } from "@/src/stores/mmkv-storage";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
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

const EXCLUDED_QUERY_KEYS = ["posts", "comments", "inbox", "topics"];

function toSentryContext(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function serializeKey(key: readonly unknown[] | undefined): string {
  if (!key) {
    return "unknown";
  }

  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
}

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

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const status = getErrorStatus(error);

      Sentry.addBreadcrumb({
        category: "react-query",
        message: "Query failed",
        level: "error",
        data: {
          queryKey: serializeKey(query.queryKey),
          status,
          fetchStatus: query.state.fetchStatus,
        },
      });

      if (!shouldCaptureReactQueryError(error)) {
        return;
      }

      Sentry.captureException(error, {
        tags: {
          feature: "react-query",
          type: "query",
          query_key: serializeKey(query.queryKey),
        },
        extra: {
          queryKey: toSentryContext(query.queryKey),
          meta: toSentryContext(query.meta),
          state: {
            fetchStatus: query.state.fetchStatus,
            status: query.state.status,
            dataUpdatedAt: query.state.dataUpdatedAt,
            errorUpdateCount: query.state.errorUpdateCount,
          },
        },
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, variables, _context, mutation) => {
      const status = getErrorStatus(error);

      Sentry.addBreadcrumb({
        category: "react-query",
        message: "Mutation failed",
        level: "error",
        data: {
          mutationKey: serializeKey(mutation.options.mutationKey),
          status,
        },
      });

      if (!shouldCaptureReactQueryError(error)) {
        return;
      }

      Sentry.captureException(error, {
        tags: {
          feature: "react-query",
          type: "mutation",
          mutation_key: serializeKey(mutation.options.mutationKey),
        },
        extra: {
          mutationKey: toSentryContext(mutation.options.mutationKey),
          meta: toSentryContext(mutation.meta),
          variables: toSentryContext(variables),
        },
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
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0];
            if (typeof key === "string" && EXCLUDED_QUERY_KEYS.includes(key)) {
              return false;
            }
            return query.state.status === "success";
          },
        },
      }}
      onSuccess={() => {}}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
