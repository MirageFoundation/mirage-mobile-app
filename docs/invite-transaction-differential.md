# Invite HTTP 400: actual-source differential (2026-09-08)

## Status and strongest new evidence

The valid-address `POST /api/core/invite_curator` -> HTTP 400 `transaction_rejected`, without a transaction hash, is **not resolved**. No production transaction, replay, or new live probe was performed. Username resolution is separate.

The new offline comparison executes the **actual web queue and send implementation**, not a hand-written expectation of its tags. Both clients sign valid envelopes for the same public test key, recipient, community, team, fixed clock/random source, and paid status. No concrete mobile signing defect was found. Production state and deployed revision remain unknown.

New observed difference: web CosmJS produces a **65-byte signature**, while mobile produces 64 bytes. The local backend explicitly strips the trailing recovery byte from 65-byte signatures (`web/backend/routes/core.py:3960-3965`); both verify as compact secp256k1 signatures. This is not evidence that mobile should append a byte.

## Reproducible offline diagnostic

Run from the mobile root:

```sh
bun --no-env-file tools/invite-source-differential.mjs
```

Optional first argument: path to the existing mirage-node checkout. Requires its already-installed web dependencies; does not install anything. The tool reads reference files only.

Fixture: test private scalars 1 and 2 (public, not user credentials), community `Tech` normalized to `tech`, team 7, paid level 1 / relay allowed, clock `1788825600000`, random uint32 42. No fixture data should be confused with the user's actual team or recipient.

Provenance/adaptation:

- Reads complete current `web/frontend/src/utils/TransactionHandler.js`, `canonicalEncoding.js`, and `curation.js`. Removes module imports/exports and transpiles with Bun; no transaction method bodies are rewritten. Executes `inviteCurationTeamMember` -> `_enqueueCuration` -> `_enqueueBoundTransaction` -> queue/stamp -> `processTransactions` -> `performTransaction` -> `handleTransactionResult` -> captured `Api.post`.
- Uses web's existing `@cosmjs/crypto` and `@noble/secp256k1`, not mobile substitutes for web signing. Wallet derivation/owner/session checks are supplied a fixed public fixture; browser storage, notification, clock/random, network boundaries are stubbed. The captured network result intentionally fails, avoiding transaction polling and optimistic success paths.
- Executes current mobile `inviteCurator`, normalization, address validation, `buildSignedEnvelope`, canonical builder, `canonSignedWithPow`, and `signCanonical`. Captures `api.post` with fixed paid-status cache and wallet. Retry wrapper invokes once. Native imports are removed at module loading; production transaction/signature function bodies are unchanged. A direct native import initially failed on React Native Flow `import typeof`, motivating bounded module adaptation.
- This does **not** execute React UI mounting, real wallet/session persistence, actual Axios/fetch transport, paid-status retrieval, free-user Argon2, or backend simulation. It captures the actual endpoint payloads and verifies JSON round-trip, decodes every signed tag against its corresponding payload, verifies each signature, and cross-builds each captured envelope using the other client's actual builder.

Result: PASS. Web/mobile signed bytes are 176/145 bytes with their natural defaults; cross-building the *same captured envelope fields* gives byte-for-byte equality in both directions. Envelope body shape is flat JSON, not `{data: ...}` or a Cosmos TxRaw supplied by the client.

