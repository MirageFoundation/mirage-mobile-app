// Bunny Stream URLs look like:
//   https://{pull-zone}.b-cdn.net/{guid}/playlist.m3u8
//   https://{pull-zone}.b-cdn.net/{guid}/play_720p.mp4
// The {guid} is the stable asset identity; the path/query around it can change
// (rendition format switches, dimension hints). Canonicalizing on the guid keeps
// per-video client state (saved positions, handoff keys) stable across those
// URL changes.
const BUNNY_STREAM_PATH_RE = /^\/([0-9a-fA-F-]{36})\/[^/]+$/;

export function canonicalVideoAssetId(videoId: string): string {
  if (!videoId.includes(".b-cdn.net/")) return videoId;
  try {
    const parsed = new URL(videoId);
    if (!parsed.hostname.toLowerCase().endsWith(".b-cdn.net")) return videoId;
    const match = parsed.pathname.match(BUNNY_STREAM_PATH_RE);
    return match ? match[1].toLowerCase() : videoId;
  } catch {
    return videoId;
  }
}
