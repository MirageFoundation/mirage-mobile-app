import * as Sentry from "@sentry/react-native";
import { isCompletedApiRead, shouldRetryApiQuery } from "@/src/api/read-retry-policy";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import {
  buildMutationErrorMetadata,
  buildQueryErrorMetadata,
  sanitizedTelemetryError,
} from "@/src/services/react-query-telemetry";

// The query client lives in its own module (instead of query-provider.tsx) so
// plain services (auth-bootstrap, push-notifications, inbox-notifications) can
// import it without pulling in the provider component, which imports stores —
// that edge previously created require cycles (stores -> services -> provider
// -> stores).

function getErrorStatus(error: unknown): number | undefined {
  const status =
    (error as { response?: { status?: number }; status?: number })?.response
      ?.status ?? (error as { status?: number })?.status;

  return typeof status === "number" ? status : undefined;
}

function shouldCaptureReactQueryError(error: unknown): boolean {
  if (isCompletedApiRead(error)) return false;
  const code = (error as any)?.code;
  if (code === "ERR_NETWORK" || code === "ERR_CANCELED" ||
    (error as Error)?.name === "StaleServerResponseError" ||
    (error as Error)?.name === "AbortError") return false;
  return getErrorStatus(error) === undefined;
}

export const queryClient = new QueryClient({
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
      retry: shouldRetryApiQuery,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
