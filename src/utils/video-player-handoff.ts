import type { VideoPlayer, VideoSource } from "expo-video";

/**
 * Player handoff between video surfaces (feed -> detail -> fullscreen).
 *
 * Because HLS cannot be disk cached, letting each surface create a fresh
 * player re-streams the whole video on every transition. Instead, a surface
 * that owns a prepared player *offers* it under the video's canonical asset
 * id, and the surface pushed on top *adopts* that exact player instance:
 * same buffer, same position, zero network, instant first frame.
 *
 * Ownership model:
 * - Controllers `offer` their player once a source is applied and `revoke`
 *   on source change/unmount. Offers per key form a stack — the most recent
 *   offer wins (a detail screen's own player shadows the feed's warm player
 *   for the same video).
 * - An overlaying surface `adopt`s a player, receiving a lease token. Leases
 *   per player also form a chain: feed's controller stands down while detail
 *   holds the lease; detail stands down while fullscreen holds a newer
 *   lease on the same player. Only the top lease holder may control the
 *   player; everyone else suppresses writes.
 * - `release` pops the lease and bumps a version that re-runs subscriber
 *   effects, so the next holder down (or the owning controller) re-asserts
 *   its desired state.
 */

const appliedSourceUris = new WeakMap<VideoPlayer, string | null>();
const playbackIntents = new WeakMap<VideoPlayer, boolean>();

export function getVideoPlaybackIntent(player: VideoPlayer): boolean {
  return playbackIntents.get(player) ?? player.playing;
}

export function setVideoPlaybackIntent(player: VideoPlayer, playing: boolean): void {
  playbackIntents.set(player, playing);
}

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

export type VideoPlayerLease = {
  readonly key: string;
  readonly player: VideoPlayer;
  readonly token: symbol;
};

type HandoffOffer = {
  player: VideoPlayer;
  /** Lease tokens in adoption order; last entry is the current controller. */
  leases: symbol[];
  /** The offering controller revoked while leases were active. */
  revoked: boolean;
};

const offerStacks = new Map<string, HandoffOffer[]>();
const leaseCounts = new WeakMap<VideoPlayer, number>();
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
  return (leaseCounts.get(player) ?? 0) > 0;
}

/**
 * True when a surface other than the holder of `lease` currently controls
 * the player. Pass `null` for surfaces without a lease (owning controllers):
 * any active lease then means someone else controls it.
 */
export function isVideoPlayerControlledElsewhere(
  player: VideoPlayer,
  lease: VideoPlayerLease | null,
): boolean {
  const count = leaseCounts.get(player) ?? 0;
  if (count === 0) return false;
  if (!lease) return true;
  const offer = offerStacks.get(lease.key)?.find((entry) => entry.player === player);
  if (!offer || offer.leases.length === 0) return true;
  return offer.leases[offer.leases.length - 1] !== lease.token;
}

export function offerHandoffPlayer(key: string, player: VideoPlayer): void {
  const stack = offerStacks.get(key) ?? [];
  // Re-offers keep their stack position; only new offers go on top.
  if (stack.some((entry) => entry.player === player)) return;
  stack.push({ player, leases: [], revoked: false });
  offerStacks.set(key, stack);
}

export function revokeHandoffOffer(key: string, player: VideoPlayer): void {
  const stack = offerStacks.get(key);
  if (!stack) return;
  const index = stack.findIndex((entry) => entry.player === player);
  if (index === -1) return;
  // Keep leased entries so adopters' releases can still resolve them; the
  // entry is dropped once the last lease is released.
  if (stack[index].leases.length > 0) {
    stack[index].revoked = true;
    return;
  }
  stack.splice(index, 1);
  if (stack.length === 0) offerStacks.delete(key);
}

/**
 * Adopt the most recently offered player for `key` that currently holds
 * `expectedUri`. Returns a lease the adopter must `release` on unmount.
 */
export function adoptHandoffPlayer(key: string, expectedUri: string): VideoPlayerLease | null {
  const stack = offerStacks.get(key);
  if (!stack) return null;
  for (let i = stack.length - 1; i >= 0; i--) {
    const offer = stack[i];
    try {
      // Throws if the native player was already released.
      void offer.player.status;
    } catch {
      stack.splice(i, 1);
      continue;
    }
    if (getAppliedVideoSourceUri(offer.player) !== expectedUri) continue;
    const token = Symbol("video-player-lease");
    offer.leases.push(token);
    leaseCounts.set(offer.player, (leaseCounts.get(offer.player) ?? 0) + 1);
    bumpLeaseVersion();
    return { key, player: offer.player, token };
  }
  if (stack.length === 0) offerStacks.delete(key);
  return null;
}

export function releaseHandoffPlayer(lease: VideoPlayerLease): void {
  const stack = offerStacks.get(lease.key);
  const offerIndex = stack?.findIndex((entry) => entry.player === lease.player) ?? -1;
  const offer = offerIndex >= 0 ? stack![offerIndex] : undefined;
  if (!offer || !offer.leases.includes(lease.token)) return;
  if (offer) {
    const tokenIndex = offer.leases.indexOf(lease.token);
    offer.leases.splice(tokenIndex, 1);
    if (offer.leases.length === 0 && offer.revoked) {
      stack!.splice(offerIndex, 1);
      if (stack!.length === 0) offerStacks.delete(lease.key);
    }
  }
  const count = leaseCounts.get(lease.player) ?? 0;
  if (count > 0) leaseCounts.set(lease.player, count - 1);
  bumpLeaseVersion();
}
