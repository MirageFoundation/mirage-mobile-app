# Video Optimization Plan (Feed Video: Seamless Playback Without Memory Blowups)

Status: Phases 1 (except 1.2) and 2 implemented (Jul 2026). 1.2 blocked on backend MP4 decision; Phase 3 awaits a dependency-upgrade decision; device profiling pending.
Goal: Instagram/Reddit-grade feed video — poster paints instantly, active video starts in well under a second, scrolling stays smooth — while keeping native player count and buffer memory bounded.

Researched: Jul 2026. Sources: expo-video changelog/docs, expo/expo#40376 (FlashList feed freeze + player-pool guidance), expo/expo#42688 (maintainer: multiple players x default 50s buffer = OOM), TheWidlarzGroup `react-native-video-feed` boilerplate (asymmetric preload, pool of 3–5, MP4-poster strategy, TTFF metrics), Bunny Stream storage-structure docs (per-resolution MP4 fallback, preview animations, seek sprites).

---

## 1. Current State (audit)

Stack: `expo-video ~3.0.16` (SDK 54), FlashList feeds.

**Video hosting provider (confirmed Jul 2026): fully migrated to Bunny Stream.** Uploads go through the mobile backend (`POST /upload_media`, `src/api/read/endpoints/media.ts`), which returns the final playback `url` (`https://{pull-zone}.b-cdn.net/{guid}/playlist.m3u8`). There is **no legacy Cloudflare content** — all `cloudflarestream.com` / `videodelivery.net` handling in the codebase is dead: the manifest-readiness poller (`src/utils/cloudflare-manifest.ts`, zero callers), the client-side URL builder fallbacks in `media.ts` (`getVideoUrl`/`getVideoThumbnailUrl`), and the Cloudflare branches in `post-card-utils.ts` (`normalizeVideoUrl`, thumbnail derivation, media-type detection). Remove them as part of this work (Phase 1.5).

**Verified against production (Jul 24 2026):**
- `GET /api/get_posts` — all video posts are Bunny (`https://vz-99c4cbfc-c60.b-cdn.net/{guid}/playlist.m3u8`, often with `?w=&h=` dimension hints); images on `mirage-img.b-cdn.net`. Zero Cloudflare URLs in the feed.
- `POST /api/upload_media` (tested with a real 1s video) returns exactly `{ asset_id, kind, url }` — no `thumbnail_url`/`poster_url`/`download_url`. Thumbnails are client-derived (`/{guid}/thumbnail.jpg`).
- **MP4 fallback is disabled on the Bunny library**: `/{guid}/play_720p.mp4` → 404 on every video checked. So the MP4 feed path is not available today.
- Master playlists carry a 480p + 720p ladder (for a 720p source) and the **variant playlists are directly addressable**: `/{guid}/480p/video.m3u8` returns a valid media playlist.
- Bunny extras that DO exist per video: `/{guid}/preview.webp` (animated preview) and `/{guid}/original`.
- Test artifact: asset `098db375-bae4-40ec-b53d-6a1319902c68` in the Bunny library is a throwaway 1s test clip; backend can delete it.

**Backend design context (from mirage-node `docs/guides/media_providers.md`, read Jul 2026):**
- Anonymous uploads are **by design**, not an oversight: uploads are gated by `MEDIA_UPLOADS_ENABLED` (only `true` on nodes fronted by a Bunny Shield scanning edge — mirage.talk/mirage.vote), rate-limited at Caddy (4 req / 10s per client IP, 1600MB body cap), and scanned at the edge. Withdrawn as a "finding."
- The provider is deliberately hidden behind `POST /api/upload_media` → `{url, asset_id, kind}`; clients must never construct provider-specific URLs for *upload*. Poster derivation from the playback URL (`/{guid}/thumbnail.jpg`) matches the backend's own client guidance.
- Backend guidance confirms the just-uploaded poster 404 window (thumbnail generated during transcode); recommended fix is a client-side local first-frame poster (`expo-video-thumbnails`) for the composer preview — we already generate local video thumbnails in the create flow.
- Backend video policy: ≤60s clips keep source resolution up to 4K; >60s capped at 1080p. So feed cards can encounter 4K HLS ladders on short clips — strengthens the case for a feed rendition cap (1.2 / Phase 3 `maxResolution`).
- The web frontend already assumes MP4 renditions exist: its video download feature builds `/{guid}/play_1080p.mp4` (`web/frontend/src/utils/media.js`), which 404s today just like `play_720p`. So enabling **MP4 Fallback on the Bunny Stream library** fixes an existing web bug AND unblocks our Phase 1.2 — it is a Bunny dashboard/library setting, not a code change (nothing in `BunnyProvider` references it).

