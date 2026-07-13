import { useEffect, useRef } from "react";
import * as Network from "expo-network";
import * as Sentry from "@sentry/react-native";

const NETWORK_RETRY_DELAY_MS = 2000;
const MAX_NETWORK_RETRIES_PER_URI = 3;

type UploadNetworkRetryOptions = {
  kind: "image" | "video";
  hasFailures: boolean;
  getRetryableUris: () => string[];
  retryUpload: (uri: string) => void;
};

/**
 * Single retry policy for create-screen media uploads after network recovery.
 *
 * - one delay constant, one listener per media kind
 * - hard cap of retries per uri; exhaustion is reported to Sentry once
 * - attempt state resets when all failures clear
 */
export function useUploadNetworkRetry({
  kind,
  hasFailures,
  getRetryableUris,
  retryUpload,
}: UploadNetworkRetryOptions): void {
  const attemptsRef = useRef(new Map<string, number>());
  const exhaustionReportedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!hasFailures) {
      attemptsRef.current.clear();
      exhaustionReportedRef.current.clear();
      return;
    }

    let retryScheduled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const runRetries = () => {
      const uris = getRetryableUris();
      const toRetry: string[] = [];
      const exhausted: string[] = [];
      for (const uri of uris) {
        const attempts = attemptsRef.current.get(uri) ?? 0;
        if (attempts >= MAX_NETWORK_RETRIES_PER_URI) {
          if (!exhaustionReportedRef.current.has(uri)) {
            exhaustionReportedRef.current.add(uri);
            exhausted.push(uri);
          }
          continue;
        }
        attemptsRef.current.set(uri, attempts + 1);
        toRetry.push(uri);
      }
      if (exhausted.length > 0) {
        Sentry.captureMessage("Media upload network retries exhausted", {
          level: "warning",
          tags: {
            feature: "create-post",
            operation: "upload-network-retry-exhausted",
            media_kind: kind,
          },
          extra: {
            exhaustedCount: exhausted.length,
            fileNames: exhausted.map((uri) => uri.split("/").pop() ?? uri),
            maxRetries: MAX_NETWORK_RETRIES_PER_URI,
          },
        });
      }
      if (toRetry.length > 0) {
        Sentry.addBreadcrumb({
          category: `${kind}-upload`,
          message: "Retrying failed uploads after network recovery",
          level: "info",
          data: {
            retryCount: toRetry.length,
            attempts: Object.fromEntries(
              toRetry.map((uri) => [
                uri.split("/").pop() ?? uri,
                attemptsRef.current.get(uri),
              ]),
            ),
          },
        });
        toRetry.forEach((uri) => retryUpload(uri));
      }
    };

    const scheduleRetry = () => {
      if (retryScheduled) return;
      retryScheduled = true;
      timeoutId = setTimeout(runRetries, NETWORK_RETRY_DELAY_MS);
    };

    const sub = Network.addNetworkStateListener((event) => {
      if (event.isConnected && event.isInternetReachable !== false) {
        scheduleRetry();
      }
    });
    Network.getNetworkStateAsync().then((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        scheduleRetry();
      }
    });

    return () => {
      sub.remove();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [hasFailures, kind, getRetryableUris, retryUpload]);
}
