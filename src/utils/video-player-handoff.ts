import type { VideoPlayer, VideoSource } from "expo-video";

/**
 * Feed -> detail player handoff.
 *
 * The feed card and the post-detail screen are separate components, each of
 * which would normally own its own native player. Because HLS cannot be disk
 * cached, letting detail create a fresh player re-streams the whole video on
 * every open. But when detail is pushed, the feed card (and its prepared,
 * buffered player) stays mounted underneath it in the navigation stack — so
 * detail can *adopt* that exact player instance: same buffer, same position,
 * zero network, instant first frame.
 *
 * Ownership rules:
 * - Feed controllers `offer` their player once a source is applied and
 *   `revoke` on source change/unmount.
 * - Detail `adopt`s a player (verifying it currently holds the expected
 *   source) which marks it leased. While leased, the offering controller
 *   suppresses all writes (play/pause/replace/options) to avoid fighting.
 * - Detail `release`s on unmount; a version bump re-runs controller effects
 *   so the owner re-asserts its desired state (pause, warm buffer profile).
 */

const appliedSourceUris = new WeakMap<VideoPlayer, string | null>();

/**
 * The uri most recently applied to a controller-owned player via
 * `replaceAsync`. Because player instances are stable across source swaps,
 * synchronous reads of `player.status`/`player.availableVideoTracks` can
 * briefly reflect the previous source; consumers use this to confirm the
 * player currently holds the source they care about.
 */
export function getAppliedVideoSourceUri(player: VideoPlayer): string | null {
  return appliedSourceUris.get(player) ?? null;
}

export function setAppliedVideoSourceUri(player: VideoPlayer, uri: string | null): void {
  appliedSourceUris.set(player, uri);
}

export function getVideoSourceUri(source: VideoSource): string | null {
  if (source == null) return null;
  if (typeof source === "string") return source;
  if (typeof source === "number") return null;
  return source.uri ?? null;
}

type HandoffEntry = {
  player: VideoPlayer;
  leased: boolean;
};

const entries = new Map<string, HandoffEntry>();
const leasedPlayers = new WeakSet<VideoPlayer>();
const listeners = new Set<() => void>();
let leaseVersion = 0;

function bumpLeaseVersion(): void {
  leaseVersion += 1;
  for (const listener of listeners) listener();
}

export function subscribeVideoPlayerLeases(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVideoPlayerLeaseVersion(): number {
  return leaseVersion;
}

export function isVideoPlayerLeased(player: VideoPlayer): boolean {
  return leasedPlayers.has(player);
}

export function offerHandoffPlayer(key: string, player: VideoPlayer): void {
  const existing = entries.get(key);
  // Never displace an entry that is currently leased by an adopter.
  if (existing && existing.leased && existing.player !== player) return;
  if (existing?.player === player) return;
  entries.set(key, { player, leased: isVideoPlayerLeased(player) });
}

export function revokeHandoffOffer(key: string, player: VideoPlayer): void {
  const entry = entries.get(key);
  if (!entry || entry.player !== player) return;
  // Keep leased entries so the adopter's release can still find and clear
  // them; the adopter holds its own reference to the player.
  if (!entry.leased) entries.delete(key);
}

export function adoptHandoffPlayer(key: string, expectedUri: string): VideoPlayer | null {
  const entry = entries.get(key);
  if (!entry) return null;
  try {
    // Throws if the native player was already released.
    void entry.player.status;
  } catch {
    entries.delete(key);
    return null;
  }
  if (getAppliedVideoSourceUri(entry.player) !== expectedUri) return null;
  entry.leased = true;
  leasedPlayers.add(entry.player);
  bumpLeaseVersion();
  return entry.player;
}

export function releaseHandoffPlayer(key: string, player: VideoPlayer): void {
  const entry = entries.get(key);
  if (entry && entry.player === player) {
    entry.leased = false;
  }
  leasedPlayers.delete(player);
  bumpLeaseVersion();
}