**What the feed API gives us per video post (verified on 11 live video posts):**
- `media[]`: the Bunny HLS URL, usually suffixed `?w={width}&h={height}` (source dimensions as a query hint; a few older posts lack it).
- `media_meta[]`: `{ w, h }` aligned index-for-index with `media[]` (two older posts have `{}`; the client already treats it as optional — `transform-post.ts:178`).
- `thumbnail`: always present, `/{guid}/thumbnail.jpg`.
- **Not provided:** duration, bitrate, rendition list, mp4 availability, preview-animation URL. No duration means "short clip → MP4" style branching isn't possible client-side without extra requests.
- Videos are always single-media posts in practice (no mixed video+image galleries observed).
- Ladder confirmation across sources: 720p source → 480p+720p variants; 360p source → only `360p/video.m3u8`; 480×268 source → only `240p/video.m3u8` (named by *height bucket*, and `RESOLUTION` can differ from `media_meta`, e.g. 426×238). This confirms the variant-playlist rewrite is non-deterministic without backend help — consistent with rejecting option 3 in Phase 1.2.
- Useful now: `media_meta.w/h` (or the `?w=&h=` hint) lets feed cards reserve exact aspect-ratio boxes before any video/poster loads (no layout shift), and tells us portrait vs landscape without touching the manifest.

What we already do well:
- Poster-first rendering: feed cards show a Stream thumbnail (`thumbnails/thumbnail.jpg?time=1s&width=480`) until `videoReadyForDisplay` (`post-card-utils.ts:211`, `post-card-media.tsx:1546`).
- Single active video per feed, chosen center-most (`home-post-list.tsx` flushViewability); single audio-focus owner.
- Viewability-gated mounting: players are only prepared for visible + nearby video posts (`shouldPrepareNativeVideo`, `post-card-media.tsx:275`).
- `surfaceType="textureView"` on Android (avoids SurfaceView z-order/recycling glitches in lists).
- Gallery reuses one player across items with `replaceAsync` (`media-gallery.tsx:177`).
- Player handoff retention for feed → detail (`retainPlayerForDetail`).