| Actual field/behavior | Web queue/send | Mobile endpoint/envelope | Local backend/chain consequence |
|---|---|---|---|
| timestamp | dequeue clock minus 15,000 ms | fresh clock | Both milliseconds; different signature preimages. Chain enforces freshness. Mobile is more exposed to a lagging block clock, but no timestamp rejection evidence exists for this attempt. Do not backdate without the real error. |
| paid last_block_hash | synthetic `Date.now().toString(16).padStart(64, '0')` | empty string | Both signed as supplied. Paid routing returns before PoW/block-hash verification (`blockchain/app/ante_v139.go:198-220`). No requirement for paid empty hash to become synthetic. |
| difficulty / proof | 0 / 0 | 0 / 0 | Both include signed tag 5 even for zero proof; PoW base excludes it. |
| nonce | safe integer `now * 1000 + 43` | decimal string `now * 1000000 + 42` | Web fallback avoids JS precision loss. Backend `int(raw)` accepts strings through uint64 max (`core.py:242-264`). Both fresh per execution; chain checks nonce uniqueness, not timestamp-derived nonce magnitude. |
| public key / signature | base64 33 / 65 bytes | base64 33 / 64 bytes | Backend normalizes 65 to 64, derives actor from pubkey, not visitor header. |
| digest | CosmJS SHA256(canonical), compact signature plus recovery | noble v2 sign(canonical), internal SHA256, low-S compact | Both verified with actual signature libraries; no double-hash defect found. |
| domain / authority / tip | `mirage.core.v1:MsgInviteCurator` + NUL; no client authority or tip | same | Chain ID is not in envelope domain; backend adds chain ID in its outer SignDoc. |
| entitlement decision | stored `user_level >= 1` skips work | cached `relay_allowed`, quota state; paid/admin never forced to PoW | Different cache policies can matter if stale, but paid fixture agrees. Server independently derives eligibility from signer profile; neither visitor nor client-supplied level authorizes it. |

## Routing, headers, backend execution

- Web `api.js:14-32,380-389`: default same-origin `/api`; build-time `VITE_API_BASE` can override. `JSON.stringify(body)` with Content-Type JSON and `X-Mirage-Visitor`.
- Mobile `src/api/client.ts`: selected-server coordinator captures `baseUrl`; default is `https://mirage.talk`, not proof of actual selection. Sends flat payload through Axios. `src/api/mirage-request-headers.ts:64-70` adds visitor and iOS/Android platform on trusted API destinations. The captured relative paths both resolve to `/api/core/invite_curator`, **not proof their real origins were identical**.
- Local `legacy_mobile_wiring.py:235-282,666-675`: visitor absence only selects legacy config transforms for chain config/node config/bootstrap; invite is absent from `RESTORED_PATHS`. Neither query rewrite nor restored dispatch selects legacy invite handling. Header name search places platform handling in `stats.py`, not core transaction auth. Local source supplies no evidence headers choose an alternate invite serializer. Deployment proxy differences cannot be excluded from local source alone.
- Actual invite registration is `_curation_team_route` (`core.py:4289-4364`), not `core_create_curation_team`. Invite **does not call** `can_curate` upfront or `_maybe_pow_precheck`; do not infer invite behavior from creation's guards.
- `_parse_relay_envelope` parses flat fields, base64 decodes, derives signer. `_fill_envelope` sets `authority = runtime.validator_payer_addr` and protobuf envelope fields. Payload is normalized community/team_id/target. Client cannot select validator authority, outer fees, fee payer, or outer chain ID via this request.
- `_broadcast_core_msg` (`core.py:3983-3998`) packs `/mirage.core.v1.MsgInviteCurator` in Any -> TxBody; estimates gas with `extra_len=64`; builds estimated transaction using `zero_fee=is_relay_exempt(actor)`; **simulates before broadcast**; then uses `max(gas_est, gas_used * GAS_BUFFER_MULTIPLIER)` and broadcasts.
- `tx.py:97-178`: backend validator signs, fee payer is validator; zero-fee path has no fee coin, otherwise ceil(gas * min_gas_price); sequence=0, unordered timeout, account number and chain ID from backend runtime. No client-supplied tip. Signer metadata and request memo are added on backend, identically for either frontend's invite.
- `tx.py:305-326`: simulation POST is server-to-node `runtime.api_url + /cosmos/tx/v1beta1/simulate` with `{tx_bytes: base64(TxRaw)}`, 10-second timeout. Non-200 throws `simulate_gas http STATUS: BODY`, truncated to 500 body characters. This inspection did not execute that POST.

## Concrete local backend classifier defect (not edited)

`blockchain/x/core/keeper/team.go:149-168` emits exact strings:

