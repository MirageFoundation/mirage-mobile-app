# Native upload release checklist

Status: **device/runtime gates unrun**. Run against newly rebuilt iOS and Android apps, not Expo Go or an OTA-only update. The compressor 1.18.2 Bun patch must be in the native binary. Mocked JS tests, patch/source assertions and Swift typechecking with bridge stubs are not device enforcement evidence.

## Approved contract

- iOS supports uploading while Mirage is active. Keep the app open until the upload finishes.
- iOS uses a default URLSession because background sessions automatically follow redirects. File-backed multipart bounds memory; it does not restore daemon-backed execution.
- No guaranteed uninterrupted continuation during lock, suspension, system termination or force quit; no guaranteed resume after relaunch. No automatic rebroadcast/recovery journal is added.
- Android keeps its existing transport with both OkHttp redirect-follow flags disabled. Rebuild and validate Android too.
- Upload completion requires a valid successful server response, not progress reaching 100%, returning to foreground, or re-opening a draft.

## Controlled environment only

Use controlled initial and capture endpoints, synthetic image/video files and fresh throwaway visitor markers. Never use production upload/POST endpoints, real credentials, wallet phrases or real visitor IDs. Avoid logging complete URLs containing credentials, identity values, headers or body content. Record sanitized counts/status/byte totals and marker-presence booleans. Configure test-only network trust/ATS as needed without weakening shipping settings.

For every case, record platform/OS, build hash, app state, status, attempts, initial request count/bytes, destination request count/bytes and cleanup result. An initial endpoint that receives no valid upload makes a zero-capture result **inconclusive**, not a pass.

## Redirect matrix (both platforms; image and video)

For each status **301, 302, 303, 307, 308**, test all of:

- Same-origin destination (different path).
- Off-origin destination (different controlled host).
- HTTPS-to-HTTP downgrade destination.

Acceptance:

1. Initial endpoint receives the intended POST upload, generated multipart boundary, `file` part, expected filename/MIME, `kind`, video duration/width/height where provided, and initial Mirage visitor/platform markers. To test full-body receipt, have the fixture drain the body before sending the redirect; separately test an early redirect.
2. Destination capture receives **ZERO redirected requests, ZERO redirected headers and ZERO redirected body bytes**. Detect stripped-header or method-changed GET redirects too; zero visitor markers alone is not sufficient.
3. JS receives the original 3xx status and rejects terminally, without retry or destination retargeting. iOS may return an empty redirect body because consumption is cancelled after status capture.
4. Repeat with a slow/stalled redirect body, no Location, relative Location and malformed Location. Other returned 300-399 statuses must remain terminal. Record native failures separately from successful 3xx bridging.

## Valid functionality and lifecycle

- Normal image/video success: valid response shape and media playable; no multipart corruption; initial headers present. Upload 100% is still "waiting for server" until response completion.
- Slow request body and slow success response; inspect progress and timeout cleanup. Response bodies above the iOS 1-MiB cap must fail without unbounded buffering.
- Concurrent images plus video: distinct progress, response bodies and promise settlement; cancelling one must not affect others. Repeat successes/failures to check temp-file/session growth.
- Cancel before start, immediately after registration, mid-body, while awaiting response and with cancel-all. No stuck promise, second settlement or surviving progress listener; eventual removal of native state/temp files. Cancel during multipart preparation must clean up after queued preparation/cancellation finishes.
- Unreadable input and insufficient temporary disk: reject, no orphan partial multipart body. Binary upload must not delete the caller's source file.
- Network/5xx image failures: at most three total attempts (initial plus two retries). Video failures: one attempt. 3xx: one attempt for either kind. Retries always use captured original server and headers, never the newly selected server.
- Switch selected server during upload/retry: ordinary switch waits out the write; forced stale-generation responses are rejected. Verify no accidental upload on the replacement server.
- In separate runs characterize active foreground, home/app switch, lock, prolonged suspension, return to foreground, system termination and force quit. Do not require continuation in unsupported states or report it as guaranteed if it happens in one run. Verify no false success on foreground/relaunch and no silent auto-rebroadcast after termination.
- After termination, start a fresh explicit upload and inspect orphan multipart cleanup. Never replay an orphaned body. Verify the iOS keep-open guidance remains visible in the existing compose flow.

A release sign-off must attach sanitized device evidence for the matrix and lifecycle cases; passing local source/mocked checks alone is insufficient.
