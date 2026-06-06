import axios from "axios";
import * as Sentry from "@sentry/react-native";

export const CLOUD_FLARE_PROCESSING_POLL_INTERVAL_MS = 2500;

const CLOUD_FLARE_PROCESSING_REQUEST_TIMEOUT_MS = 4000;

export function isCloudflareStreamUrl(url: string | null | undefined): boolean {
  return !!url && (url.includes("cloudflarestream.com") || url.includes("videodelivery.net"));
}

function extractFirstPlaylistUrl(manifestUrl: string, manifestText: string): string | null {
  const lines = manifestText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const playlistLine = lines.find(
    (line) => !line.startsWith("#") && line.endsWith(".m3u8"),
  );

  if (!playlistLine) return null;

  try {
    return new URL(playlistLine, manifestUrl).toString();
  } catch {
    return null;
  }
}

export async function isCloudflareManifestReady(
  manifestUrl: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const manifestResponse = await axios.get<string>(manifestUrl, {
    timeout: CLOUD_FLARE_PROCESSING_REQUEST_TIMEOUT_MS,
    responseType: "text",
    signal,
    headers: {
      Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
    },
  });

  const manifestText = typeof manifestResponse.data === "string"
    ? manifestResponse.data
    : String(manifestResponse.data ?? "");

  if (!manifestText.includes("#EXTM3U")) return false;

  const childPlaylistUrl = extractFirstPlaylistUrl(manifestUrl, manifestText);
  if (!childPlaylistUrl) {
    return manifestText.includes("#EXTINF") || manifestText.includes("#EXT-X-TARGETDURATION");
  }

  const childPlaylistResponse = await axios.get<string>(childPlaylistUrl, {
    timeout: CLOUD_FLARE_PROCESSING_REQUEST_TIMEOUT_MS,
    responseType: "text",
    signal,
    headers: {
      Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
    },
  });

  const childPlaylistText = typeof childPlaylistResponse.data === "string"
    ? childPlaylistResponse.data
    : String(childPlaylistResponse.data ?? "");

  return childPlaylistText.includes("#EXTM3U") && (
    childPlaylistText.includes("#EXTINF") || childPlaylistText.includes("#EXT-X-TARGETDURATION")
  );
}

type WaitForCloudflareManifestReadyOptions = {
  intervalMs?: number;
  timeoutMs?: number | null;
  signal?: AbortSignal;
  onAttempt?: (details: { attempt: number; ready: boolean; error?: unknown }) => void;
};

export async function waitForCloudflareManifestReady(
  manifestUrl: string,
  options: WaitForCloudflareManifestReadyOptions = {},
): Promise<void> {
  const intervalMs = options.intervalMs ?? CLOUD_FLARE_PROCESSING_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs;
  const startedAt = Date.now();
  let attempt = 0;
  let lastError: unknown;

  console.log("[VideoTiming] cloudflare manifest wait start", {
    manifestUrl,
    intervalMs,
    timeoutMs,
  });
  Sentry.addBreadcrumb({
    category: "video-processing",
    message: "Cloudflare manifest wait started",
    level: "info",
    data: { manifestUrl, intervalMs, timeoutMs },
  });

  while (timeoutMs == null || Date.now() - startedAt < timeoutMs) {
    if (options.signal?.aborted) {
      throw new Error("Video processing check aborted");
    }

    try {
      const ready = await isCloudflareManifestReady(manifestUrl, options.signal);
      options.onAttempt?.({ attempt, ready });
      console.log("[VideoTiming] cloudflare manifest attempt", {
        manifestUrl,
        attempt,
        ready,
        elapsedMs: Date.now() - startedAt,
      });
      if (ready) {
        const totalDurationMs = Date.now() - startedAt;
        console.log("[VideoTiming] cloudflare manifest ready", {
          manifestUrl,
          attempts: attempt + 1,
          totalDurationMs,
        });
        Sentry.addBreadcrumb({
          category: "video-processing",
          message: "Cloudflare manifest ready",
          level: "info",
          data: {
            manifestUrl,
            attempts: attempt + 1,
            totalDurationMs,
          },
        });
        if (totalDurationMs > 30000) {
          Sentry.captureMessage("Cloudflare video processing was slow", {
            level: "warning",
            tags: {
              feature: "video-posting",
              operation: "cloudflare-manifest-wait",
            },
            extra: {
              manifestUrl,
              attempts: attempt + 1,
              totalDurationMs,
            },
          });
        }
        return;
      }
    } catch (error) {
      lastError = error;
      options.onAttempt?.({ attempt, ready: false, error });
      console.log("[VideoTiming] cloudflare manifest attempt failed", {
        manifestUrl,
        attempt,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt === 0 || attempt % 10 === 0) {
        Sentry.addBreadcrumb({
          category: "video-processing",
          message: "Cloudflare manifest not ready",
          level: "warning",
          data: {
            manifestUrl,
            attempt,
            elapsedMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    attempt += 1;
    if (timeoutMs == null) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } else {
      const remainingMs = timeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remainingMs)));
    }
  }

  const error = new Error("Video processing timed out. Please retry the upload.");
  console.log("[VideoTiming] cloudflare manifest timed out", {
    manifestUrl,
    attempts: attempt,
    totalDurationMs: Date.now() - startedAt,
    lastError: lastError instanceof Error ? lastError.message : lastError ? String(lastError) : undefined,
  });
  Sentry.captureException(error, {
    tags: {
      feature: "video-posting",
      operation: "cloudflare-manifest-wait",
    },
    extra: {
      manifestUrl,
      attempts: attempt,
      totalDurationMs: Date.now() - startedAt,
      lastError: lastError instanceof Error ? lastError.message : lastError ? String(lastError) : undefined,
    },
  });
  (error as Error & { cause?: unknown }).cause = lastError;
  throw error;
}
