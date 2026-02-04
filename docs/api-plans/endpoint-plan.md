


ENDPOINTS.md
ENDPOINTS.md
+1936
markdown
New file: 1936 lines
1# Mirage Node API Endpoints
2
3This document describes all gRPC and REST endpoints exposed by the Mirage blockchain node's `core` module.
4
5All REST endpoints are served via the gRPC-gateway. Base URL depends on node configuration (default `:1317` for REST, `:9090` for gRPC).
6
7---
8
9## Table of Contents
10
11- [Query Endpoints (READ)](#query-endpoints-read)
12  - [GetParams](#1-getparams)
13  - [GetDifficulty](#2-getdifficulty)
14  - [GetProfile](#3-getprofile)
15  - [GetProfiles](#4-getprofiles)
16  - [GetBridgeStatus](#5-getbridgestatus)
17  - [GetBridgeAttestation](#6-getbridgeattestation)
18  - [GetBridgeConfig](#7-getbridgeconfig)
19  - [GetBridgeMint](#8-getbridgemint)
20  - [GetBridgeBurn](#9-getbridgeburn)
21- [Transaction Endpoints (WRITE)](#transaction-endpoints-write)
22  - [Post](#1-post)
23  - [Edit](#2-edit)
24  - [Vote](#3-vote)
25  - [Delete](#4-delete)
26  - [SetUsername](#5-setusername)
27  - [FollowModerator](#6-followmoderator)
28  - [UnfollowModerator](#7-unfollowmoderator)
29  - [FollowUser](#8-followuser)
30  - [UnfollowUser](#9-unfollowuser)
31  - [FollowTopic](#10-followtopic)
32  - [UnfollowTopic](#11-unfollowtopic)
33  - [BlockPost](#12-blockpost)
34  - [UnblockPost](#13-unblockpost)
35  - [BlockUser](#14-blockuser)
36  - [UnblockUser](#15-unblockuser)
37  - [SendTokens](#16-sendtokens)
38  - [UpgradeLevel](#17-upgradelevel)
39  - [SetAutoRenewal](#18-setautorenewal)
40  - [BridgeBurn](#19-bridgeburn)
41  - [BridgeAttestBurned](#20-bridgeattestburned)
42  - [BridgeAttestMinted](#21-bridgeattestminted)
43  - [UpdateParams](#22-updateparams-governance)
44  - [SetLevel](#23-setlevel-governance)
45  - [PunishValidator](#24-punishvalidator-governance)
46  - [MintTokens](#25-minttokens-governance)
47  - [BurnTokens](#26-burntokens-governance)
48- [Common Structures](#common-structures)
49  - [Envelope Fields](#envelope-fields)
50  - [Params](#params)
51  - [TierConfig](#tierconfig)
52  - [BridgeChainConfig](#bridgechainconfig)
53
54---
55
56## Query Endpoints (READ)
57
58### 1. GetParams
59
60Returns the current module parameters.
61
62| | |
63|---|---|
64| **gRPC** | `mirage.core.v1.Query/GetParams` |
65| **REST** | `GET /mirage/core/v1/params` |
66| **CLI** | `miraged query core params` |
67
68**Request:** _None_
69
70**Response: `QueryParamsResponse`**
71```json
72{
73  "params": {
74    "min_difficulty": 1,
75    "pow_message_window": 100,
76    "pow_message_limit": 50,
77    "pow_calm_period_definition": 5,
78    "pow_calm_sequence_threshold": 3,
79    "mint_interval": 10,
80    "mint_quantity": 1000000,
81    "block_hash_window": 10,
82    "pow_difficulty_allowance": 5,
83    "max_username_size": 20,
84    "max_topic_size": 40,
85    "min_username_size": 3,
86    "min_topic_size": 1,
87    "mint_dynamic_credit_cap": 100,
88    "mint_dynamic_split": 0.5,
89    "subscription_period": 43200,
90    "tiers": [ /* array of TierConfig */ ],
91    "subscription_reserve_percent": 80,
92    "relay_min_gas_price": 5000,
93    "relay_max_gas_fee": 500000000,
94    "max_envelope_age": 60,
95    "bridge_chains": [ /* array of BridgeChainConfig */ ],
96    "bridge_attestation_threshold": 6667
97  }
98}
99```
100
101---
102
103### 2. GetDifficulty
104
105Returns the current Proof-of-Work difficulty state.
106
107| | |
108|---|---|
109| **gRPC** | `mirage.core.v1.Query/GetDifficulty` |
110| **REST** | `GET /mirage/core/v1/difficulty` |
111| **CLI** | `miraged query core difficulty` |
112
113**Request:** _None_
114
115**Response: `QueryDifficultyResponse`**
116```json
117{
118  "current_difficulty": 8,
119  "previous_difficulty": 7,
120  "last_change_height": 12345,
121  "pow_message_count": 42,
122  "consecutive_low_usage": 0,
123  "latest_block_hash": "a1b2c3d4e5f6...",
124  "current_height": 12400
125}
126```
127
128| Field | Type | Description |
129|---|---|---|
130| `current_difficulty` | `uint64` | Current PoW difficulty (leading zero bits required) |
131| `previous_difficulty` | `uint64` | Difficulty before the last change |
132| `last_change_height` | `int64` | Block height when difficulty last changed |
133| `pow_message_count` | `uint64` | Number of PoW messages in the current window |
134| `consecutive_low_usage` | `uint64` | Count of consecutive calm periods |
135| `latest_block_hash` | `string` | Most recent committed block hash (hex, lowercase) |
136| `current_height` | `int64` | Current block height |
137
138---
139
140### 3. GetProfile
141
142Returns a user profile by address.
143
144| | |
145|---|---|
146| **gRPC** | `mirage.core.v1.Query/GetProfile` |
147| **REST** | `GET /mirage/core/v1/profile/{address}` |
148| **CLI** | `miraged query core profile [address]` |
149
150**Request:**
151| Field | Type | Description |
152|---|---|---|
153| `address` | `string` | Mirage bech32 address (e.g. `mirage1...`) |
154
155**Response: `QueryProfileResponse`**
156```json
157{
158  "owner": "mirage1abc...",
159  "username": "alice",
160  "level": 1,
161  "created_at": 12345,
162  "subscription_expiry": 99999,
163  "auto_renew": true,
164  "reserve_funds": 500000,
165  "is_moderator": false,
166  "biography": "Hello world",
167  "avatar": "",
168  "banner": "",
169  "followed_moderators": ["mirage1mod1..."],
170  "followed_users": ["mirage1user1..."],
171  "followed_topics": ["general", "crypto"],
172  "blocked_users": [],
173  "blocked_posts": [],
174  "quality_posts": ["a1b2c3..."]
175}
176```
177
178| Field | Type | Description |
179|---|---|---|
180| `owner` | `string` | Profile owner address |
181| `username` | `string` | Display username |
182| `level` | `int32` | User tier level (0=free, 1-3=paid) |
183| `created_at` | `int64` | Block height when profile was created |
184| `subscription_expiry` | `int64` | Block height / timestamp when subscription expires |
185| `auto_renew` | `bool` | Whether subscription auto-renews |
186| `reserve_funds` | `uint64` | Gas reserve balance in umirage |
187| `is_moderator` | `bool` | Whether user has moderator status |
188| `biography` | `string` | User biography text |
189| `avatar` | `string` | Avatar reference |
190| `banner` | `string` | Banner reference |
191| `followed_moderators` | `string[]` | List of followed moderator addresses |
192| `followed_users` | `string[]` | List of followed user addresses |
193| `followed_topics` | `string[]` | List of followed topic strings |
194| `blocked_users` | `string[]` | List of blocked user addresses |
195| `blocked_posts` | `string[]` | List of blocked post tx hashes |
196| `quality_posts` | `string[]` | List of quality post tx hashes |
197
198---
199
200### 4. GetProfiles
201
202Returns all profiles with pagination.
203
204| | |
205|---|---|
206| **gRPC** | `mirage.core.v1.Query/GetProfiles` |
207| **REST** | `GET /mirage/core/v1/profiles` |
208| **CLI** | `miraged query core profiles` |
209
210**Request:**
211| Field | Type | Description |
212|---|---|---|
213| `pagination` | `PageRequest` | Standard Cosmos SDK pagination (optional) |
214
215**Response: `QueryProfilesResponse`**
216```json
217{
218  "profiles": [
219    { /* QueryProfileResponse */ }
220  ],
221  "pagination": {
222    "next_key": "base64...",
223    "total": "100"
224  }
225}
226```
227
228---
229
230### 5. GetBridgeStatus
231
232Returns the current bridge status including enabled chains and pending attestations.
233
234| | |
235|---|---|
236| **gRPC** | `mirage.core.v1.Query/GetBridgeStatus` |
237| **REST** | `GET /mirage/core/v1/bridge/status` |
238| **CLI** | `miraged query core bridge status` |
239
240**Request:** _None_
241
242**Response: `QueryBridgeStatusResponse`**
243```json
244{
245  "enabled_chains": [
246    {
247      "chain_id": "solana",
248      "enabled": true,
249      "fee": 1000000
250    }
251  ],
252  "pending_attestations_count": 3,
253  "chain_status": [
254    {
255      "chain_id": "solana",
256      "current_sequence": 42
257    }
258  ]
259}
260```
261
262| Field | Type | Description |
263|---|---|---|
264| `enabled_chains` | `BridgeChainConfig[]` | All chains with bridging enabled |
265| `pending_attestations_count` | `uint64` | Number of attestations awaiting threshold |
266| `chain_status` | `BridgeChainStatus[]` | Per-chain outbound sequence counters |
267
268---
269
270### 6. GetBridgeAttestation
271
272Queries a specific inbound attestation (external chain → Mirage) by source chain and burn ID.
273
274| | |
275|---|---|
276| **gRPC** | `mirage.core.v1.Query/GetBridgeAttestation` |
277| **REST** | `GET /mirage/core/v1/bridge/attestation/{source_chain}/{burn_id}` |
278| **CLI** | `miraged query core bridge attestation [source_chain] [burn_id]` |
279
280**Request:**
281| Field | Type | Description |
282|---|---|---|
283| `source_chain` | `string` | External chain ID (e.g. `"solana"`) |
284| `burn_id` | `string` | Burn tx hash on the external chain |
285
286**Response: `QueryBridgeAttestationResponse`**
287```json
288{
289  "found": true,
290  "source_chain": "solana",
291  "burn_id": "abc123txhash...",
292  "mirage_recipient": "mirage1abc...",
293  "amount": 1000000,
294  "attestors": ["miragevaloper1...", "miragevaloper2..."],
295  "attested_power": 6700,
296  "required_power": 6667,
297  "minted": true,
298  "created_at": 50000
299}
300```
301
302| Field | Type | Description |
303|---|---|---|
304| `found` | `bool` | Whether the attestation exists |
305| `source_chain` | `string` | External chain where the burn occurred |
306| `burn_id` | `string` | Unique burn identifier |
307| `mirage_recipient` | `string` | Destination address on Mirage |
308| `amount` | `uint64` | Amount to be minted (umirage) |
309| `attestors` | `string[]` | Validator addresses that have attested |
310| `attested_power` | `int64` | Total voting power that has attested |
311| `required_power` | `int64` | Voting power required to mint |
312| `minted` | `bool` | Whether tokens have been minted |
313| `created_at` | `int64` | Block height when attestation was created |
314
315---
316
317### 7. GetBridgeConfig
318
319Returns the bridge configuration parameters.
320
321| | |
322|---|---|
323| **gRPC** | `mirage.core.v1.Query/GetBridgeConfig` |
324| **REST** | `GET /mirage/core/v1/bridge/config` |
325| **CLI** | `miraged query core bridge config` |
326
327**Request:** _None_
328
329**Response: `QueryBridgeConfigResponse`**
330```json
331{
332  "chains": [
333    {
334      "chain_id": "solana",
335      "enabled": true,
336      "fee": 1000000
337    }
338  ],
339  "attestation_threshold": 6667
340}
341```
342
343| Field | Type | Description |
344|---|---|---|
345| `chains` | `BridgeChainConfig[]` | All configured bridge chains with their fees |
346| `attestation_threshold` | `uint64` | Voting power threshold in basis points (6667 = 66.67%) |
347
348---
349
350### 8. GetBridgeMint
351
352Queries an outbound bridge mint confirmation (Mirage → external chain).
353
354| | |
355|---|---|
356| **gRPC** | `mirage.core.v1.Query/GetBridgeMint` |
357| **REST** | `GET /mirage/core/v1/bridge/mint/{destination_chain}/{burn_id}` |
358| **CLI** | `miraged query core bridge mint [destination_chain] [burn_id]` |
359
360**Request:**
361| Field | Type | Description |
362|---|---|---|
363| `destination_chain` | `string` | External chain ID (e.g. `"solana"`) |
364| `burn_id` | `string` | Mirage burn sequence number |
365
366**Response: `QueryBridgeMintResponse`**
367```json
368{
369  "minted": true,
370  "destination_chain": "solana",
371  "destination_tx": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp...",
372  "found": true,
373  "attestors": ["miragevaloper1...", "miragevaloper2..."],
374  "attested_power": 7000,
375  "required_power": 6667
376}
377```
378
379| Field | Type | Description |
380|---|---|---|
381| `minted` | `bool` | Whether the mint has been confirmed (threshold crossed) |
382| `destination_chain` | `string` | External chain where mint occurred |
383| `destination_tx` | `string` | Tx signature/hash on the destination chain |
384| `found` | `bool` | Whether any attestation record exists |
385| `attestors` | `string[]` | Validator addresses that have attested |
386| `attested_power` | `int64` | Total voting power that has attested |
387| `required_power` | `int64` | Voting power required to confirm |
388
389---
390
391### 9. GetBridgeBurn
392
393Queries an outbound bridge burn record (Mirage → external chain).
394
395| | |
396|---|---|
397| **gRPC** | `mirage.core.v1.Query/GetBridgeBurn` |
398| **REST** | `GET /mirage/core/v1/bridge/burn/{destination_chain}/{burn_id}` |
399| **CLI** | `miraged query core bridge burn [destination_chain] [burn_id]` |
400
401**Request:**
402| Field | Type | Description |
403|---|---|---|
404| `destination_chain` | `string` | External chain ID (e.g. `"solana"`) |
405| `burn_id` | `string` | Mirage burn sequence number |
406
407**Response: `QueryBridgeBurnResponse`**
408```json
409{
410  "found": true,
411  "burn_id": "42",
412  "owner": "mirage1abc...",
413  "destination_chain": "solana",
414  "destination_address": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp...",
415  "amount": 2000000,
416  "bridge_fee": 1000000,
417  "sequence": 42,
418  "created_at": 50100
419}
420```
421
422| Field | Type | Description |
423|---|---|---|
424| `found` | `bool` | Whether the burn record exists |
425| `burn_id` | `string` | Mirage burn sequence number |
426| `owner` | `string` | Mirage address that initiated the burn |
427| `destination_chain` | `string` | External chain |
428| `destination_address` | `string` | Recipient address on destination chain |
429| `amount` | `uint64` | Gross amount burned (umirage) |
430| `bridge_fee` | `uint64` | Fee deducted from the amount (umirage) |
431| `sequence` | `uint64` | Outbound bridge sequence for the chain |
432| `created_at` | `int64` | Block height when burn occurred |
433
434---
435
436## Transaction Endpoints (WRITE)
437
438All transaction messages are submitted via the Cosmos SDK transaction broadcast mechanism (gRPC `cosmos.tx.v1beta1.Service/BroadcastTx` or REST `POST /cosmos/tx/v1beta1/txs`).
439
440Most user-facing messages use **envelope fields** for relay signature verification (PoW + meta-signature). Governance-only messages do not use envelopes.
441
442### 1. Post
443
444Creates a new post or comment.
445
446| | |
447|---|---|
448| **gRPC Msg** | `mirage.core.v1.Msg/Post` |
449| **Type URL** | `/mirage.core.v1.MsgPost` |
450
451**Payload: `MsgPost`**
452| Field | Type | Description |
453|---|---|---|
454| `authority` | `string` | Signer address (relay node or governance) |
455| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
456| `target` | `string` | Parent tx hash (64 hex chars) for comments; empty for top-level posts |
457| `topic` | `string` | Topic name (lowercase alphanumeric) |
458| `title` | `string` | Post title |
459| `content` | `string` | Post body content |
460| `tag` | `string` | Optional tag |
461
462**Response: `MsgPostResponse`** — _Empty_
463
464**Events Emitted:** `post` with attributes: `owner`, `target`, `topic`, `title`, `content`, `tag`, `txhash`
465
466---
467
468### 2. Edit
469
470Updates an existing post or comment.
471
472| | |
473|---|---|
474| **gRPC Msg** | `mirage.core.v1.Msg/Edit` |
475| **Type URL** | `/mirage.core.v1.MsgEdit` |
476
477**Payload: `MsgEdit`**
478| Field | Type | Description |
479|---|---|---|
480| `authority` | `string` | Signer address |
481| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
482| `target` | `string` | Parent tx hash for comments; empty for posts |
483| `topic` | `string` | Topic name |
484| `title` | `string` | Updated title |
485| `content` | `string` | Updated content |
486| `tag` | `string` | Updated tag |
487| `override` | `string` | Tx hash of the post/comment being edited (64 hex chars) |
488
489**Response: `MsgEditResponse`** — _Empty_
490
491---
492
493### 3. Vote
494
495Creates an upvote or downvote on a post/comment.
496
497| | |
498|---|---|
499| **gRPC Msg** | `mirage.core.v1.Msg/Vote` |
500| **Type URL** | `/mirage.core.v1.MsgVote` |
501
502**Payload: `MsgVote`**
503| Field | Type | Description |
504|---|---|---|
505| `authority` | `string` | Signer address |
506| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
507| `target` | `string` | Tx hash of the post/comment being voted on (64 hex chars) |
508| `direction` | `int32` | Vote direction: `1` = upvote, `-1` = downvote |
509
510**Response: `MsgVoteResponse`** — _Empty_
511
512---
513
514### 4. Delete
515
516Marks a post or comment as deleted (emits event for indexer).
517
518| | |
519|---|---|
520| **gRPC Msg** | `mirage.core.v1.Msg/Delete` |
521| **Type URL** | `/mirage.core.v1.MsgDelete` |
522
523**Payload: `MsgDelete`**
524| Field | Type | Description |
525|---|---|---|
526| `authority` | `string` | Signer address |
527| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
528| `target` | `string` | Tx hash of the post/comment to delete (64 hex chars) |
529
530**Response: `MsgDeleteResponse`** — _Empty_
531
532---
533
534### 5. SetUsername
535
536Sets or updates a username for the signer's address.
537
538| | |
539|---|---|
540| **gRPC Msg** | `mirage.core.v1.Msg/SetUsername` |
541| **Type URL** | `/mirage.core.v1.MsgSetUsername` |
542
543**Payload: `MsgSetUsername`**
544| Field | Type | Description |
545|---|---|---|
546| `authority` | `string` | Signer address |
547| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
548| `target` | `string` | Target address (owner derived from envelope) |
549| `username` | `string` | Desired username (lowercase alphanumeric, min/max length per params) |
550
551**Response: `MsgSetUsernameResponse`** — _Empty_
552
553---
554
555### 6. FollowModerator
556
557Adds a moderator to the signer's followed moderators list (capped deque).
558
559| | |
560|---|---|
561| **gRPC Msg** | `mirage.core.v1.Msg/FollowModerator` |
562| **Type URL** | `/mirage.core.v1.MsgFollowModerator` |
563
564**Payload: `MsgFollowModerator`**
565| Field | Type | Description |
566|---|---|---|
567| `authority` | `string` | Signer address |
568| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
569| `target` | `string` | Target address (owner) |
570| `moderator` | `string` | Moderator address to follow |
571
572**Response: `MsgFollowModeratorResponse`** — _Empty_
573
574---
575
576### 7. UnfollowModerator
577
578Removes a moderator from the signer's followed list.
579
580| | |
581|---|---|
582| **gRPC Msg** | `mirage.core.v1.Msg/UnfollowModerator` |
583| **Type URL** | `/mirage.core.v1.MsgUnfollowModerator` |
584
585**Payload:** Same structure as `MsgFollowModerator` — `target` + `moderator`
586
587**Response: `MsgUnfollowModeratorResponse`** — _Empty_
588
589---
590
591### 8. FollowUser
592
593Adds a user to the signer's followed users list (capped deque).
594
595| | |
596|---|---|
597| **gRPC Msg** | `mirage.core.v1.Msg/FollowUser` |
598| **Type URL** | `/mirage.core.v1.MsgFollowUser` |
599
600**Payload: `MsgFollowUser`**
601| Field | Type | Description |
602|---|---|---|
603| `authority` | `string` | Signer address |
604| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
605| `target` | `string` | Target address (owner) |
606| `user` | `string` | User address to follow |
607
608**Response: `MsgFollowUserResponse`** — _Empty_
609
610---
611
612### 9. UnfollowUser
613
614Removes a user from the signer's followed list.
615
616| | |
617|---|---|
618| **gRPC Msg** | `mirage.core.v1.Msg/UnfollowUser` |
619| **Type URL** | `/mirage.core.v1.MsgUnfollowUser` |
620
621**Payload:** Same structure as `MsgFollowUser` — `target` + `user`
622
623**Response: `MsgUnfollowUserResponse`** — _Empty_
624
625---
626
627### 10. FollowTopic
628
629Adds a topic to the signer's followed topics list (capped deque).
630
631| | |
632|---|---|
633| **gRPC Msg** | `mirage.core.v1.Msg/FollowTopic` |
634| **Type URL** | `/mirage.core.v1.MsgFollowTopic` |
635
636**Payload: `MsgFollowTopic`**
637| Field | Type | Description |
638|---|---|---|
639| `authority` | `string` | Signer address |
640| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
641| `target` | `string` | Target address (owner) |
642| `topic` | `string` | Topic string to follow |
643
644**Response: `MsgFollowTopicResponse`** — _Empty_
645
646---
647
648### 11. UnfollowTopic
649
650Removes a topic from the signer's followed list.
651
652| | |
653|---|---|
654| **gRPC Msg** | `mirage.core.v1.Msg/UnfollowTopic` |
655| **Type URL** | `/mirage.core.v1.MsgUnfollowTopic` |
656
657**Payload:** Same structure as `MsgFollowTopic` — `target` + `topic`
658
659**Response: `MsgUnfollowTopicResponse`** — _Empty_
660
661---
662
663### 12. BlockPost
664
665Blocks a post tx hash (persisted on-chain in signer's blocked list).
666
667| | |
668|---|---|
669| **gRPC Msg** | `mirage.core.v1.Msg/BlockPost` |
670| **Type URL** | `/mirage.core.v1.MsgBlockPost` |
671
672**Payload: `MsgBlockPost`**
673| Field | Type | Description |
674|---|---|---|
675| `authority` | `string` | Signer address |
676| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
677| `target` | `string` | Tx hash of the post to block (64 hex chars) |
678
679**Response: `MsgBlockPostResponse`** — _Empty_
680
681---
682
683### 13. UnblockPost
684
685Unblocks a previously blocked post.
686
687| | |
688|---|---|
689| **gRPC Msg** | `mirage.core.v1.Msg/UnblockPost` |
690| **Type URL** | `/mirage.core.v1.MsgUnblockPost` |
691
692**Payload:** Same structure as `MsgBlockPost` — `target`
693
694**Response: `MsgUnblockPostResponse`** — _Empty_
695
696---
697
698### 14. BlockUser
699
700Blocks a user address (persisted on-chain).
701
702| | |
703|---|---|
704| **gRPC Msg** | `mirage.core.v1.Msg/BlockUser` |
705| **Type URL** | `/mirage.core.v1.MsgBlockUser` |
706
707**Payload: `MsgBlockUser`**
708| Field | Type | Description |
709|---|---|---|
710| `authority` | `string` | Signer address |
711| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
712| `target` | `string` | Address of the user to block |
713
714**Response: `MsgBlockUserResponse`** — _Empty_
715
716---
717
718### 15. UnblockUser
719
720Unblocks a previously blocked user.
721
722| | |
723|---|---|
724| **gRPC Msg** | `mirage.core.v1.Msg/UnblockUser` |
725| **Type URL** | `/mirage.core.v1.MsgUnblockUser` |
726
727**Payload:** Same structure as `MsgBlockUser` — `target`
728
729**Response: `MsgUnblockUserResponse`** — _Empty_
730
731---
732
733### 16. SendTokens
734
735Sends tokens from one address to another.
736
737| | |
738|---|---|
739| **gRPC Msg** | `mirage.core.v1.Msg/SendTokens` |
740| **Type URL** | `/mirage.core.v1.MsgSendTokens` |
741
742**Payload: `MsgSendTokens`**
743| Field | Type | Description |
744|---|---|---|
745| `authority` | `string` | Signer address |
746| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
747| `sender` | `string` | Sender address (derived from envelope) |
748| `target` | `string` | Recipient address |
749| `amount` | `uint64` | Amount to send in umirage |
750
751**Response: `MsgSendTokensResponse`** — _Empty_
752
753---
754
755### 17. UpgradeLevel
756
757Upgrades user's subscription tier (requires token payment, no PoW).
758
759| | |
760|---|---|
761| **gRPC Msg** | `mirage.core.v1.Msg/UpgradeLevel` |
762| **Type URL** | `/mirage.core.v1.MsgUpgradeLevel` |
763
764**Payload: `MsgUpgradeLevel`**
765| Field | Type | Description |
766|---|---|---|
767| `authority` | `string` | Signer address |
768| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
769| `level` | `uint32` | Desired tier level (1-3) |
770
771**Response: `MsgUpgradeLevelResponse`** — _Empty_
772
773---
774
775### 18. SetAutoRenewal
776
777Sets the auto-renew flag for the user's subscription.
778
779| | |
780|---|---|
781| **gRPC Msg** | `mirage.core.v1.Msg/SetAutoRenewal` |
782| **Type URL** | `/mirage.core.v1.MsgSetAutoRenewal` |
783
784**Payload: `MsgSetAutoRenewal`**
785| Field | Type | Description |
786|---|---|---|
787| `authority` | `string` | Signer address |
788| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
789| `auto_renew` | `bool` | Whether to enable auto-renewal |
790
791**Response: `MsgSetAutoRenewalResponse`** — _Empty_
792
793---
794
795### 19. BridgeBurn
796
797Burns MIRAGE tokens to bridge them to an external chain (e.g., Solana). Orchestrators pick up the burn event and mint on the destination chain.
798
799| | |
800|---|---|
801| **gRPC Msg** | `mirage.core.v1.Msg/BridgeBurn` |
802| **Type URL** | `/mirage.core.v1.MsgBridgeBurn` |
803| **CLI** | `miraged tx bridge burn [destination_chain] [destination_address] [amount]` |
804
805**Payload: `MsgBridgeBurn`**
806| Field | Type | Description |
807|---|---|---|
808| `authority` | `string` | Signer address |
809| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
810| `destination_chain` | `string` | External chain ID (e.g. `"solana"`) |
811| `destination_address` | `string` | Recipient address on destination chain |
812| `amount` | `uint64` | Amount to burn in umirage (must be > bridge fee) |
813
814**Response: `MsgBridgeBurnResponse`**
815```json
816{
817  "burn_id": 42
818}
819```
820
821| Field | Type | Description |
822|---|---|---|
823| `burn_id` | `uint64` | Sequence number used by orchestrators to attest the mint |
824
825**Events Emitted:** `bridge_burn` with: `burn_id`, `owner`, `destination_chain`, `destination_address`, `amount`, `bridge_fee`, `sequence`
826
827---
828
829### 20. BridgeAttestBurned
830
831Allows validators to attest to a burn on an external chain (inbound bridge). When 2/3+ voting power attests, tokens are minted on Mirage.
832
833> **Note:** Does NOT use envelope fields — signed directly by the validator.
834
835| | |
836|---|---|
837| **gRPC Msg** | `mirage.core.v1.Msg/BridgeAttestBurned` |
838| **Type URL** | `/mirage.core.v1.MsgBridgeAttestBurned` |
839| **CLI** | `miraged tx bridge attest-burned [source_chain] [burn_id] [mirage_recipient] [amount]` |
840
841**Payload: `MsgBridgeAttestBurned`**
842| Field | Type | Description |
843|---|---|---|
844| `validator` | `string` | Validator operator address submitting attestation |
845| `source_chain` | `string` | External chain where burn occurred (e.g. `"solana"`) |
846| `burn_id` | `string` | Unique burn identifier on the external chain (tx hash) |
847| `mirage_recipient` | `string` | Destination address on Mirage chain |
848| `amount` | `uint64` | Amount burned on external chain (umirage equivalent) |
849
850**Response: `MsgBridgeAttestBurnedResponse`**
851```json
852{
853  "confirmed": true,
854  "attested_power": 7000,
855  "required_power": 6667
856}
857```
858
859| Field | Type | Description |
860|---|---|---|
861| `confirmed` | `bool` | Whether threshold was reached and tokens were minted |
862| `attested_power` | `int64` | Total attested voting power so far |
863| `required_power` | `int64` | Voting power required to mint |
864
865**Events Emitted:**
866- `bridge_attest`: `validator`, `source_chain`, `burn_id`, `power`, `attested_power`, `required_power`, `minted`
867- `bridge_mint` (on threshold): `source_chain`, `burn_id`, `recipient`, `amount`, `attested_power`, `required_power`
868
869---
870
871### 21. BridgeAttestMinted
872
873Allows validators to attest that a mint was completed on an external chain (outbound bridge). When 2/3+ voting power attests, a `BridgeConfirmed` event is emitted.
874
875> **Note:** Signed by the validator's operator key.
876
877| | |
878|---|---|
879| **gRPC Msg** | `mirage.core.v1.Msg/BridgeAttestMinted` |
880| **Type URL** | `/mirage.core.v1.MsgBridgeAttestMinted` |
881| **CLI** | `miraged tx bridge minted [burn_id] [destination_chain] [destination_tx]` |
882
883**Payload: `MsgBridgeAttestMinted`**
884| Field | Type | Description |
885|---|---|---|
886| `validator` | `string` | Validator operator address |
887| `burn_id` | `string` | Mirage burn sequence number (numeric string) |
888| `destination_chain` | `string` | External chain ID (e.g. `"solana"`) |
889| `destination_tx` | `string` | Tx signature/hash on the destination chain |
890| `mirage_tx_hash` | `string` | Original Mirage burn tx hash (for indexing) |
891
892**Response: `MsgBridgeAttestMintedResponse`**
893```json
894{
895  "confirmed": true,
896  "attested_power": 7000,
897  "required_power": 6667
898}
899```
900
901| Field | Type | Description |
902|---|---|---|
903| `confirmed` | `bool` | Whether threshold was reached and mint is confirmed |
904| `attested_power` | `int64` | Total attested voting power so far |
905| `required_power` | `int64` | Voting power required to confirm |
906
907**Events Emitted:** `bridge_attest_minted` with: `burn_id`, `destination_chain`, `destination_tx`, `validator`, `power`, `attested_power`, `required_power`, `minted`, `mirage_tx_hash`
908
909---
910
911### 22. UpdateParams (Governance)
912
913Updates the module parameters. Can only be executed via governance proposal.
914
915| | |
916|---|---|
917| **gRPC Msg** | `mirage.core.v1.Msg/UpdateParams` |
918| **Type URL** | `/mirage.core.v1.MsgUpdateParams` |
919
920**Payload: `MsgUpdateParams`**
921| Field | Type | Description |
922|---|---|---|
923| `authority` | `string` | Must be the x/gov module account address |
924| `params` | `Params` | Complete set of module parameters (see [Params](#params)) |
925
926**Response: `MsgUpdateParamsResponse`** — _Empty_
927
928---
929
930### 23. SetLevel (Governance)
931
932Sets the user level for a specific address. Governance only.
933
934| | |
935|---|---|
936| **gRPC Msg** | `mirage.core.v1.Msg/SetLevel` |
937| **Type URL** | `/mirage.core.v1.MsgSetLevel` |
938
939**Payload: `MsgSetLevel`**
940| Field | Type | Description |
941|---|---|---|
942| `authority` | `string` | Must be x/gov module address |
943| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
944| `target` | `string` | Address to set level for |
945| `level` | `int32` | New user level |
946
947**Response: `MsgSetLevelResponse`** — _Empty_
948
949---
950
951### 24. PunishValidator (Governance)
952
953Slashes, jails, or tombstones a validator. Governance only.
954
955| | |
956|---|---|
957| **gRPC Msg** | `mirage.core.v1.Msg/PunishValidator` |
958| **Type URL** | `/mirage.core.v1.MsgPunishValidator` |
959
960**Payload: `MsgPunishValidator`**
961| Field | Type | Description |
962|---|---|---|
963| `authority` | `string` | Must be x/gov module address |
964| `valoper` | `string` | Validator operator address to punish |
965| `fraction` | `string` | Slash fraction as decimal (e.g. `"0.01"` for 1%) |
966| `jail` | `bool` | Whether to jail the validator |
967| `tombstone` | `bool` | Whether to permanently tombstone the validator |
968| `reason` | `string` | Optional explanation |
969
970**Response: `MsgPunishValidatorResponse`** — _Empty_
971
972---
973
974### 25. MintTokens (Governance)
975
976Mints new tokens to a target address. Governance only.
977
978| | |
979|---|---|
980| **gRPC Msg** | `mirage.core.v1.Msg/MintTokens` |
981| **Type URL** | `/mirage.core.v1.MsgMintTokens` |
982
983**Payload: `MsgMintTokens`**
984| Field | Type | Description |
985|---|---|---|
986| `authority` | `string` | Must be x/gov module address |
987| `target` | `string` | Recipient address (auto-created if new) |
988| `amount` | `uint64` | Amount to mint in umirage |
989| `reason` | `string` | Optional reason (recorded in events) |
990
991**Response: `MsgMintTokensResponse`** — _Empty_
992
993---
994
995### 26. BurnTokens (Governance)
996
997Burns tokens from a target address. Governance only.
998
999| | |
1000|---|---|
1001| **gRPC Msg** | `mirage.core.v1.Msg/BurnTokens` |
1002| **Type URL** | `/mirage.core.v1.MsgBurnTokens` |
1003
1004**Payload: `MsgBurnTokens`**
1005| Field | Type | Description |
1006|---|---|---|
1007| `authority` | `string` | Must be x/gov module address |
1008| `target` | `string` | Address to burn tokens from |
1009| `amount` | `uint64` | Amount to burn in umirage |
1010| `reason` | `string` | Optional reason (recorded in events) |
1011
1012**Response: `MsgBurnTokensResponse`** — _Empty_
1013
1014---
1015
1016## Common Structures
1017
1018### Envelope Fields
1019
1020Most user-facing transaction messages include envelope fields for relay-based PoW verification. These are used when transactions are relayed by nodes on behalf of users.
1021
1022| Field | Type | Description |
1023|---|---|---|
1024| `envelope_pubkey` | `bytes` | 33-byte compressed secp256k1 public key of the actual signer |
1025| `envelope_block_hash` | `bytes` | Recent block hash used in PoW challenge |
1026| `envelope_difficulty` | `uint64` | PoW difficulty used |
1027| `envelope_pow` | `uint64` | PoW nonce solution |
1028| `envelope_timestamp` | `uint64` | Unix timestamp (must be within `max_envelope_age` seconds) |
1029| `envelope_signature` | `bytes` | secp256k1 signature over the message payload |
1030
1031---
1032
1033### Params
1034
1035Full module parameters object. See [GetParams](#1-getparams) for the response structure.
1036
1037| Field | Type | Description |
1038|---|---|---|
1039| `min_difficulty` | `uint64` | Absolute minimum PoW difficulty |
1040| `pow_message_window` | `uint64` | Sliding window size in blocks for PoW volume measurement |
1041| `pow_message_limit` | `uint64` | Threshold to trigger difficulty increase |
1042| `pow_calm_period_definition` | `uint64` | Max messages to count as a "calm" period |
1043| `pow_calm_sequence_threshold` | `uint64` | Consecutive calm periods before decreasing difficulty |
1044| `mint_interval` | `uint64` | Blocks between minting events |
1045| `mint_quantity` | `uint64` | umirage minted per mint event |
1046| `block_hash_window` | `uint64` | Number of recent block hashes accepted for PoW |
1047| `pow_difficulty_allowance` | `uint64` | Blocks after a change where previous difficulty is accepted |
1048| `max_username_size` | `uint64` | Maximum username length |
1049| `max_topic_size` | `uint64` | Maximum topic length |
1050| `min_username_size` | `uint64` | Minimum username length |
1051| `min_topic_size` | `uint64` | Minimum topic length |
1052| `mint_dynamic_credit_cap` | `uint64` | Per-interval relay credits per validator |
1053| `mint_dynamic_split` | `double` | Fraction [0,1] of mint allocated to dynamic pool |
1054| `subscription_period` | `uint64` | Renewal period in minutes (43200 = 30 days) |
1055| `tiers` | `TierConfig[]` | Tier configurations (index 0 = free, 1-3 = paid) |
1056| `subscription_reserve_percent` | `uint64` | % of period fee escrowed as gas reserve (0-100) |
1057| `relay_min_gas_price` | `uint64` | Min gas price for relay fee (umirage/gas) |
1058| `relay_max_gas_fee` | `uint64` | Max gas fee per relayed tx (umirage) |
1059| `max_envelope_age` | `uint64` | Max age in seconds for envelope timestamp |
1060| `bridge_chains` | `BridgeChainConfig[]` | Supported bridge chain configurations |
1061| `bridge_attestation_threshold` | `uint64` | Voting power threshold for bridging (basis points) |
1062
1063---
1064
1065### TierConfig
1066
1067Defines the configuration for a membership tier.
1068
1069| Field | Type | Description |
1070|---|---|---|
1071| `period_fee` | `uint64` | Subscription cost per period (umirage) |
1072| `max_followed_mods` | `uint64` | Max followed moderators |
1073| `max_followed_users` | `uint64` | Max followed users |
1074| `max_followed_topics` | `uint64` | Max followed topics |
1075| `max_blocked_users` | `uint64` | Max blocked users |
1076| `max_blocked_posts` | `uint64` | Max blocked posts |
1077| `max_quality_posts` | `uint64` | Max quality posts |
1078| `max_title_length` | `uint64` | Max post title length |
1079| `max_content_length` | `uint64` | Max post content length |
1080| `editing_time_mins` | `uint64` | Time window for editing in minutes |
1081| `archive_duration_days` | `uint64` | Days before content is archived |
1082| `vote_weight` | `double` | Vote weight multiplier |
1083| `award_permissions` | `uint32` | Award permission flags |
1084| `eligible_for_mod` | `bool` | Whether eligible for moderator status |
1085| `can_change_name` | `bool` | Whether can change username |
1086| `can_have_biography` | `bool` | Whether can set biography |
1087| `can_have_avatar` | `bool` | Whether can set avatar |
1088| `can_have_banner` | `bool` | Whether can set banner |
1089
1090---
1091
1092### BridgeChainConfig
1093
1094Defines configuration for a bridgeable external chain.
1095
1096| Field | Type | Description |
1097|---|---|---|
1098| `chain_id` | `string` | Unique chain identifier (e.g. `"solana"`) |
1099| `enabled` | `bool` | Whether bridging to/from this chain is allowed |
1100| `fee` | `uint64` | Flat bridge fee in umirage (burned on transfer) |
1101
1102---
1103
1104## Standard Cosmos SDK Endpoints
1105
1106In addition to the above custom endpoints, the node also exposes standard Cosmos SDK endpoints at their default paths:
1107
1108| Category | REST Base Path | Description |
1109|---|---|---|
1110| Auth | `/cosmos/auth/v1beta1/` | Account queries |
1111| Bank | `/cosmos/bank/v1beta1/` | Balance and supply queries |
1112| Staking | `/cosmos/staking/v1beta1/` | Validator and delegation queries |
1113| Gov | `/cosmos/gov/v1/` | Governance proposals and votes |
1114| Distribution | `/cosmos/distribution/v1beta1/` | Rewards and commission |
1115| Slashing | `/cosmos/slashing/v1beta1/` | Signing info and slashing |
1116| Tx | `/cosmos/tx/v1beta1/` | Transaction broadcast, queries, simulation |
1117| Tendermint | `/cosmos/base/tendermint/v1beta1/` | Node info, blocks, validators |
1118
1119These follow the standard Cosmos SDK API specifications.
1120
1121---
1122
1123## Web Backend API Endpoints (Indexer/Frontend)
1124
1125These REST endpoints are served by the Python/Flask web backend (`web/backend/routes/public.py`). They query the indexer database (not the blockchain directly) and power the frontend UI. All paths are prefixed with `/api/`.
1126
1127### Configuration & Parameters
1128
1129#### `POST /api/reload_params`
1130Force-reload chain parameters from the live chain.
1131
1132**Response:**
1133```json
1134{ "status": "ok", "params": { /* full chain params object */ } }
1135```
1136
1137---
1138
1139#### `GET /api/get_parameters`
1140Returns dynamic PoW parameters needed for transaction signing.
1141
1142| Param | Type | Description |
1143|---|---|---|
1144| `address` | `string` | (Optional) Address to include balance for |
1145
1146**Response:**
1147```json
1148{
1149  "last_block_hash": "a1b2c3...",
1150  "pow_difficulty": 8,
1151  "balance": 1000000
1152}
1153```
1154
1155---
1156
1157#### `GET /api/get_config`
1158Returns static blockchain/server config (cached 24h on frontend).
1159
1160**Response:**
1161```json
1162{
1163  "max_username_size": 20,
1164  "min_username_size": 3,
1165  "max_topic_size": 40,
1166  "min_topic_size": 1,
1167  "subscription_period": 43200,
1168  "mint_interval": 10,
1169  "block_time": 5.0,
1170  "pow_difficulty": 8,
1171  "pow_message_count": 42,
1172  "pow_calm_sequence": 0,
1173  "pow_last_change_height": 12345,
1174  "current_height": 12400,
1175  "tiers": [ /* TierConfig[] */ ],
1176  "validator_account_address": "mirage1...",
1177  "validator_operator_address": "miragevaloper1...",
1178  "validator_consensus_address": "miragevalcons1...",
1179  "validator_moniker": "my-node",
1180  "giphy_api_key": "..."
1181}
1182```
1183
1184---
1185
1186### User / Profile
1187
1188#### `GET /api/get_profile`
1189Get full on-chain profile including all lists.
1190
1191| Param | Type | Required | Description |
1192|---|---|---|---|
1193| `address` | `string` | Yes | Mirage bech32 address |
1194
1195**Response:**
1196```json
1197{
1198  "owner": "mirage1...",
1199  "username": "alice",
1200  "level": 1,
1201  "created_at": 12345,
1202  "subscription_expiry": 99999,
1203  "auto_renew": true,
1204  "reserve_funds": 500000,
1205  "is_moderator": false,
1206  "biography": "Hello",
1207  "avatar": "",
1208  "banner": "",
1209  "followed_users": ["mirage1..."],
1210  "followed_topics": ["general"],
1211  "followed_moderators": ["mirage1..."],
1212  "blocked_users": [],
1213  "blocked_posts": [],
1214  "quality_posts": []
1215}
1216```
1217
1218---
1219
1220#### `GET /api/get_user_status`
1221Get user-specific dynamic data (balance, level, subscription, recent votes).
1222
1223| Param | Type | Required | Description |
1224|---|---|---|---|
1225| `address` | `string` | Yes | Mirage bech32 address |
1226
1227**Response:**
1228```json
1229{
1230  "username": "alice",
1231  "balance": 1000000,
1232  "user_level": 1,
1233  "subscription_expiry": 99999,
1234  "auto_renew": true,
1235  "reserve_funds": 500000,
1236  "profile_registered_at": 12345,
1237  "recent_votes": [
1238    { "target": "abc123...", "direction": 1, "timestamp": 1700000000 }
1239  ],
1240  "latest_inbox_timestamp": 1700000000
1241}
1242```
1243
1244---
1245
1246#### `GET /api/get_user_followed`
1247Get user's follow lists (moderators, topics, users).
1248
1249| Param | Type | Required |
1250|---|---|---|
1251| `address` | `string` | Yes |
1252
1253**Response:**
1254```json
1255{
1256  "followed_moderators": ["mirage1..."],
1257  "followed_topics": ["general"],
1258  "followed_users": ["mirage1..."]
1259}
1260```
1261
1262---
1263
1264#### `GET /api/get_user_blocked`
1265Get user's block lists (posts, users).
1266
1267| Param | Type | Required |
1268|---|---|---|
1269| `address` | `string` | Yes |
1270
1271**Response:**
1272```json
1273{
1274  "blocked_posts": ["abc123..."],
1275  "blocked_users": ["mirage1..."]
1276}
1277```
1278
1279---
1280
1281#### `GET /api/get_blocked_users`
1282Get user's own blocked user addresses (not moderators').
1283
1284| Param | Type | Required |
1285|---|---|---|
1286| `address` | `string` | Yes |
1287
1288**Response:**
1289```json
1290{ "blocked_users": ["mirage1..."] }
1291```
1292
1293---
1294
1295#### `GET /api/get_preferences`
1296Get user's topic/author preference weights.
1297
1298| Param | Type | Required |
1299|---|---|---|
1300| `address` | `string` | Yes |
1301
1302**Response:**
1303```json
1304{
1305  "topics": [{ "topic": "general", "weight": 2.5 }],
1306  "authors": [{ "user": "mirage1...", "weight": 1.2 }]
1307}
1308```
1309
1310---
1311
1312#### `GET /api/get_similar_users`
1313Get users with similar taste profiles (cosine similarity on preference vectors).
1314
1315| Param | Type | Required |
1316|---|---|---|
1317| `address` | `string` | Yes |
1318
1319**Response:**
1320```json
1321{
1322  "similar_users": [
1323    { "address": "mirage1...", "username": "bob", "similarity": 0.85, "shared_dimensions": 5 }
1324  ]
1325}
1326```
1327
1328---
1329
1330### Username/Address Resolution
1331
1332#### `GET|POST /api/get_address_from_username`
1333Resolve username(s) to address(es).
1334
1335**Single (GET):** `?username=alice`
1336**Bulk (POST):** `{ "usernames": ["alice", "bob"] }`
1337
1338**Response (single):**
1339```json
1340{ "exists": true, "address": "mirage1...", "username": "alice" }
1341```
1342**Response (bulk):**
1343```json
1344{ "map": { "alice": "mirage1...", "bob": "mirage1..." } }
1345```
1346
1347---
1348
1349#### `GET|POST /api/get_username_from_address`
1350Resolve address(es) to username(s).
1351
1352**Single (GET):** `?address=mirage1...`
1353**Bulk (POST):** `{ "addresses": ["mirage1..."] }`
1354
1355**Response (single):**
1356```json
1357{ "username": "alice", "address": "mirage1..." }
1358```
1359**Response (bulk):**
1360```json
1361{ "map": { "mirage1...": "alice" } }
1362```
1363
1364---
1365
1366#### `GET /api/get_users`
1367Get all registered users with pagination.
1368
1369| Param | Type | Default | Description |
1370|---|---|---|---|
1371| `limit` | `int` | 100 | Results per page (max 500) |
1372| `page` | `int` | 1 | Page number |
1373| `has_username` | `bool` | false | Only users with usernames |
1374
1375**Response:**
1376```json
1377{
1378  "users": [{ "address": "mirage1...", "username": "alice" }],
1379  "page": 1, "limit": 100, "has_more": true, "total": 500
1380}
1381```
1382
1383---
1384
1385### Posts & Comments
1386
1387#### `GET /api/get_posts`
1388Get posts feed with optional topic filtering, algorithmic ranking, and pagination.
1389
1390| Param | Type | Default | Description |
1391|---|---|---|---|
1392| `topic` | `string` | — | Filter by topic (or `"all"`) |
1393| `feed` | `string` | — | `"home"` (similarity-based) or `"following"` |
1394| `by` | `string` | `"magic"` | Sort: `"magic"` or `"newest"` |
1395| `limit` | `int` | 25 | Results per page (max 100) |
1396| `page` | `int` | 1 | Page number |
1397| `address` | `string` | — | Viewer address (for personalization & blocking) |
1398| `allowed_tags` | `string` | `"sensitive"` | Comma-separated allowed NSFW tags |
1399
1400**Response:**
1401```json
1402{
1403  "posts": [
1404    {
1405      "post_id": "abc123...",
1406      "user_id": "mirage1...",
1407      "username": "alice",
1408      "author_level": 1,
1409      "timestamp": 1700000000,
1410      "topic": "general",
1411      "title": "Hello World",
1412      "content": "Post body...",
1413      "tag": "",
1414      "thumbnail": "",
1415      "points": 42.0,
1416      "comments": 5,
1417      "user_vote": 1,
1418      "user_weight": 1.0,
1419      "feed_type": "all",
1420      "feed_bucket": "trending",
1421      "feed_debug": { "bucket": "trending", "reason": "...", "score": 95.5 }
1422    }
1423  ],
1424  "total": 100,
1425  "page": 1,
1426  "limit": 25,
1427  "has_more": true,
1428  "latest_inbox_timestamp": 1700000000
1429}
1430```
1431
1432---
1433
1434#### `GET /api/get_user_posts`
1435Get posts by a specific user.
1436
1437| Param | Type | Default | Description |
1438|---|---|---|---|
1439| `owner` | `string` | — | User address (required) |
1440| `type` | `string` | — | `"submissions"` or `"comments"` |
1441| `address` | `string` | — | Viewer address |
1442| `limit` | `int` | 10 | Max 50 |
1443| `page` | `int` | 1 | Page |
1444
1445**Response:**
1446```json
1447{
1448  "posts": [
1449    {
1450      "post_id": "...", "user_id": "...", "username": "...", "author_level": 1,
1451      "timestamp": 1700000000, "topic": "...", "title": "...", "content": "...",
1452      "target": "", "edited": false, "edited_at": 0, "thumbnail": "",
1453      "points": 10, "comments": 3, "user_vote": 0, "user_weight": 0.0
1454    }
1455  ],
1456  "page": 1, "limit": 10, "has_more": true, "total": 50
1457}
1458```
1459
1460---
1461
1462#### `GET /api/get_comments`
1463Get full comment tree for a post (recursive, max depth 6).
1464
1465| Param | Type | Required | Description |
1466|---|---|---|---|
1467| `post_id` | `string` | Yes | Post txhash |
1468| `address` | `string` | No | Viewer address |
1469
1470**Response:**
1471```json
1472{
1473  "root": {
1474    "post_id": "...", "user_id": "...", "username": "...", "author_level": 1,
1475    "timestamp": 1700000000, "topic": "...", "title": "...", "content": "...",
1476    "tag": "", "points": 42, "comments": 15, "children": [],
1477    "user_vote": 0, "user_weight": 0.0
1478  },
1479  "children": [
1480    {
1481      "post_id": "...", "target": "...", "content": "...",
1482      "points": 5, "comments": 2, "children": [ /* nested */ ],
1483      "user_vote": 1, "user_weight": 1.0
1484    }
1485  ],
1486  "latest_inbox_timestamp": 1700000000
1487}
1488```
1489
1490---
1491
1492#### `GET /api/get_root_post_id`
1493Find the root post ID for a comment by traversing up the tree.
1494
1495| Param | Type | Required |
1496|---|---|---|
1497| `comment_id` | `string` | Yes |
1498
1499**Response:**
1500```json
1501{ "root_post_id": "abc123...", "comment_id": "def456..." }
1502```
1503
1504---
1505
1506#### `GET /api/get_comment_context`
1507Get parent chain for a comment (up to max_depth parents).
1508
1509| Param | Type | Default | Description |
1510|---|---|---|---|
1511| `comment_id` | `string` | — | Required |
1512| `address` | `string` | — | Viewer address |
1513| `max_depth` | `int` | 5 | 1-5 |
1514
1515**Response:**
1516```json
1517{
1518  "context": [ /* array of parent posts, nearest first */ ],
1519  "comment_id": "def456..."
1520}
1521```
1522
1523---
1524
1525#### `GET /api/get_inbox`
1526Get inbox (replies to user's posts/comments).
1527
1528| Param | Type | Default | Description |
1529|---|---|---|---|
1530| `address` | `string` | — | Required |
1531| `page` | `int` | 1 | Page |
1532| `limit` | `int` | 25 | Max 100 |
1533
1534**Response:**
1535```json
1536{
1537  "replies": [
1538    {
1539      "reply_id": "...",
1540      "reply_owner": "mirage1...",
1541      "reply_username": "bob",
1542      "reply_author_level": 1,
1543      "reply_content": "Nice post!",
1544      "reply_timestamp": 1700000000,
1545      "parent_id": "...",
1546      "parent_content": "Original post title...",
1547      "parent_owner": "mirage1...",
1548      "root_post_id": "abc123..."
1549    }
1550  ],
1551  "total": 50, "page": 1, "limit": 25, "has_more": true
1552}
1553```
1554
1555---
1556
1557#### `GET /api/get_reports`
1558Get content reports (requires level >= 100 / moderator).
1559
1560| Param | Type | Required |
1561|---|---|---|
1562| `address` | `string` | Yes |
1563| `limit` | `int` | No (default 100, max 500) |
1564
1565**Response:**
1566```json
1567{
1568  "reports": [
1569    {
1570      "id": 1, "reporter_owner": "mirage1...", "reporter_username": "alice",
1571      "target": "abc123...", "reason": "spam", "timestamp": 1700000000,
1572      "post_owner": "mirage1...", "post_username": "bob",
1573      "title": "...", "content": "..."
1574    }
1575  ]
1576}
1577```
1578
1579---
1580
1581### Topics & Search
1582
1583#### `GET /api/get_topics`
1584Get most active topics.
1585
1586| Param | Type | Default | Description |
1587|---|---|---|---|
1588| `limit` | `int` | 50 | Max 200 |
1589| `min_posts` | `int` | 10 | Minimum posts to include |
1590
1591**Response:**
1592```json
1593{
1594  "topics": [
1595    {
1596      "topic": "general", "post_count": 150, "count": 150, "comment_count": 300,
1597      "flags": { "porn": false, "violence": false, "gore": false, "death": false, "sensitive": false },
1598      "dominant_tag": null, "dominant_ratio": 0
1599    }
1600  ],
1601  "small_topics_count": 25,
1602  "min_posts": 10
1603}
1604```
1605
1606---
1607
1608#### `GET /api/search_topics`
1609Search topics by substring with relevance sorting.
1610
1611| Param | Type | Default | Description |
1612|---|---|---|---|
1613| `q` | `string` | — | Search query (min 2 chars) |
1614| `limit` | `int` | 20 | Max 50 |
1615| `offset` | `int` | 0 | Pagination offset |
1616
1617**Response:**
1618```json
1619{
1620  "topics": [
1621    { "topic": "general", "post_count": 150, "count": 150, "dominant_tag": null, "dominant_ratio": 0 }
1622  ]
1623}
1624```
1625
1626---
1627
1628#### `GET /api/search`
1629Unified search (topics, users, posts). Prefix `@` for user search, `#` for topic search.
1630
1631| Param | Type | Default | Description |
1632|---|---|---|---|
1633| `q` | `string` | — | Search query (required) |
1634| `type` | `string` | — | Filter: `"topics"`, `"users"`, `"posts"` |
1635| `limit` | `int` | 10 | Max 50 |
1636| `offset` | `int` | 0 | Pagination |
1637| `address` | `string` | — | Viewer (for blocking) |
1638
1639**Response:**
1640```json
1641{
1642  "query": "hello",
1643  "search_type": "general",
1644  "topics": [{ "topic": "...", "post_count": 10 }],
1645  "users": [{ "address": "mirage1...", "username": "...", "level": 1, "post_count": 5 }],
1646  "posts": [{ "post_id": "...", "title": "...", "content": "...", "points": 10, "comments": 2 }],
1647  "has_more_topics": false,
1648  "has_more_users": false,
1649  "has_more_posts": false
1650}
1651```
1652
1653---
1654
1655### Transaction Status
1656
1657#### `GET /api/get_tx_status`
1658Unified transaction status with type-specific enrichment.
1659
1660| Param | Type | Required | Description |
1661|---|---|---|---|
1662| `hash` | `string` | Yes | 64-char hex tx hash |
1663| `address` | `string` | No | Viewer address |
1664
1665**Response:**
1666```json
1667{
1668  "found": true,
1669  "tx_hash": "abc123...",
1670  "height": 12345,
1671  "code": 0,
1672  "success": true,
1673  "indexed": true,
1674  "tx_type": "post",
1675  "details": { "post_id": "abc123...", "topic": "general", "title": "Hello" },
1676  "latest_inbox_timestamp": 1700000000
1677}
1678```
1679
1680| `tx_type` values | `details` fields |
1681|---|---|
1682| `"vote"` | `owner`, `target`, `user_vote`, `user_weight`, `target_points` |
1683| `"post"` | `post_id`, `topic`, `title` |
1684| `"profile"` | `owner`, `username` |
1685| `"follow_user"` | `owner`, `target` |
1686| `"follow_topic"` | `owner`, `topic` |
1687| `"unknown"` | _(none)_ |
1688
1689---
1690
1691### Network & Supply
1692
1693#### `GET /api/get_network_stats`
1694Network stats for the network dashboard.
1695
1696**Response:**
1697```json
1698{
1699  "server_balance": 1000000,
1700  "block_time": 5.0,
1701  "pow_difficulty": 8,
1702  "pow_message_count": 42,
1703  "pow_calm_sequence": 0,
1704  "pow_last_change_height": 12345,
1705  "current_height": 12400,
1706  "difficulty_history": [
1707    { "height": 12300, "difficulty": 7, "msg_count": 30, "timestamp": 1700000000 }
1708  ]
1709}
1710```
1711
1712---
1713
1714#### `GET /api/get_supply_history`
1715Supply history for burn/mint chart (last 7 days, cached 30s).
1716
1717**Response:**
1718```json
1719{
1720  "history": [
1721    { "height": 12300, "total_supply": 1000000000, "timestamp": 1700000000 }
1722  ],
1723  "mint_interval": 10,
1724  "mint_quantity": 1000000
1725}
1726```
1727
1728---
1729
1730#### `GET /api/get_total_supply`
1731CoinGecko-compliant total supply. Returns **plain text** with 6 decimals.
1732
1733**Response:** `1234567.890000` (text/plain)
1734
1735---
1736
1737#### `GET /api/get_circulating_supply`
1738CoinGecko-compliant circulating supply (total minus excluded wallets). Returns **plain text**.
1739
1740**Response:** `1100000.000000` (text/plain)
1741
1742---
1743
1744#### `GET /api/get_circulation_stats`
1745Total supply and top 10 accounts by balance (cached 60s).
1746
1747**Response:**
1748```json
1749{
1750  "total_supply": 1000000000,
1751  "top_accounts": [
1752    { "address": "mirage1...", "username": "whale", "balance": 500000000 }
1753  ]
1754}
1755```
1756
1757---
1758
1759#### `GET /api/get_peers`
1760Currently connected peers with domain resolution.
1761
1762**Response:**
1763```json
1764{
1765  "peers": [
1766    { "ip": "1.2.3.4", "moniker": "https://peer1.example.com" }
1767  ]
1768}
1769```
1770
1771---
1772
1773### Stats & Analytics
1774
1775#### `GET /api/get_welcome_stats`
1776Lightweight stats for the landing page (cached 30s).
1777
1778**Response:**
1779```json
1780{
1781  "registered_users": 1234,
1782  "posts_24h": 56,
1783  "active_24h": 78
1784}
1785```
1786
1787---
1788
1789#### `GET /api/get_stats`
1790Full stats page. Supports tabs via `?tab=` parameter.
1791
1792| Tab | Description |
1793|---|---|
1794| `overview` (default) | Core counts (users, posts, comments, votes, 24h stats) |
1795| `signups` | Signup history |
1796| `subscribers` | Subscriber stats |
1797| `accounts` | Account-level stats |
1798| `analytics` | DAU/MAU, device/browser/OS breakdown |
1799| `rewards` | Validator reward stats |
1800| `rewards_history` | Historical reward data |
1801
1802**Response (overview):**
1803```json
1804{
1805  "registered_users": 1234,
1806  "total_posts": 5000,
1807  "total_comments": 15000,
1808  "total_votes": 30000,
1809  "posts_24h": 56,
1810  "comments_24h": 120
1811}
1812```
1813
1814---
1815
1816#### `POST /api/stats/event`
1817Record analytics events (visits, sessions, page views).
1818
1819**Payload:**
1820```json
1821{
1822  "event_type": "visit",
1823  "session_id": "uuid-session-id",
1824  "user_address": "mirage1...",
1825  "user_agent": "Mozilla/5.0...",
1826  "referrer": "https://example.com",
1827  "page_path": "/topic/general"
1828}
1829```
1830
1831| `event_type` values | Description |
1832|---|---|
1833| `visit` | Page visit |
1834| `session_start` | New session began |
1835| `session_end` | Session ended |
1836| `page_view` | Page navigation |
1837
1838**Response:**
1839```json
1840{ "success": true }
1841```
1842
1843---
1844
1845### Media Uploads
1846
1847#### `POST /api/get_upload_url`
1848Get a direct upload URL for client-side uploads (Cloudflare Images/Stream).
1849
1850**Payload:**
1851```json
1852{ "type": "image" }
1853```
1854
1855**Response (image):**
1856```json
1857{ "uploadURL": "https://upload.imagedelivery.net/...", "id": "image-id", "accountHash": "abc..." }
1858```
1859
1860**Response (video):**
1861```json
1862{ "uploadURL": "https://upload.videodelivery.net/...", "provider": "stream", "streamCustomer": "...", "uid": "video-uid" }
1863```
1864
1865---
1866
1867#### `GET /api/stream_proxy/<video_uid>/<path>`
1868Proxy for Cloudflare Stream HLS manifests/segments (avoids CORS issues).
1869
1870---
1871
1872### Referrals
1873
1874#### `GET /api/referral/stats`
1875Get referral stats and tree for a user.
1876
1877| Param | Type | Required |
1878|---|---|---|
1879| `address` | `string` | Yes |
1880
1881**Response:**
1882```json
1883{
1884  "pending_total": 50.0,
1885  "paid_total": 200.0,
1886  "total_referrals": 15,
1887  "referral_tree": [
1888    {
1889      "address": "mirage1...", "username": "bob", "level": 1, "rate": 1.0,
1890      "pending": 10.0, "paid": 50.0, "denied": 0.0,
1891      "children": [], "descendant_count": 0
1892    }
1893  ],
1894  "referred_by": { "address": "mirage1...", "username": "alice" },
1895  "last_update_ts": 1700000000,
1896  "next_update_ts": 1700086400
1897}
1898```
1899
1900---
1901
1902### Invite Codes (mirage.talk only)
1903
1904#### `GET /api/get_invite_codes`
1905Get all invite codes owned by an address.
1906
1907| Param | Type | Required |
1908|---|---|---|
1909| `address` | `string` | Yes |
1910
1911**Response:**
1912```json
1913{
1914  "codes": [
1915    { "code": "ABCD-EFGH", "used_by": null, "created_at": 1700000000, "used_at": null, "is_used": false }
1916  ],
1917  "total": 3,
1918  "available": 2
1919}
1920```
1921
1922---
1923
1924#### `POST /api/validate_invite_code`
1925Validate that an invite code exists and is unused. Only works on mirage.talk/localhost.
1926
1927**Payload:**
1928```json
1929{ "code": "ABCD-EFGH" }
1930```
1931
1932**Response:**
1933```json
1934{ "valid": true, "owner": "mirage1..." }
1935```
1936
Document Node.js project API endpoints and structures
ctx
157.1K
3.6695
claude-opus-4-5
Document Node.js project API endpoints and structures
ctx
157.1K
out
24.3K
4m 28s
3.6695
claude-opus-4-5
You
·
02:14 PM
can ou got hrough this project, and create a document outlining all the endpoints that are there on the node along with their response and payload strcutures
build
·
·
claude-opus-4-5
·
02:14 PM

Reasoning
The user wants me to go through the project and document all the endpoints on the blockchain node, including their request/response structures. Let me explore the codebase to find all endpoints.

Key places to look:
1. Proto files (define the gRPC/REST endpoints)
2. Query and TX handlers
3. OpenAPI/Swagger docs
4. CLI commands that interact with endpoints
Explore proto files for query/tx service definitions
Read query.proto for query endpoints
Read tx.proto for transaction endpoints
Read gRPC gateway files for REST mappings
Check OpenAPI/Swagger docs
Read handler implementations for details
Create comprehensive endpoint document

read
·
blockchain/proto/mirage/core/v1/query.proto
· 252 lines · 455ms

read
·
blockchain/proto/mirage/core/v1/tx.proto
· 699 lines · 315ms

read
·
blockchain/proto/mirage/core/v1/params.proto
· 144 lines · 401ms

read
·
blockchain/proto/mirage/core/v1/genesis.proto
· 60 lines · 311ms
Explore proto files for query/tx service definitions
Read query.proto for query endpoints
Read tx.proto for transaction endpoints
Read gRPC gateway files for REST mappings
Check OpenAPI/Swagger docs
Read handler implementations for details
Create comprehensive endpoint document

read
·
blockchain/x/core/module/query.go
· 136 lines · 514ms

read
·
blockchain/x/core/module/bridge_handlers.go
· 629 lines · 462ms

read
·
blockchain/x/core/module/bridge_events.go
· 21 lines · 360ms

read
·
blockchain/x/core/module/cli_bridge.go
· 273 lines · 428ms

read
·
blockchain/x/core/types/bridge.go
· 407 lines · 478ms
Explore proto files for query/tx service definitions
Read query.proto for query endpoints
Read tx.proto for transaction endpoints
Read gRPC gateway files for REST mappings
Check OpenAPI/Swagger docs
Read handler implementations for details
Create comprehensive endpoint document

read
·
blockchain/x/core/module/module.go:1-80
· 80 lines · 897ms

read
·
blockchain/x/core/types/keys.go
· 43 lines · 453ms

write
·
ENDPOINTS.md
· 34158 bytes · 138.1s
Explore proto files for query/tx service definitions
Read query.proto for query endpoints
Read tx.proto for transaction endpoints
Read gRPC gateway files for REST mappings
Check OpenAPI/Swagger docs
Read handler implementations for details
Create comprehensive endpoint document

Created ENDPOINTS.md at the project root. It documents:

9 Query endpoints (REST GET + gRPC) — Params, Difficulty, Profile, Profiles, BridgeStatus, BridgeAttestation, BridgeConfig, BridgeMint, BridgeBurn
26 Transaction messages (gRPC Msg service) — social features (Post, Edit, Vote, Delete, follow/block/username), token operations (SendTokens, UpgradeLevel), bridge operations (BridgeBurn, BridgeAttestBurned, BridgeAttestMinted), and governance-only messages (UpdateParams, SetLevel, PunishValidator, MintTokens, BurnTokens)
Common structures — Envelope fields, Params, TierConfig, BridgeChainConfig
Standard Cosmos SDK endpoints reference

Done
·
120ms
You
·
08:24 PM
can u check if there is get welcome stats endpoint?
build
·
·
claude-opus-4-5
·
08:24 PM

Reasoning
Let me search for "welcome" or "stats" in the codebase.

search
·
"welcome|WelcomeStats|GetWelcom…"
·
90 matches
·
659ms

read
·
web/backend/routes/public.py:5679-5755
· 77 lines · 1.1s

Yes, there is a get_welcome_stats endpoint. It's a web backend endpoint (not an on-chain query), defined at web/backend/routes/public.py:5679.

Endpoint: GET /api/get_welcome_stats

Response:


{
  "registered_users": 1234,
  "posts_24h": 56,
  "active_24h": 78
}
It's cached for 30 seconds and queries the indexer database (not the blockchain directly). I missed it in the ENDPOINTS.md since that doc only covered the on-chain gRPC/REST endpoints. Want me to add the web backend API endpoints to the document as well?

Done
·
137ms
You
·
08:25 PM
yes
build
·
·
claude-opus-4-5
·
08:25 PM

Reasoning
The user wants me to add the web backend API endpoints to the ENDPOINTS.md document. Let me first discover all the web backend API endpoints to get a comprehensive list.

search
·
"@public_bp\.route\(""
·
39 matches
·
982ms

Reasoning
There are 39 web backend endpoints. Let me read each one to understand their request/response structures. Let me batch read a few key ones first, then continue.
Discover all web backend API endpoints
Read endpoint implementations for request/response structures
Add web backend API section to ENDPOINTS.md

Let me read through the endpoint implementations in batches.

read
·
web/backend/routes/public.py:318-500
· 183 lines · 559ms

read
·
web/backend/routes/public.py:1517-1730
· 214 lines · 629ms

read
·
web/backend/routes/public.py:1730-2000
· 271 lines · 648ms

read
·
web/backend/routes/public.py:2000-2300
· 301 lines · 590ms

read
·
web/backend/routes/public.py:2300-2650
· 351 lines · 614ms

read
·
web/backend/routes/public.py:2650-2900
· 251 lines · 1.0s

read
·
web/backend/routes/public.py:2900-3400
· 501 lines · 608ms

read
·
web/backend/routes/public.py:3400-3750
· 351 lines · 1.1s

read
·
web/backend/routes/public.py:3750-4100
· 351 lines · 584ms

read
·
web/backend/routes/public.py:4100-4550
· 451 lines · 998ms

read
·
web/backend/routes/public.py:4550-5000
· 451 lines · 609ms

read
·
web/backend/routes/public.py:5000-5100
· 101 lines · 1.0s

read
·
web/backend/routes/public.py:5754-5830
· 77 lines · 600ms

read
·
web/backend/routes/public.py:6076-6336
· 261 lines · 721ms
Discover all web backend API endpoints
Read endpoint implementations for request/response structures
Add web backend API section to ENDPOINTS.md

read
·
ENDPOINTS.md:1110-1119
· 10 lines · 715ms

apply patch
·
ENDPOINTS.md
+816
-0
· 95.3s
Discover all web backend API endpoints
Read endpoint implementations for request/response structures
Add web backend API section to ENDPOINTS.md

Added a comprehensive "Web Backend API Endpoints" section to ENDPOINTS.md covering all 39 Flask endpoints from web/backend/routes/public.py, organized into categories:

Configuration & Parameters — reload_params, get_parameters, get_config
User / Profile — get_profile, get_user_status, get_user_followed, get_user_blocked, get_blocked_users, get_preferences, get_similar_users
Username/Address Resolution — get_address_from_username, get_username_from_address, get_users
Posts & Comments — get_posts, get_user_posts, get_comments, get_root_post_id, get_comment_context, get_inbox, get_reports
Topics & Search — get_topics, search_topics, search
Transaction Status — get_tx_status
Network & Supply — get_network_stats, get_supply_history, get_total_supply, get_circulating_supply, get_circulation_stats, get_peers
Stats & Analytics — get_welcome_stats, get_stats (with tab support), stats/event
Media Uploads — get_upload_url, stream_proxy
Referrals — referral/stats
Invite Codes — get_invite_codes, validate_invite_code
Each endpoint includes HTTP method, query params, and full JSON response structures.

Done
·
120ms

Scroll to bottom


Extended thinking

/
claude-opus-4-5
(pro)
Supports images
Git Changes(2)

CHANGES (2)
Stage All

.agi/
A


ENDPOINTS.md
A

dev

2
1
