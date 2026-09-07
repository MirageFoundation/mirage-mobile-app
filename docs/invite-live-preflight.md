# Live invite prerequisite diagnostic

## Outcome

Stopped before any transaction. Six GET requests to `https://mirage.talk` returned HTTP 200 between **2026-09-07T21:16:31.450Z** and **2026-09-07T21:16:34.795Z** (runtime UTC clock; differs from the session's September 8 date).

Two independent blockers:

- Burner owner: `user_level: 0`, `effective_paid: false`. It has no indexed curator communities or memberships. Creating a team requires an active subscriber/admin.
- Exact username `batling`: resolved successfully, recipient address checksum validated, not the burner. Recipient status is `user_level: 1`, `effective_paid: true`, but its indexed membership already includes community `life`, team **1**, **Extraterrestrial**. Invitation requires that the recipient not already curate that community, including another team.

The `life` team list returned one live team, `Extraterrestrial` (ID `1`, one member), with `has_more: false`. There was no suitable existing burner test team to reuse. No new test-team name was allocated.

## Requests and authorization accounting

| UTC | GET endpoint | Result |
|---|---|---|
| 21:16:31.450 | `/api/get_user_status` (burner) | 200; unpaid/free |
| 21:16:32.070 | `/api/get_address_from_username?username=batling` | 200; exact username, valid address checksum |
| 21:16:32.720 | `/api/get_user_status` (recipient) | 200; paid |
| 21:16:33.370 | `/api/curators/[burner]/communities` | 200; empty |
| 21:16:34.221 | `/api/curators/[recipient]/communities` | 200; life/team 1 |
| 21:16:34.795 | `/api/communities/life/teams` | 200; one live team |

- Creates attempted: **0 of 1 authorized**.
- Invites attempted: **0 of 1 authorized**.
- Other transactions: **0**.
- Broadcasts, transaction hashes, settlement polls, signed curator reads: **none**.
- New on-chain artifacts: **none**; existing team untouched.
- No subscription, funding, purchase, gift, transfer, deletion, acceptance, post, or vote.

Balance was received privately inside the owner-status response; only the presence of a numeric balance was emitted, not its value. Sufficiency was not calculated because lack of subscriber eligibility is independently decisive. Quota was not supplied by this response; additional quota/PoW/config/private-pending reads were skipped because neither blocker can be repaired by those reads. Recipient global pending count and team invitation capacity were not inferred from public membership data.

## Source provenance and boundaries

Inspected existing `AGENTS.md`, `tools/invite-source-differential.mjs`, `docs/invite-transaction-differential.md`, current mobile curation endpoints/envelope/resolver/read contracts, wallet crypto, and reference keeper team requirements before live reads.

`tools/invite-live-preflight.mjs` is deliberately read-only: no POST implementation or transaction signing path is enabled. It uses the actual mobile `derivePrivateKey`, `getCompressedPublicKey`, `signCanonical`, address derivation/checksum validator, and `getAddressFromUsername` source functions via the existing Bun transpilation approach. Native Sentry is replaced with silent functions. It verifies the derived address and a locally signed challenge with installed secp256k1 before networking. The challenge signature is never transmitted.

Transport is a bounded diagnostic fetch boundary rather than native Axios/app providers: exact talk origin, GET allowlist, maximum eight requests, fresh ephemeral visitor UUID plus iOS header, manual redirects (reject rather than follow), 15-second per-request timeout, 256 KiB streamed response cap. No third-party requests or headers. No app wallet/session import or persistence. Credential input is TTY raw-mode/echo-disabled stdin only; no credential in script, argv, files, or emitted output. Native application UI, cache/session, PoW, write endpoint/envelope, and settlement paths were not executed because prerequisites failed.

## Relation to the recurring generic HTTP 400

Local keeper contracts in the reference checkout:

- `blockchain/x/core/keeper/team.go:28-33`: creation requires `CanCurate`.
- `blockchain/x/core/keeper/team.go:159-164`: existing recipient community membership rejects with `invitee already curates in this community`.

The previous differential report establishes that this latter text is missed by the inspected backend classifier and can become generic `transaction_rejected`. Today's live membership therefore supplies a concrete current condition that would prevent the requested invite under that contract. **It does not prove the historical HTTP 400's original simulation reason, deployed revision, or historical recipient state.** No intentional failing write was spent to demonstrate an already-known prerequisite failure, and no claim of new byte-level live transaction parity is made.

## Verification

- Live run: `bun --no-env-file tools/invite-live-preflight.mjs` via direct Bun executable in echo-disabled TTY: local wallet verification PASS; six GETs HTTP 200; no writes.
- `bunx --no-install eslint tools/invite-live-preflight.mjs`: PASS.

Only this report and the nonsecret read-only diagnostic were added. No production app/backend/dependency changes, commits, or deployment.

## Separate new-wallet test: exact recipient `badman`

A different, newly authorized burner was derived solely from fresh echo-disabled TTY stdin. No previous wallet or app session was loaded. The diagnostic's fixed recipient is now `badman`; the earlier `batling` results above remain historical and do not describe this run.

### Actual live evidence

Six bounded GETs to `https://mirage.talk` returned HTTP 200. Times below are runtime UTC on September 7, 2026 (the session calendar says September 8):

| UTC | GET endpoint | Result |
|---|---|---|
| 21:29:59.706 | `/api/get_user_status` (new burner) | `user_level: 0`, `effective_paid: false` |
| 21:30:00.553 | `/api/get_address_from_username?username=badman` | `exists: true`, exact username, valid address checksum, not self |
| 21:30:01.600 | `/api/get_user_status` (recipient) | username `badman`, `user_level: 0`, `effective_paid: false` |
| 21:30:02.266 | `/api/curators/[new-burner]/communities` | `communities: []`, `memberships: []` |
| 21:30:03.173 | `/api/curators/[recipient]/communities` | `communities: []`, `memberships: []` |
| 21:30:03.890 | `/api/communities/life/teams` | One live item: ID `1`, `Extraterrestrial`, one member; `has_more: false` |

**Stopped before transactions: both participants fail eligibility.** Reference `blockchain/x/core/types/params.go:120-123` defines `CanCurate` as effective paid status OR admin level. Both observed levels are zero, not admin. `blockchain/x/core/keeper/team.go:28-33` rejects creating a team without that eligibility; lines 153-157 independently reject an ineligible invitee. The empty burner curator memberships provide no owned team to reuse. Neither participant currently curates `life`; unlike the previous run, existing recipient membership is not the blocker.

A diagnostic-only schema assertion also fired after all six successful reads: it initially checked `teams.teams`, while the response actually uses `items`. Its emitted stop reason was `Team list incomplete`; the returned list itself was complete (`has_more: false`). Corrected the diagnostic to use `items` and ignore deleted teams, and moved key zeroing ahead of this assertion. No second live run was made: the separately observed eligibility blockers already conclusively require stopping writes. The corrected owned-team summary was therefore not executed live; no claim is made that it was.

### Accounting and boundaries

- Team creations attempted/submitted/settled: **0 / 0 / 0** (at most one authorized).
- Curator invites attempted/submitted/settled: **0 / 0 / 0** (at most one authorized).
- Other transactions: **0**; HTTP failures: **0**; diagnostic assertion failures: **1**, corrected locally afterward.
- Transaction hashes, DeliverTx polls, indexed invitation polls: **none**. No write endpoint was called, so no write error code or simulation reason exists for this test.
- New team or invitation artifacts: **none**. Existing teams unchanged; no acceptance, removal, revocation, cleanup, purchase, subscription, transfer, gift, post, or vote.
- Owner funds stayed private; balance value never emitted. Status did not return `daily_quota`. Quota, team invitation caps, recipient global pending count, and signed pending-invitation reads were not pursued because they cannot repair the already observed owner/recipient eligibility failures. Pending invitations were not inferred from empty membership lists.
- Current mobile curation write/read endpoints, username resolver, canonical create/invite builders, envelope logic, signed curator read, and authoritative reference keeper requirements were inspected. Actual mobile wallet derivation/signing/address source and username endpoint source executed with the same Bun transpilation, silent native Sentry substitution, and bounded diagnostic fetch boundary described above. Local challenge signature verification passed before networking. No transaction envelope, PoW, app cache/session, or native UI was exercised.
- Fresh ephemeral visitor UUID and iOS header; redirects manual/rejected, 15-second deadlines, 256 KiB body cap, maximum eight GETs. No mnemonic/private key/public key/proof/signature/sender address/balance in files, argv, or emitted output. Secure input was stdin only. Direct Bun process exited; no background service was started.

### New-wallet verification

- `bun --no-env-file tools/invite-live-preflight.mjs` through direct Bun executable and secure TTY: local wallet verification PASS, six HTTP 200 reads, zero writes; final diagnostic schema assertion described above.
- After the schema correction, `bunx --no-install eslint tools/invite-live-preflight.mjs`: PASS.
- No full suite, production/backend/native/dependency edits, commit, or deploy. This test supplies current prerequisite evidence only, not a reproduction or attribution of the historical generic HTTP 400.

## Newest-wallet test: exact recipient `batman`

This is a separate run with the newly supplied wallet, not either historical wallet above. The diagnostic now requires the explicit nonsecret argument `batman` and rejects other recipients; no old credential or recipient was reused.

**Confirmed: the sender is subscribed and already owns the sole live `life` team, `Extraterrestrial`, ID `1`. Stopped without creating a team or inviting because the exact recipient `batman` is not currently paid/admin.**

### Authoritative live observations

All six bounded GETs to `https://mirage.talk` returned HTTP 200. Runtime UTC date was September 7, 2026 (rather than the session calendar's September 8).

| UTC | GET endpoint | Result |
|---|---|---|
| 21:48:32.444 | `/api/get_user_status` (newest sender) | `user_level: 1`, `effective_paid: true`; `daily_quota` not returned |
| 21:48:33.133 | `/api/get_address_from_username?username=batman` | Exact username; `exists: true`; valid address checksum; not self |
| 21:48:34.537 | `/api/get_user_status` (recipient) | username `batman`; `user_level: 0`, `effective_paid: false` |
| 21:48:35.069 | `/api/curators/[sender]/communities` | `life`, `Extraterrestrial`, team `1` |
| 21:48:35.634 | `/api/curators/[recipient]/communities` | `communities: []`, `memberships: []` |
| 21:48:36.251 | `/api/communities/life/teams` | Sole live team `1`, `Extraterrestrial`, one member; exact owner match in memory; `has_more: false` |

Reference `blockchain/x/core/types/params.go:120-123` defines `CanCurate` as effective paid OR admin level (>=100). `blockchain/x/core/keeper/team.go:153-154` rejects an ineligible recipient with `invitee must be an active subscriber or admin`. The sender's subscription is **not** the blocker. Existing ownership is unambiguous and no creation is needed. Existing-owner invites have no separate sender `CanCurate` gate in this keeper path; normal relay/PoW rules remain applicable.

Recipient membership is empty, so same-community membership is not an observed blocker. Pending invitations, team invitation caps, recipient global pending count, and relay quota were not read after the decisive recipient eligibility failure. They cannot make an unpaid non-admin recipient eligible. No quota value or pending status was inferred. No signed `curator_read`, transaction envelope, or PoW was executed.

### Exact operation accounting and artifacts

- Team creates attempted/submitted/settled: **0 / 0 / 0**, of at most one authorized.
- Curator invites attempted/submitted/settled: **0 / 0 / 0**, of at most one authorized.
- GETs: **6**, all HTTP 200. POSTs and other writes: **0**.
- Transaction hashes, write error codes/status/reasons, transaction-status polls, indexed invitation polls: **none**, because no write was sent.
- New on-chain artifacts: **none**. Existing team `1` remains untouched. No cleanup transaction, acceptance, revoke/delete, app-wallet import/logout/reset, subscription purchase/gift, funding/transfer, post, or vote occurred.
- No generic HTTP 400 reproduced; no backend `invite_curator.err` correlation event exists for this run. This is a confirmed current prerequisite blocker, not a fix or attribution of any historical failure.

### Executed source and security boundaries

Inspected the current mobile username resolver, curation operation functions, and modern envelope logic. Executed the actual mobile wallet derivation, compressed public key, canonical signing, address/checksum functions and `getAddressFromUsername` source via Bun transpilation. Native Sentry was replaced by silent methods; the network boundary was the diagnostic's allowlisted fetch rather than native Axios/query/app providers. Local signed challenge verification with installed secp256k1 passed before networking; neither challenge signature nor credential was transmitted. Transaction operation/envelope source was inspected but not executed because preflight failed.

The new credential entered only direct-process TTY stdin after `Secure input ready (echo disabled)` was confirmed. No credential, private/public key, proof/signature, sender address, or balance value was emitted or written to files/argv. A numeric balance-presence boolean only was printed. The private key buffer was zeroed after the bounded reads. Requests used a fresh visitor UUID and iOS header, manual/rejected redirects, 15-second deadlines, and 256 KiB streamed caps. No process from this run remains active; the direct Bun process exited with code 0 after emitting `preflight_complete: true`.

### Newest-wallet verification

- `bun --no-env-file tools/invite-live-preflight.mjs batman` via absolute Bun executable: local wallet verification PASS; six HTTP 200 reads; complete owned-team summary; zero writes; exit 0.
- The initial direct terminal launch could not locate `bun` in its PATH and did not start the diagnostic. Resolved the Bun executable with `command -v bun`, then launched it directly; this was not a live request retry.
- `bunx --no-install eslint tools/invite-live-preflight.mjs`: PASS. Reviewed the changed diagnostic lines and report. Scoped Git status shows these two pre-existing diagnostic files remain untracked; `git diff --check` passes but does not inspect untracked content.
- No production mobile/backend/native/dependency changes, full test reruns, commits, or deployment. The separately delegated FaceID work was not inspected or modified.
