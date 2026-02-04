# Mirage Node API Endpoints

This document describes all gRPC and REST endpoints exposed by the Mirage blockchain node's `core` module.

All REST endpoints are served via the gRPC-gateway. Base URL depends on node configuration (default `:1317` for REST, `:9090` for gRPC).

---

## Table of Contents

- [Query Endpoints (READ)](#query-endpoints-read)
  - [GetParams](#1-getparams)
  - [GetDifficulty](#2-getdifficulty)
  - [GetProfile](#3-getprofile)
  - [GetProfiles](#4-getprofiles)
  - [GetBridgeStatus](#5-getbridgestatus)
  - [GetBridgeAttestation](#6-getbridgeattestation)
  - [GetBridgeConfig](#7-getbridgeconfig)
  - [GetBridgeMint](#8-getbridgemint)
  - [GetBridgeBurn](#9-getbridgeburn)
- [Transaction Endpoints (WRITE)](#transaction-endpoints-write)
  - [Post](#1-post)
  - [Edit](#2-edit)
  - [Vote](#3-vote)
  - [Delete](#4-delete)
  - [SetUsername](#5-setusername)
  - [FollowModerator](#6-followmoderator)
  - [UnfollowModerator](#7-unfollowmoderator)
  - [FollowUser](#8-followuser)
  - [UnfollowUser](#9-unfollowuser)
  - [FollowTopic](#10-followtopic)
  - [UnfollowTopic](#11-unfollowtopic)
  - [BlockPost](#12-blockpost)
  - [UnblockPost](#13-unblockpost)
  - [BlockUser](#14-blockuser)
  - [UnblockUser](#15-unblockuser)
  - [SendTokens](#16-sendtokens)
  - [UpgradeLevel](#17-upgradelevel)
  - [SetAutoRenewal](#18-setautorenewal)
  - [BridgeBurn](#19-bridgeburn)
  - [BridgeAttestBurned](#20-bridgeattestburned)
  - [BridgeAttestMinted](#21-bridgeattestminted)
  - [UpdateParams](#22-updateparams-governance)
  - [SetLevel](#23-setlevel-governance)
  - [PunishValidator](#24-punishvalidator-governance)
  - [MintTokens](#25-minttokens-governance)
  - [BurnTokens](#26-burntokens-governance)
- [Common Structures](#common-structures)
  - [Envelope Fields](#envelope-fields)
  - [Params](#params)
  - [TierConfig](#tierconfig)
  - [BridgeChainConfig](#bridgechainconfig)

---

## Query Endpoints (READ)

### 1. GetParams

Returns the current module parameters.

| | |
|---|---|
| **gRPC** | `mirage.core.v1.Query/GetParams` |
| **REST** | `GET /mirage/core/v1/params` |
| **CLI** | `miraged query core params` |

**Request:** _None_

**Response: `QueryParamsResponse`**
```json
{
  "params": {
    "min_difficulty": 1,
    "pow_message_window": 100,
    "pow_message_limit": 50,
    "pow_calm_period_definition": 5,
    "pow_calm_sequence_threshold": 3,
    "mint_interval": 10,
    "mint_quantity": 1000000,
    "block_hash_window": 10,
    "pow_difficulty_allowance": 5,
    "max_username_size": 20,
    "max_topic_size": 40,
    "min_username_size": 3,
    "min_topic_size": 1,
    "mint_dynamic_credit_cap": 100,
    "mint_dynamic_split": 0.5,
    "subscription_period": 43200,
    "tiers": [ /* array of TierConfig */ ],
    "subscription_reserve_percent": 80,
    "relay_min_gas_price": 5000,
    "relay_max_gas_fee": 500000000,
    "max_envelope_age": 60,
    "bridge_chains": [ /* array of BridgeChainConfig */ ],
    "bridge_attestation_threshold": 6667
  }
}
```

---

### 2. GetDifficulty

Returns the current Proof-of-Work difficulty state.

| | |
|---|---|
| **gRPC** | `mirage.core.v1.Query/GetDifficulty` |
| **REST** | `GET /mirage/core/v1/difficulty` |
| **CLI** | `miraged query core difficulty` |

**Request:** _None_

**Response: `QueryDifficultyResponse`**
```json
{
  "current_difficulty": 8,
  "previous_difficulty": 7,
  "last_change_height": 12345,
  "pow_message_count": 42,
  "consecutive_low_usage": 0,
  "latest_block_hash": "a1b2c3d4e5f6...",
  "current_height": 12400
}
```

| Field | Type | Description |
|---|---|---|
| `current_difficulty` | `uint64` | Current PoW difficulty (leading zero bits required) |
| `previous_difficulty` | `uint64` | Difficulty before the last change |
| `last_change_height` | `int64` | Block height when difficulty last changed |
| `pow_message_count` | `uint64` | Number of PoW messages in the current window |
| `consecutive_low_usage` | `uint64` | Count of consecutive calm periods |
| `latest_block_hash` | `string` | Most recent committed block hash (hex, lowercase) |
| `current_height` | `int64` | Current block height |

---

### 3. GetProfile

Returns a user profile by address.

| | |
|---|---|
| **gRPC** | `mirage.core.v1.Query/GetProfile` |
| **REST** | `GET /mirage/core/v1/profile/{address}` |
| **CLI** | `miraged query core profile [address]` |

**Request:**
| Field | Type | Description |
|---|---|---|
| `address` | `string` | Mirage bech32 address (e.g. `mirage1...`) |

**Response: `QueryProfileResponse`**
```json
{
  "owner": "mirage1abc...",
  "username": "alice",
  "level": 1,
  "created_at": 12345,
  "subscription_expiry": 99999,
  "auto_renew": true,
  "reserve_funds": 500000,
  "is_moderator": false,
  "biography": "Hello world",
  "avatar": "",
  "banner": "",
  "followed_moderators": ["mirage1mod1..."],
  "followed_users": ["mirage1user1..."],
  "followed_topics": ["general", "crypto"],
  "blocked_users": [],
  "blocked_posts": [],
  "quality_posts": ["a1b2c3..."]
}
```

| Field | Type | Description |
|---|---|---|
| `owner` | `string` | Profile owner address |
| `username` | `string` | Display username |
| `level` | `int32` | User tier level (0=free, 1-3=paid) |
| `created_at` | `int64` | Block height when profile was created |
| `subscription_expiry` | `int64` | Block height / timestamp when subscription expires |
| `auto_renew` | `bool` | Whether subscription auto-renews |
| `reserve_funds` | `uint64` | Gas reserve balance in umirage |
| `is_moderator` | `bool` | Whether user has moderator status |
| `biography` | `string` | User biography text |
| `avatar` | `string` | Avatar reference |
| `banner` | `string` | Banner reference |
| `followed_moderators` | `string[]` | List of followed moderator addresses |
| `followed_users` | `string[]` | List of followed user addresses |
| `followed_topics` | `string[]` | List of followed topic strings |
| `blocked_users` | `string[]` | List of blocked user addresses |
| `blocked_posts` | `string[]` | List of blocked post tx hashes |
| `quality_posts` | `string[]` | List of quality post tx hashes |

---

### 4. GetProfiles

Returns all profiles with pagination.

| | |
|---|---|
| **gRPC** | `mirage.core.v1.Query/GetProfiles` |
| **REST** | `GET /mirage/core/v1/profiles` |
| **CLI** | `miraged query core profiles` |

**Request:**
| Field | Type | Description |
|---|---|---|
| `pagination` | `PageRequest` | Standard Cosmos SDK pagination (optional) |

**Response: `QueryProfilesResponse`**
```json
{
  "profiles": [
    { /* QueryProfileResponse */ }
  ],
  "pagination": {
    "next_key": "base64...",
    "total": "100"
  }
}
```

---

### 5. GetBridgeStatus

Returns the current bridge status including enabled chains and pending attestations.

| | |
|---|---|
| **gRPC** | `mirage.core.v1.Query/GetBridgeStatus` |
| **REST** | `GET /mirage/core/v1/bridge/status` |
| **CLI** | `miraged query core bridge status` |

**Request:** _None_

**Response: `QueryBridgeStatusResponse`**
```json
{
  "enabled_chains": [
    {
      "chain_id": "solana",
      "enabled": true,
      "fee": 1000000
    }
  ],
  "pending_attestations_count": 3,
  "chain_status": [
    {
      "chain_id": "solana",
      "current_sequence": 42
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `enabled_chains` | `BridgeChainConfig[]` | All chains with bridging enabled |
| `pending_attestations_count` | `uint64` | Number of attestations awaiting threshold |
| `chain_status` | `BridgeChainStatus[]` | Per-chain outbound sequence counters |

---

### 6. GetBridgeAttestation

Queries a specific inbound attestation (external chain → Mirage) by source chain and burn ID.

| | |
|---|---|
| **gRPC** | `mirage.core.v1.Query/GetBridgeAttestation` |
| **REST** | `GET /mirage/core/v1/bridge/attestation/{source_chain}/{burn_id}` |
| **CLI** | `miraged query core bridge attestation [source_chain] [burn_id]` |

**Request:**
| Field | Type | Description |
|---|---|---|
| `source_chain` | `string` | External chain ID (e.g. `"solana"`) |
| `burn_id` | `string` | Burn tx hash on the external chain |

**Response: `QueryBridgeAttestationResponse`**
```json
{
  "found": true,
  "source_chain": "solana",
  "burn_id": "abc123txhash...",
  "mirage_recipient": "mirage1abc...",
  "amount": 1000000,
  "attestors": ["miragevaloper1...", "miragevaloper2..."],
  "attested_power": 6700,
  "required_power": 6667,
  "minted": true,
  "created_at": 50000
}
```

| Field | Type | Description |
|---|---|---|
| `found` | `bool` | Whether the attestation exists |
| `source_chain` | `string` | External chain where the burn occurred |
| `burn_id` | `string` | Unique burn identifier |
| `mirage_recipient` | `string` | Destination address on Mirage |
| `amount` | `uint64` | Amount to be minted (umirage) |
| `attestors` | `string[]` | Validator addresses that have attested |
| `attested_power` | `int64` | Total voting power that has attested |
| `required_power` | `int64` | Voting power required to mint |
| `minted` | `bool` | Whether tokens have been minted |
| `created_at` | `int64` | Block height when attestation was created |

---

### 7. GetBridgeConfig

Returns the bridge configuration parameters.

| | |
|---|---|
| **gRPC** | `mirage.core.v1.Query/GetBridgeConfig` |
| **REST** | `GET /mirage/core/v1/bridge/config` |
| **CLI** | `miraged query core bridge config` |

**Request:** _None_

**Response: `QueryBridgeConfigResponse`**
```json
{
  "chains": [
    {
      "chain_id": "solana",
      "enabled": true,
      "fee": 1000000
    }
  ],
  "attestation_threshold": 6667
}
```

| Field | Type | Description |
|---|---|---|
| `chains` | `BridgeChainConfig[]` | All configured bridge chains with their fees |
| `attestation_threshold` | `uint64` | Voting power threshold in basis points (6667 = 66.67%) |

---

### 8. GetBridgeMint

Queries an outbound bridge mint confirmation (Mirage → external chain).

| | |
|---|---|
| **gRPC** | `mirage.core.v1.Query/GetBridgeMint` |
| **REST** | `GET /mirage/core/v1/bridge/mint/{destination_chain}/{burn_id}` |
| **CLI** | `miraged query core bridge mint [destination_chain] [burn_id]` |

**Request:**
| Field | Type | Description |
|---|---|---|
| `destination_chain` | `string` | External chain ID (e.g. `"solana"`) |
| `burn_id` | `string` | Mirage burn sequence number |

**Response: `QueryBridgeMintResponse`**
```json
{
  "minted": true,
  "destination_chain": "solana",
  "destination_tx": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp...",
  "found": true,
  "attestors": ["miragevaloper1...", "miragevaloper2..."],
  "attested_power": 7000,
  "required_power": 6667
}
```

| Field | Type | Description |
|---|---|---|
| `minted` | `bool` | Whether the mint has been confirmed (threshold crossed) |
| `destination_chain` | `string` | External chain where mint occurred |
| `destination_tx` | `string` | Tx signature/hash on the destination chain |
| `found` | `bool` | Whether any attestation record exists |
| `attestors` | `string[]` | Validator addresses that have attested |
| `attested_power` | `int64` | Total voting power that has attested |
| `required_power` | `int64` | Voting power required to confirm |

---

### 9. GetBridgeBurn

Queries an outbound bridge burn record (Mirage → external chain).

| | |
|---|---|
| **gRPC** | `mirage.core.v1.Query/GetBridgeBurn` |
| **REST** | `GET /mirage/core/v1/bridge/burn/{destination_chain}/{burn_id}` |
| **CLI** | `miraged query core bridge burn [destination_chain] [burn_id]` |

**Request:**
| Field | Type | Description |
|---|---|---|
| `destination_chain` | `string` | External chain ID (e.g. `"solana"`) |
| `burn_id` | `string` | Mirage burn sequence number |

**Response: `QueryBridgeBurnResponse`**
```json
{
  "found": true,
  "burn_id": "42",
  "owner": "mirage1abc...",
  "destination_chain": "solana",
  "destination_address": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp...",
  "amount": 2000000,
  "bridge_fee": 1000000,
  "sequence": 42,
  "created_at": 50100
}
```

| Field | Type | Description |
|---|---|---|
| `found` | `bool` | Whether the burn record exists |
| `burn_id` | `string` | Mirage burn sequence number |
| `owner` | `string` | Mirage address that initiated the burn |
| `destination_chain` | `string` | External chain |
| `destination_address` | `string` | Recipient address on destination chain |
| `amount` | `uint64` | Gross amount burned (umirage) |
| `bridge_fee` | `uint64` | Fee deducted from the amount (umirage) |
| `sequence` | `uint64` | Outbound bridge sequence for the chain |
| `created_at` | `int64` | Block height when burn occurred |

---

## Transaction Endpoints (WRITE)

All transaction messages are submitted via the Cosmos SDK transaction broadcast mechanism (gRPC `cosmos.tx.v1beta1.Service/BroadcastTx` or REST `POST /cosmos/tx/v1beta1/txs`).

Most user-facing messages use **envelope fields** for relay signature verification (PoW + meta-signature). Governance-only messages do not use envelopes.

### 1. Post

Creates a new post or comment.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/Post` |
| **Type URL** | `/mirage.core.v1.MsgPost` |

**Payload: `MsgPost`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address (relay node or governance) |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Parent tx hash (64 hex chars) for comments; empty for top-level posts |
| `topic` | `string` | Topic name (lowercase alphanumeric) |
| `title` | `string` | Post title |
| `content` | `string` | Post body content |
| `tag` | `string` | Optional tag |

**Response: `MsgPostResponse`** — _Empty_

**Events Emitted:** `post` with attributes: `owner`, `target`, `topic`, `title`, `content`, `tag`, `txhash`

---

### 2. Edit

Updates an existing post or comment.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/Edit` |
| **Type URL** | `/mirage.core.v1.MsgEdit` |

**Payload: `MsgEdit`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Parent tx hash for comments; empty for posts |
| `topic` | `string` | Topic name |
| `title` | `string` | Updated title |
| `content` | `string` | Updated content |
| `tag` | `string` | Updated tag |
| `override` | `string` | Tx hash of the post/comment being edited (64 hex chars) |

**Response: `MsgEditResponse`** — _Empty_

---

### 3. Vote

Creates an upvote or downvote on a post/comment.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/Vote` |
| **Type URL** | `/mirage.core.v1.MsgVote` |

**Payload: `MsgVote`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Tx hash of the post/comment being voted on (64 hex chars) |
| `direction` | `int32` | Vote direction: `1` = upvote, `-1` = downvote |

**Response: `MsgVoteResponse`** — _Empty_

---

### 4. Delete

Marks a post or comment as deleted (emits event for indexer).

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/Delete` |
| **Type URL** | `/mirage.core.v1.MsgDelete` |

**Payload: `MsgDelete`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Tx hash of the post/comment to delete (64 hex chars) |

**Response: `MsgDeleteResponse`** — _Empty_

---

### 5. SetUsername

Sets or updates a username for the signer's address.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/SetUsername` |
| **Type URL** | `/mirage.core.v1.MsgSetUsername` |

**Payload: `MsgSetUsername`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Target address (owner derived from envelope) |
| `username` | `string` | Desired username (lowercase alphanumeric, min/max length per params) |

**Response: `MsgSetUsernameResponse`** — _Empty_

---

### 6. FollowModerator

Adds a moderator to the signer's followed moderators list (capped deque).

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/FollowModerator` |
| **Type URL** | `/mirage.core.v1.MsgFollowModerator` |

**Payload: `MsgFollowModerator`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Target address (owner) |
| `moderator` | `string` | Moderator address to follow |

**Response: `MsgFollowModeratorResponse`** — _Empty_

---

### 7. UnfollowModerator

Removes a moderator from the signer's followed list.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/UnfollowModerator` |
| **Type URL** | `/mirage.core.v1.MsgUnfollowModerator` |

**Payload:** Same structure as `MsgFollowModerator` — `target` + `moderator`

**Response: `MsgUnfollowModeratorResponse`** — _Empty_

---

### 8. FollowUser

Adds a user to the signer's followed users list (capped deque).

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/FollowUser` |
| **Type URL** | `/mirage.core.v1.MsgFollowUser` |

**Payload: `MsgFollowUser`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Target address (owner) |
| `user` | `string` | User address to follow |

**Response: `MsgFollowUserResponse`** — _Empty_

---

### 9. UnfollowUser

Removes a user from the signer's followed list.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/UnfollowUser` |
| **Type URL** | `/mirage.core.v1.MsgUnfollowUser` |

**Payload:** Same structure as `MsgFollowUser` — `target` + `user`

**Response: `MsgUnfollowUserResponse`** — _Empty_

---

### 10. FollowTopic

Adds a topic to the signer's followed topics list (capped deque).

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/FollowTopic` |
| **Type URL** | `/mirage.core.v1.MsgFollowTopic` |

**Payload: `MsgFollowTopic`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Target address (owner) |
| `topic` | `string` | Topic string to follow |

**Response: `MsgFollowTopicResponse`** — _Empty_

---

### 11. UnfollowTopic

Removes a topic from the signer's followed list.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/UnfollowTopic` |
| **Type URL** | `/mirage.core.v1.MsgUnfollowTopic` |

**Payload:** Same structure as `MsgFollowTopic` — `target` + `topic`

**Response: `MsgUnfollowTopicResponse`** — _Empty_

---

### 12. BlockPost

Blocks a post tx hash (persisted on-chain in signer's blocked list).

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/BlockPost` |
| **Type URL** | `/mirage.core.v1.MsgBlockPost` |

**Payload: `MsgBlockPost`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Tx hash of the post to block (64 hex chars) |

**Response: `MsgBlockPostResponse`** — _Empty_

---

### 13. UnblockPost

Unblocks a previously blocked post.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/UnblockPost` |
| **Type URL** | `/mirage.core.v1.MsgUnblockPost` |

**Payload:** Same structure as `MsgBlockPost` — `target`

**Response: `MsgUnblockPostResponse`** — _Empty_

---

### 14. BlockUser

Blocks a user address (persisted on-chain).

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/BlockUser` |
| **Type URL** | `/mirage.core.v1.MsgBlockUser` |

**Payload: `MsgBlockUser`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Address of the user to block |

**Response: `MsgBlockUserResponse`** — _Empty_

---

### 15. UnblockUser

Unblocks a previously blocked user.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/UnblockUser` |
| **Type URL** | `/mirage.core.v1.MsgUnblockUser` |

**Payload:** Same structure as `MsgBlockUser` — `target`

**Response: `MsgUnblockUserResponse`** — _Empty_

---

### 16. SendTokens

Sends tokens from one address to another.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/SendTokens` |
| **Type URL** | `/mirage.core.v1.MsgSendTokens` |

**Payload: `MsgSendTokens`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `sender` | `string` | Sender address (derived from envelope) |
| `target` | `string` | Recipient address |
| `amount` | `uint64` | Amount to send in umirage |

**Response: `MsgSendTokensResponse`** — _Empty_

---

### 17. UpgradeLevel

Upgrades user's subscription tier (requires token payment, no PoW).

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/UpgradeLevel` |
| **Type URL** | `/mirage.core.v1.MsgUpgradeLevel` |

**Payload: `MsgUpgradeLevel`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `level` | `uint32` | Desired tier level (1-3) |

**Response: `MsgUpgradeLevelResponse`** — _Empty_

---

### 18. SetAutoRenewal

Sets the auto-renew flag for the user's subscription.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/SetAutoRenewal` |
| **Type URL** | `/mirage.core.v1.MsgSetAutoRenewal` |

**Payload: `MsgSetAutoRenewal`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `auto_renew` | `bool` | Whether to enable auto-renewal |

**Response: `MsgSetAutoRenewalResponse`** — _Empty_

---

### 19. BridgeBurn

Burns MIRAGE tokens to bridge them to an external chain (e.g., Solana). Orchestrators pick up the burn event and mint on the destination chain.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/BridgeBurn` |
| **Type URL** | `/mirage.core.v1.MsgBridgeBurn` |
| **CLI** | `miraged tx bridge burn [destination_chain] [destination_address] [amount]` |

**Payload: `MsgBridgeBurn`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Signer address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `destination_chain` | `string` | External chain ID (e.g. `"solana"`) |
| `destination_address` | `string` | Recipient address on destination chain |
| `amount` | `uint64` | Amount to burn in umirage (must be > bridge fee) |

**Response: `MsgBridgeBurnResponse`**
```json
{
  "burn_id": 42
}
```

| Field | Type | Description |
|---|---|---|
| `burn_id` | `uint64` | Sequence number used by orchestrators to attest the mint |

**Events Emitted:** `bridge_burn` with: `burn_id`, `owner`, `destination_chain`, `destination_address`, `amount`, `bridge_fee`, `sequence`

---

### 20. BridgeAttestBurned

Allows validators to attest to a burn on an external chain (inbound bridge). When 2/3+ voting power attests, tokens are minted on Mirage.

> **Note:** Does NOT use envelope fields — signed directly by the validator.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/BridgeAttestBurned` |
| **Type URL** | `/mirage.core.v1.MsgBridgeAttestBurned` |
| **CLI** | `miraged tx bridge attest-burned [source_chain] [burn_id] [mirage_recipient] [amount]` |

**Payload: `MsgBridgeAttestBurned`**
| Field | Type | Description |
|---|---|---|
| `validator` | `string` | Validator operator address submitting attestation |
| `source_chain` | `string` | External chain where burn occurred (e.g. `"solana"`) |
| `burn_id` | `string` | Unique burn identifier on the external chain (tx hash) |
| `mirage_recipient` | `string` | Destination address on Mirage chain |
| `amount` | `uint64` | Amount burned on external chain (umirage equivalent) |

**Response: `MsgBridgeAttestBurnedResponse`**
```json
{
  "confirmed": true,
  "attested_power": 7000,
  "required_power": 6667
}
```

| Field | Type | Description |
|---|---|---|
| `confirmed` | `bool` | Whether threshold was reached and tokens were minted |
| `attested_power` | `int64` | Total attested voting power so far |
| `required_power` | `int64` | Voting power required to mint |

**Events Emitted:**
- `bridge_attest`: `validator`, `source_chain`, `burn_id`, `power`, `attested_power`, `required_power`, `minted`
- `bridge_mint` (on threshold): `source_chain`, `burn_id`, `recipient`, `amount`, `attested_power`, `required_power`

---

### 21. BridgeAttestMinted

Allows validators to attest that a mint was completed on an external chain (outbound bridge). When 2/3+ voting power attests, a `BridgeConfirmed` event is emitted.

> **Note:** Signed by the validator's operator key.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/BridgeAttestMinted` |
| **Type URL** | `/mirage.core.v1.MsgBridgeAttestMinted` |
| **CLI** | `miraged tx bridge minted [burn_id] [destination_chain] [destination_tx]` |

**Payload: `MsgBridgeAttestMinted`**
| Field | Type | Description |
|---|---|---|
| `validator` | `string` | Validator operator address |
| `burn_id` | `string` | Mirage burn sequence number (numeric string) |
| `destination_chain` | `string` | External chain ID (e.g. `"solana"`) |
| `destination_tx` | `string` | Tx signature/hash on the destination chain |
| `mirage_tx_hash` | `string` | Original Mirage burn tx hash (for indexing) |

**Response: `MsgBridgeAttestMintedResponse`**
```json
{
  "confirmed": true,
  "attested_power": 7000,
  "required_power": 6667
}
```

| Field | Type | Description |
|---|---|---|
| `confirmed` | `bool` | Whether threshold was reached and mint is confirmed |
| `attested_power` | `int64` | Total attested voting power so far |
| `required_power` | `int64` | Voting power required to confirm |

**Events Emitted:** `bridge_attest_minted` with: `burn_id`, `destination_chain`, `destination_tx`, `validator`, `power`, `attested_power`, `required_power`, `minted`, `mirage_tx_hash`

---

### 22. UpdateParams (Governance)

Updates the module parameters. Can only be executed via governance proposal.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/UpdateParams` |
| **Type URL** | `/mirage.core.v1.MsgUpdateParams` |

**Payload: `MsgUpdateParams`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Must be the x/gov module account address |
| `params` | `Params` | Complete set of module parameters (see [Params](#params)) |

**Response: `MsgUpdateParamsResponse`** — _Empty_

---

### 23. SetLevel (Governance)

Sets the user level for a specific address. Governance only.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/SetLevel` |
| **Type URL** | `/mirage.core.v1.MsgSetLevel` |

**Payload: `MsgSetLevel`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Must be x/gov module address |
| _envelope fields_ | | See [Envelope Fields](#envelope-fields) |
| `target` | `string` | Address to set level for |
| `level` | `int32` | New user level |

**Response: `MsgSetLevelResponse`** — _Empty_

---

### 24. PunishValidator (Governance)

Slashes, jails, or tombstones a validator. Governance only.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/PunishValidator` |
| **Type URL** | `/mirage.core.v1.MsgPunishValidator` |

**Payload: `MsgPunishValidator`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Must be x/gov module address |
| `valoper` | `string` | Validator operator address to punish |
| `fraction` | `string` | Slash fraction as decimal (e.g. `"0.01"` for 1%) |
| `jail` | `bool` | Whether to jail the validator |
| `tombstone` | `bool` | Whether to permanently tombstone the validator |
| `reason` | `string` | Optional explanation |

**Response: `MsgPunishValidatorResponse`** — _Empty_

---

### 25. MintTokens (Governance)

Mints new tokens to a target address. Governance only.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/MintTokens` |
| **Type URL** | `/mirage.core.v1.MsgMintTokens` |

**Payload: `MsgMintTokens`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Must be x/gov module address |
| `target` | `string` | Recipient address (auto-created if new) |
| `amount` | `uint64` | Amount to mint in umirage |
| `reason` | `string` | Optional reason (recorded in events) |

**Response: `MsgMintTokensResponse`** — _Empty_

---

### 26. BurnTokens (Governance)

Burns tokens from a target address. Governance only.

| | |
|---|---|
| **gRPC Msg** | `mirage.core.v1.Msg/BurnTokens` |
| **Type URL** | `/mirage.core.v1.MsgBurnTokens` |

**Payload: `MsgBurnTokens`**
| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Must be x/gov module address |
| `target` | `string` | Address to burn tokens from |
| `amount` | `uint64` | Amount to burn in umirage |
| `reason` | `string` | Optional reason (recorded in events) |

**Response: `MsgBurnTokensResponse`** — _Empty_

---

## Common Structures

### Envelope Fields

Most user-facing transaction messages include envelope fields for relay-based PoW verification. These are used when transactions are relayed by nodes on behalf of users.

| Field | Type | Description |
|---|---|---|
| `envelope_pubkey` | `bytes` | 33-byte compressed secp256k1 public key of the actual signer |
| `envelope_block_hash` | `bytes` | Recent block hash used in PoW challenge |
| `envelope_difficulty` | `uint64` | PoW difficulty used |
| `envelope_pow` | `uint64` | PoW nonce solution |
| `envelope_timestamp` | `uint64` | Unix timestamp (must be within `max_envelope_age` seconds) |
| `envelope_signature` | `bytes` | secp256k1 signature over the message payload |

---

### Params

Full module parameters object. See [GetParams](#1-getparams) for the response structure.

| Field | Type | Description |
|---|---|---|
| `min_difficulty` | `uint64` | Absolute minimum PoW difficulty |
| `pow_message_window` | `uint64` | Sliding window size in blocks for PoW volume measurement |
| `pow_message_limit` | `uint64` | Threshold to trigger difficulty increase |
| `pow_calm_period_definition` | `uint64` | Max messages to count as a "calm" period |
| `pow_calm_sequence_threshold` | `uint64` | Consecutive calm periods before decreasing difficulty |
| `mint_interval` | `uint64` | Blocks between minting events |
| `mint_quantity` | `uint64` | umirage minted per mint event |
| `block_hash_window` | `uint64` | Number of recent block hashes accepted for PoW |
| `pow_difficulty_allowance` | `uint64` | Blocks after a change where previous difficulty is accepted |
| `max_username_size` | `uint64` | Maximum username length |
| `max_topic_size` | `uint64` | Maximum topic length |
| `min_username_size` | `uint64` | Minimum username length |
| `min_topic_size` | `uint64` | Minimum topic length |
| `mint_dynamic_credit_cap` | `uint64` | Per-interval relay credits per validator |
| `mint_dynamic_split` | `double` | Fraction [0,1] of mint allocated to dynamic pool |
| `subscription_period` | `uint64` | Renewal period in minutes (43200 = 30 days) |
| `tiers` | `TierConfig[]` | Tier configurations (index 0 = free, 1-3 = paid) |
| `subscription_reserve_percent` | `uint64` | % of period fee escrowed as gas reserve (0-100) |
| `relay_min_gas_price` | `uint64` | Min gas price for relay fee (umirage/gas) |
| `relay_max_gas_fee` | `uint64` | Max gas fee per relayed tx (umirage) |
| `max_envelope_age` | `uint64` | Max age in seconds for envelope timestamp |
| `bridge_chains` | `BridgeChainConfig[]` | Supported bridge chain configurations |
| `bridge_attestation_threshold` | `uint64` | Voting power threshold for bridging (basis points) |

---

### TierConfig

Defines the configuration for a membership tier.

| Field | Type | Description |
|---|---|---|
| `period_fee` | `uint64` | Subscription cost per period (umirage) |
| `max_followed_mods` | `uint64` | Max followed moderators |
| `max_followed_users` | `uint64` | Max followed users |
| `max_followed_topics` | `uint64` | Max followed topics |
| `max_blocked_users` | `uint64` | Max blocked users |
| `max_blocked_posts` | `uint64` | Max blocked posts |
| `max_quality_posts` | `uint64` | Max quality posts |
| `max_title_length` | `uint64` | Max post title length |
| `max_content_length` | `uint64` | Max post content length |
| `editing_time_mins` | `uint64` | Time window for editing in minutes |
| `archive_duration_days` | `uint64` | Days before content is archived |
| `vote_weight` | `double` | Vote weight multiplier |
| `award_permissions` | `uint32` | Award permission flags |
| `eligible_for_mod` | `bool` | Whether eligible for moderator status |
| `can_change_name` | `bool` | Whether can change username |
| `can_have_biography` | `bool` | Whether can set biography |
| `can_have_avatar` | `bool` | Whether can set avatar |
| `can_have_banner` | `bool` | Whether can set banner |

---

### BridgeChainConfig

Defines configuration for a bridgeable external chain.

| Field | Type | Description |
|---|---|---|
| `chain_id` | `string` | Unique chain identifier (e.g. `"solana"`) |
| `enabled` | `bool` | Whether bridging to/from this chain is allowed |
| `fee` | `uint64` | Flat bridge fee in umirage (burned on transfer) |

---

## Standard Cosmos SDK Endpoints

In addition to the above custom endpoints, the node also exposes standard Cosmos SDK endpoints at their default paths:

| Category | REST Base Path | Description |
|---|---|---|
| Auth | `/cosmos/auth/v1beta1/` | Account queries |
| Bank | `/cosmos/bank/v1beta1/` | Balance and supply queries |
| Staking | `/cosmos/staking/v1beta1/` | Validator and delegation queries |
| Gov | `/cosmos/gov/v1/` | Governance proposals and votes |
| Distribution | `/cosmos/distribution/v1beta1/` | Rewards and commission |
| Slashing | `/cosmos/slashing/v1beta1/` | Signing info and slashing |
| Tx | `/cosmos/tx/v1beta1/` | Transaction broadcast, queries, simulation |
| Tendermint | `/cosmos/base/tendermint/v1beta1/` | Node info, blocks, validators |

These follow the standard Cosmos SDK API specifications.