The gaps (why it still isn't Instagram-smooth and why memory spikes):

| # | Gap | Where | Impact |
|---|-----|-------|--------|
| G1 | **No `bufferOptions` anywhere.** Android ExoPlayer defaults to ~50s forward buffer *per player*. | `use-video-player-controller.ts` | With visible + nearby(±3) players prepared, 4–8 players × 50s × feed bitrate = the memory killer. Expo maintainer explicitly calls this out (expo#42688). |
| G2 | **No resolution/bitrate cap in feed.** ABR picks quality for full bandwidth, so a small feed card can pull 1080p renditions from the HLS master playlist. | `post-card-utils.ts` (playback URL building) | Wasted bandwidth, slower first frame, bigger buffers per player. |
| G3 | **Player-per-card, unbounded by pool.** Each prepared card owns its own `useVideoPlayer` instance; count is bounded only indirectly by viewability + `VIDEO_NEARBY_BUFFER = 3` (both directions). | `post-card-media.tsx`, `home-post-list.tsx:128` | Native player creation/teardown happens on scroll (jank), and worst-case concurrent player count is high (visible videos + up to 6 nearby). |
| G4 | **Symmetric nearby window.** ±3 regardless of scroll direction. | `home-post-list.tsx` | Half the warm players are behind the user. Industry pattern is asymmetric (1 behind, 2–5 ahead). |
| G5 | **No HLS caching.** `useCaching: true` is only applied to progressive URLs; expo-video's cache does not support HLS at all. All Bunny playback URLs are HLS (`playlist.m3u8`), so today nothing is cached. | `use-video-player-controller.ts:15` | Rewatching / scrolling back re-downloads segments (CDN-fast, but not instant). |
| G6 | **Known upstream bugs in expo-video 3.0.x** relevant to us: races when rapidly replacing HLS sources (partial fix in 3.0.12), `VideoView` holding a strong ref to detached players (memory leak, fixed upstream in #46453), no failed-player recovery, no `maxResolution` option. | dependency | Fixed in expo-video 55/56 (SDK 55/56). Upgrade requires an explicit dependency decision per repo policy. |

---

## 2. Research summary — what "seamless like Instagram" actually is

Every production-grade RN feed implementation converges on the same five ingredients:

1. **Poster image renders instantly; video fades in over it.** The perceived TTFF is ~0 because the first paint is an image. (We have this; keep it.)
2. **A small fixed pool of native players (3–5), never one per row.** Players are recycled across rows with `replaceAsync`/`replaceSourceAsync`; rows outside the warm window render only the poster. This is the pattern recommended in expo#40376 and used by TWG's feed (pool + lazy creation "reduced jank from 24% to 3%"). Player *creation* is expensive; source *replacement* is cheap.
3. **Asymmetric, direction-aware preload.** TWG ships: Android 3 ahead / 1 behind, iOS 5 ahead / 1 behind (full-screen feed; a mixed feed like ours can be tighter: 2 ahead / 1 behind).
4. **Tight buffers on warm-but-paused players; normal buffer only on the active player.** ~2–5s forward buffer for preloaded players, 10–15s for the playing one. This is the single biggest memory lever on Android.
5. **Capped rendition in feed.** Feed cards never need 1080p. Cap via player option (`maxResolution`, expo-video ≥ 56) or delivery-side (Bunny's per-resolution MP4 fallback URLs). Full quality only in detail/fullscreen.

Plus measurement: TTFF (preload-start → first frame) and perceived TTFF (visible → first frame) as the numbers to move.

---

## 3. Plan

### Phase 1 — Buffer + bitrate discipline (dependency-neutral, low risk, biggest memory win)

**1.1 Add `bufferOptions` support to `useVideoPlayerController`** (`src/hooks/use-video-player-controller.ts`)
- `bufferOptions` exists in expo-video since 2.0, so it is available today.
- Feed (warm/paused) players: `preferredForwardBufferDuration: 4`, Android `maxBufferBytes` cap (e.g. 15 MB), `prioritizeTimeOverSizeThresholds: false`.
- Active feed player: `preferredForwardBufferDuration: 10`.
- Detail/fullscreen: platform defaults (or 20s) — quality matters there.
- Wire a `profile: "feed-warm" | "feed-active" | "detail"` option through `useVideoPlayerController` rather than exposing raw numbers at call sites.

**1.2 Cap feed rendition** (`src/components/molecules/post-card-utils.ts`) — *decision needed, verified facts below*

> **Design constraint (decided Jul 2026): one canonical playback URL per video, used everywhere.**
> Feed → detail is instant today because `retainPlayerForDetail` hands the *player instance* (with its buffer) to the detail view — which only works if feed and detail share the same source URL. A feed-MP4 / detail-HLS split would silently break that handoff (source change = full reload). So formats never mix within one video's lifecycle: a video is either MP4 everywhere or HLS everywhere. Mixed formats *between* posts (old HLS vs new MP4) are fine — the player handles each source independently.

- **Confirmed: MP4 fallback is disabled** on the Bunny library (`play_*p.mp4` → 404). Bunny only generates MP4 renditions for videos encoded *after* the flag is enabled, so it would not cover existing posts. Toggle is being requested (also fixes web's broken `play_1080p.mp4` download feature).
- Chosen approach (with the one-URL constraint):
  1. **Backend-owned canonical URL:** backend enables MP4 fallback and serves the MP4 URL (e.g. `play_720p.mp4`) directly in `media[]` for videos that have one — or adds a `media_mp4` flag. That video then plays MP4 in feed *and* detail: disk cache, hard cap, instant handoff, instant replays. Trade-off accepted: detail tops out at 720p for those posts (fine for ≤60s phone-screen clips). Old posts stay HLS everywhere, exactly like today. Client stays deterministic — no probing, no fallback chains.
  2. **`maxResolution` after the expo-video upgrade (Phase 3):** per-player rendition cap for the HLS-only back catalog; complements option 1 rather than replacing it (no caching win).
  3. **Rejected: variant-playlist rewrite** (`/{guid}/480p/video.m3u8` is directly addressable) — the ladder depends on source resolution, so a blind rewrite is non-deterministic and would need conditional fallbacks.
- Until the backend change lands: skip 1.2. Phase 1.1 buffers deliver the main memory win regardless.
- ✓ Done (Jul 2026): `buildVideoPositionKey` canonicalizes Bunny stream URLs on the `{guid}` (`video-position-store.ts`), so when the backend switches a post's canonical URL between `playlist.m3u8` and `play_*p.mp4`, saved positions survive. Cost/UX refinement for the backend ask: make MP4 canonical only for short clips (≤60s); long-form stays HLS everywhere (adaptivity earns its keep there, and slow-network users keep ABR).

**1.3 Make the warm window asymmetric and smaller** (`src/pages/home/home-post-list.tsx`, profile feed hook)
- Replace `VIDEO_NEARBY_BUFFER = 3` (both directions) with direction-aware: 2 ahead / 1 behind (Android), 3 ahead / 1 behind (iOS). Scroll direction is already derivable from the viewability flow (track last min index).

**1.4 Measure**
- Record TTFF: timestamp when `shouldPrepareNativeVideo` flips true → `onFirstFrameRender`. We already emit Sentry breadcrumbs at both points; add a lightweight dev-only log/metric so before/after can be compared on device.

**1.5 Remove dead Cloudflare code** (fully migrated — no legacy content)
- Delete `src/utils/cloudflare-manifest.ts` (zero callers).
- Remove Cloudflare URL builders/fallbacks in `src/api/read/endpoints/media.ts` (`getVideoUrl`, `getVideoThumbnailUrl` — backend always returns `url`; replace the missing-`url` fallback with an explicit error).
- Strip `cloudflarestream.com` / `videodelivery.net` branches from `post-card-utils.ts` (`normalizeVideoUrl`, `getVideoThumbnailUri`, media-type/hosted-stream detection) — keep the generic HLS-manifest handling and Bunny paths.
- Simplifies 1.2 and shrinks a 400-line utils file.

Expected outcome: worst-case video memory drops from "N players × 50s buffers at full bitrate" to "≤4 players × 4–10s at ≤720p", with faster starts (smaller renditions fill buffers quicker) and cached instant replays for feed MP4s. No architecture change, easily reverted per knob.

Order within Phase 1: 1.1, 1.3, 1.4, 1.5 are unblocked now; 1.2 waits for the backend answer.

**Phase 1 implementation notes (done Jul 2026):**
- 1.1 ✓ `bufferProfile: "feedWarm" | "feedActive" | "detail"` in `use-video-player-controller.ts`; wired in `post-card-media.tsx` (switches warm↔active reactively), `media-gallery.tsx`, `static-video-preview.tsx`.
- 1.3 ✓ `src/utils/video-warm-window.ts` (2 ahead/1 behind Android, 3/1 iOS, direction tracker); used by `home-post-list.tsx` and `use-profile-feed-video-state.ts`.
- 1.4 ✓ `src/utils/video-ttff.ts`, dev-only `[VideoTTFF]` log from prepare-start → `onFirstFrameRender`.
- 1.5 ✓ with two corrections found during implementation: the readiness checker was NOT dead (it backs the video-processing poll) and was generalized to `src/utils/hls-manifest.ts` (`isHlsManifestReady`); the `media.ts` thumbnail fallback was a live path emitting broken `videodelivery.net` URLs for Bunny uploads and was replaced with Bunny-native derivation (`playlist.m3u8` → `thumbnail.jpg`). Also removed: `normalizeVideoUrl`, the CF thumbnail resize rewrite in `media-image-policy.ts` (verified: Bunny ignores `?width=` — Optimizer off), and the dead 180-line signed-URL video uploader.

### Phase 2 — Player pool (dependency-neutral, medium risk, removes creation jank)

**Implemented (Jul 2026) — with a simpler design than originally planned.**

Key discovery: in expo-video 3.x, `useVideoPlayer` keys the native player on `JSON.stringify(source)` and destroys/recreates it on every source change (the replace-instead-of-recreate behavior only lands upstream later). Our feed passes `shouldPrepare ? uri : null`, so every warm-window flip and every FlashList recycle was a full native player teardown + creation — the actual jank source.

Chosen design (instead of an external pool module): `useVideoPlayerController` now creates the player **once** per mounted component (`useVideoPlayer(null)` — stable key) and swaps media with **serialized `replaceAsync`** calls (a promise chain with supersede checks; `replaceAsync(null)` frees buffers without tearing the player down). Combined with FlashList component recycling this *is* the bounded pool — pool size = mounted video cards, zero creation churn — without making the player nullable across the 2000-line `post-card-media.tsx` or adding a feed-runtime assignment layer.

Supporting guards added in `post-card-media.tsx` (needed because player identity is now stable across uri changes):
- Poster overlay resets on `media.uri` change (`setVideoReadyForDisplay(false)`) so a recycled card never shows the previous video's last frame.
- Metadata/status effects verify the player actually holds this card's source before trusting synchronous `player.status`/`availableVideoTracks` reads: `sourceLoad` is guarded by its `videoSource` payload; `readyToPlay` paths by `getAppliedVideoSourceUri(player)` (WeakMap updated by the controller after each successful replace).

Original caveats, resolved:
- Rapid HLS replace crashes: fixed in 3.0.12 (we ship 3.0.16); the serialized chain additionally prevents overlapping replaces from the controller.
- Debounced assignment: not needed — the existing viewability flush (deferred ~150–200ms) already gates source changes; the chain absorbs bursts.
- Detail keeps its own player + position-store restore (unchanged).

### Phase 3 — expo-video upgrade (requires explicit dependency decision — flag before doing)

Not part of cleanup work per AGENTS.md. When we're ready to take a dependency change (likely with the next SDK bump):

- expo-video 55/56 brings, all directly relevant:
  - `maxResolution` player option — per-player rendition cap that works directly on Bunny's HLS playlist (removes the need for the MP4-rewrite trick if we prefer staying on HLS).
  - Fix: `VideoView` holding strong ref to detached `VideoPlayer` (feed memory leak).
  - Fix: races between overlapping source loads / player release on iOS (pool robustness).
  - Failed-player recovery (broken-placeholder fix), media3 1.9.x, `useVideoPlayer` source changes now use `replaceAsync` instead of recreating the player.
- Decision point: if the SDK 55/56 upgrade lands before Phase 2 is built, build the pool on the new API and consider `maxResolution` over 1.2's MP4 rewrite (trade-off: `maxResolution` keeps adaptive HLS but loses the caching benefit of progressive MP4).
- Alternative considered and rejected: switching to react-native-video v7 (its `preload()`/`replaceSourceAsync` feed patterns are nice, but migration cost across post cards, galleries, editor, and preview modal outweighs the delta; expo-video is closing the gap release by release).

### Phase 4 — Delivery-side options (optional, needs backend/product input)

- **MP4 fallback flag on the Bunny library:** confirmed disabled (Jul 2026). Enabling it is a library-level toggle with storage-cost implications and only applies to newly encoded videos — pairs best with option 1 in Phase 1.2 (backend sends the feed URL/flag explicitly).
- **Authenticate `/upload_media`:** currently accepts anonymous uploads (verified). Separate from video perf, but should be on the backend list.
- **Manifest/URL prewarm:** evaluated Jul 2026 and **rejected as redundant** — warm-window videos already get a prepared player (which fetches the manifest), and all videos share one CDN host so DNS/TLS is warm after the first video. Only prewarming *beyond* the warm window would add anything, and that value is marginal. Revisit only if device TTFF numbers say otherwise.
- **Animated preview thumbnails:** Bunny generates them for free at `/{video_id}/preview.webp` (and `preview_hq.mp4`) — a richer feed "cover" with zero native players. Product decision.
- **Seek sprites:** Bunny also serves seek thumbnail sprites (`/{video_id}/seek/_0.jpg`) if we ever want scrubbing previews in detail view.

---

## 4. Verification

Per phase:
- Device test: fling home feed with mixed video/image posts; scroll back up; background/foreground; feed → detail → back.
- Memory: Xcode Instruments / Android Studio profiler snapshot before/after on a mid-tier Android device (Android is the constrained platform).
- TTFF numbers from 1.4 before/after.
- Regression checks: gallery posts, YouTube embeds (untouched), mute/audio focus, position restore, detail handoff, video editor (uses its own controller — keep it on the `detail` buffer profile).
- Repo checks: `bun run check:architecture`, `bun run lint` (scoped), `bun run check:file-sizes` (pool module keeps `post-card-media.tsx` from growing).

## 5. Suggested order of attack

1. Phase 1.1 (bufferOptions) — one file + call-site profiles; largest memory win per line of code.
2. Phase 1.2 + 1.3 together — bitrate cap + asymmetric window.
3. Phase 1.4 — measure, confirm on device.
4. Phase 2 — player pool, behind a simple constant/flag for easy rollback.
5. Phase 3 — only with an explicit dependency-upgrade decision.
6. Phase 4 — only if product/backend wants it.
