import axios from "axios";

/**
 * HLS manifest readiness checking.
 *
 * Hosted stream providers (Bunny Stream) transcode uploads asynchronously:
 * the playlist can 404 or be incomplete right after upload. These helpers
 * verify that a manifest (and its first child playlist) contains real
 * segments before we hand the URL to a native player.
 */
export const HLS_PROCESSING_POLL_INTERVAL_MS = 2500;

const HLS_PROCESSING_REQUEST_TIMEOUT_MS = 4000;

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

export async function isHlsManifestReady(
  manifestUrl: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const manifestResponse = await axios.get<string>(manifestUrl, {
    timeout: HLS_PROCESSING_REQUEST_TIMEOUT_MS,
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
    timeout: HLS_PROCESSING_REQUEST_TIMEOUT_MS,
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