- `invitee must be an active subscriber or admin`
- `invitee already curates in this community`
- `invitation already pending`

But `_classify_exception` in `web/backend/routes/core.py:535-548` matches `requires an active subscriber` and `already a curator in this community`. The first two exact keeper messages **do not match those branches**, so a simulate execution failure carrying them falls into generic `transaction rejected`. This is a verified observability/classification mismatch, **not evidence the real recipient failed those checks**. No backend change was authorized or made. Other owner/team/capacity/outer transaction failures can collapse to the same response.

The generic invite exception handler logs `invite_curator.err rid=... error=<original exception string>` before classification (`core.py:4340-4344`). It does **not** call `logger.exception` or preserve a Python stack trace. Retrieve the original exception message first; do not promise an existing full traceback. No txhash is expected if simulation threw before broadcast, but the generic response alone cannot prove the exact exception stage.

## Exact operator retrieval, without guessed filesystem location

On the **selected server's actual backend runtime/container**, use its running supervisor configuration rather than assuming host paths:

```sh
supervisorctl status backend
supervisorctl tail -1000000 backend stdout
supervisorctl tail -1000000 backend stderr
```

These are operator instructions, not commands run during this investigation. If supervisor uses a non-default config/socket, use the same `supervisorctl -c CONFIG` used by that deployment. The inspected deployment registers `[program:backend]` in `deploy/write_supervisor_programs.sh:85-97`; stdout/stderr go to configured files. If a different process manager runs production, retrieve that running backend service's stdout/stderr through its manager instead, not a guessed filename.

Find `backend logging initialized -> ABSOLUTE_PATH` in those logs. That message reports the actual file path (`web/backend/logging_utils.py:21-28`); read the backend file for the attempt's UTC date, including rotated daily files if necessary. Shared logging resolves the service user's home and writes date-based files **and** console (`shared/logging_setup.py:62-126`). Gunicorn uses multiple sync workers and stdout access/error logs (`gunicorn_config.py:19-39`), so request IDs are worker-local, not globally unique.

Return the complete matching `invite_curator.err` line, its approximate timestamp/worker context, associated `build_tx` line, and backend/node deployment revision from that running instance. Strip secrets; no raw signed request, private keys, mnemonic, or environment dump is needed. For the node's cause longer than the logged first 500 characters, obtain corresponding node logs; do not re-send an invite to create a better error.

## Missing incident evidence and checks

This delegated environment lists **zero persistent terminals**, and a Bun-invoked `lsof -nP -iTCP:8081 -sTCP:LISTEN` returns no listener. Thus no newer Metro attempt/status/reason could be read here. The parent's reported HTTP 400 `transaction_rejected` with no hash remains the incident evidence, not independently refreshed logs. Historical report terminal IDs do not establish a currently available terminal.

Safe missing values: selected server (connect error to correct deployment), approximate attempt time (locate original log), community slug plus team ID (identify correct team/owner/capacity), recipient **public** address (inspect eligibility/membership). No actual team/recipient is guessed. Public team/profile/config reads could narrow owner/capacity/current profile issues once those values exist, but cannot reconstruct historical simulation state or private pending-invitation counts. No txhash exists here to look up; no public GET probes were spent speculatively.

Local source is not proof of deployed backend, web bundle, node binary, or their version alignment. Even a public version banner would not prove all running workers and node schema match this checkout. The production original exception and running deployment identity are still required; this diagnostic does not resolve the real invite.

Verification performed:

- `bun --no-env-file tools/invite-source-differential.mjs`: PASS, zero network requests.
- `bunx --no-install eslint tools/invite-source-differential.mjs`: PASS after fixing diagnostic-only missing global imports.
- `bun --no-env-file test tests/v139-curation-canonical.test.ts tests/curation-write-contract.test.ts`: 4 passed, 0 failed, 49 assertions.
- Scoped Git status and new-file whitespace checks: only the two new diagnostic/report files belong to this work; checks clean. No app implementation, backend, dependencies, commits, or deployment changes.
