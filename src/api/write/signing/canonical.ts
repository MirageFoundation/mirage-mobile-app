/**
 * Canonical Byte Builders for Mirage Messages
 *
 * Builds canonical bytes for signing according to the Mirage protocol.
 *
 * Format:
 * [prefix][tag2:pubkey][tag3:block_hash][tag4:difficulty][tag6:timestamp][tag100+:payload...]
 *
 * - Tag 1 (authority) is NOT included
 * - Tag 5 (pow) is only in signed bytes, not base bytes
 * - Tag 10 (signature) is NOT included
 */

import { concatBytes } from "@/src/wallet/crypto";

// ============================================
// Core Encoding Utilities
// ============================================

/**
 * Encode a number as unsigned varint (protobuf-style)
 */
export function uvarint(n: number | bigint): Uint8Array {
  const result: number[] = [];
  let value = typeof n === "bigint" ? n : BigInt(n);

  // Handle 0 specially
  if (value === 0n) {
    return new Uint8Array([0]);
  }

  while (value > 0n) {
    let byte = Number(value & 0x7fn);
    value >>= 7n;
    if (value > 0n) {
      byte |= 0x80;
    }
    result.push(byte);
  }

  return new Uint8Array(result);
}

/**
 * Encode tag + bytes (for bytes/string fields)
 * Format: tag_byte + uvarint(length) + raw_bytes
 */
export function encBytes(tag: number, data: Uint8Array): Uint8Array {
  const tagByte = new Uint8Array([tag]);
  const length = uvarint(data.length);
  return concatBytes(tagByte, length, data);
}

/**
 * Encode tag + string
 */
export function encString(tag: number, str: string): Uint8Array {
  const data = new TextEncoder().encode(str);
  return encBytes(tag, data);
}

/**
 * Encode tag + uvarint value (for uint64/int32/bool fields)
 * Format: tag_byte + uvarint(value)
 */
export function encU64(tag: number, value: number | bigint): Uint8Array {
  const tagByte = new Uint8Array([tag]);
  const encoded = uvarint(value);
  return concatBytes(tagByte, encoded);
}

/**
 * Create message prefix
 * Format: "mirage.core.v1:{msgName}\x00"
 */
export function prefix(msgName: string): Uint8Array {
  const str = `mirage.core.v1:${msgName}\x00`;
  return new TextEncoder().encode(str);
}

// ============================================
// Common Base Parameters
// ============================================

export interface BaseParams {
  /** 33-byte compressed public key */
  pubkey33: Uint8Array;
  /** Block hash as bytes */
  lastBlockHashBytes: Uint8Array;
  /** PoW difficulty */
  difficulty: number;
  /** Timestamp in milliseconds */
  timestampMs: number;
}

/**
 * Encode common header tags (2, 3, 4, 6)
 * These are included in every message
 */
function encodeHeader(params: BaseParams): Uint8Array {
  return concatBytes(
    encBytes(2, params.pubkey33), // tag 2: pubkey
    encBytes(3, params.lastBlockHashBytes), // tag 3: block_hash
    encU64(4, params.difficulty), // tag 4: difficulty
    encU64(6, params.timestampMs) // tag 6: timestamp
  );
}

/**
 * Insert PoW tag 5 between tag 4 and tag 6
 * This creates the final signed bytes from base bytes
 */
export function canonSignedWithPow(base: Uint8Array, pow: number | bigint): Uint8Array {
  // Find position after tag 4 (before tag 6)
  // We need to find tag 6 in the base bytes and insert pow before it

  // Search for tag 6 byte followed by a valid uvarint (timestamp)
  let insertPos = -1;
  for (let i = 0; i < base.length - 1; i++) {
    if (base[i] === 6) {
      // Check if this looks like tag 6 (timestamp should be large number)
      const nextByte = base[i + 1];
      // Timestamp uvarint first byte will have high bit set (value > 127)
      if (nextByte >= 0x80) {
        insertPos = i;
        break;
      }
    }
  }

  if (insertPos === -1) {
    throw new Error("Could not find tag 6 (timestamp) in base bytes");
  }

  const before = base.slice(0, insertPos);
  const after = base.slice(insertPos);
  const powTag = encU64(5, pow);

  return concatBytes(before, powTag, after);
}

// ============================================
// Message-Specific Canonical Builders
// ============================================

// --- MsgSetUsername ---

export interface SetUsernameParams extends BaseParams {
  /** Your mirage1... address */
  target: string;
  /** Desired username */
  username: string;
}

/**
 * Build canonical base bytes for MsgSetUsername
 * Tags: 100 (target), 101 (username)
 */
export function canonBaseSetUsername(params: SetUsernameParams): Uint8Array {
  return concatBytes(
    prefix("MsgSetUsername"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.username)
  );
}

// --- MsgPost (Post or Comment) ---

export interface PostParams extends BaseParams {
  /** "" for post, parent txhash for comment */
  target: string;
  /** Required for post, "" for comment */
  topic: string;
  /** Post title */
  title: string;
  /** Post content */
  content: string;
  /** Content tag: "", "sensitive", "porn", "gore", "violence", "death" */
  tag: string;
}

/**
 * Build canonical base bytes for MsgPost
 * Tags: 100 (target), 101 (topic), 102 (title), 103 (content), 104 (tag)
 */
export function canonBasePost(params: PostParams): Uint8Array {
  return concatBytes(
    prefix("MsgPost"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.topic),
    encString(102, params.title),
    encString(103, params.content),
    encString(104, params.tag)
  );
}

// --- MsgEdit ---

export interface EditParams extends BaseParams {
  /** "" for post edit, parent txhash for comment edit */
  target: string;
  /** Required for posts, "" for comments */
  topic: string;
  /** New title */
  title: string;
  /** New content */
  content: string;
  /** Content tag */
  tag: string;
  /** txhash being edited */
  override: string;
}

/**
 * Build canonical base bytes for MsgEdit
 * Tags: 100 (target), 101 (topic), 102 (title), 103 (content), 104 (tag), 105 (override)
 */
export function canonBaseEdit(params: EditParams): Uint8Array {
  return concatBytes(
    prefix("MsgEdit"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.topic),
    encString(102, params.title),
    encString(103, params.content),
    encString(104, params.tag),
    encString(105, params.override)
  );
}

// --- MsgVote ---

export interface VoteParams extends BaseParams {
  /** txhash to vote on */
  target: string;
  /** Vote direction: 1, 0, or -1 */
  direction: number;
}

/**
 * Build canonical base bytes for MsgVote
 * Tags: 100 (target), 101 (direction as uint32)
 *
 * CRITICAL: Direction -1 must be encoded as uint32 (4294967295)
 */
export function canonBaseVote(params: VoteParams): Uint8Array {
  // Direction must be encoded as uint32
  // -1 in int32 becomes 4294967295 in uint32
  const u32Direction =
    params.direction < 0 ? (params.direction >>> 0) : params.direction;

  return concatBytes(
    prefix("MsgVote"),
    encodeHeader(params),
    encString(100, params.target),
    encU64(101, u32Direction)
  );
}

// --- MsgDelete ---

export interface DeleteParams extends BaseParams {
  /** txhash to delete */
  target: string;
}

/**
 * Build canonical base bytes for MsgDelete
 * Tags: 100 (target)
 */
export function canonBaseDelete(params: DeleteParams): Uint8Array {
  return concatBytes(
    prefix("MsgDelete"),
    encodeHeader(params),
    encString(100, params.target)
  );
}

// --- MsgFollowModerator / MsgUnfollowModerator ---

export interface FollowModeratorParams extends BaseParams {
  /** Your address */
  target: string;
  /** Moderator address to follow/unfollow */
  moderator: string;
}

export function canonBaseFollowModerator(params: FollowModeratorParams): Uint8Array {
  return concatBytes(
    prefix("MsgFollowModerator"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.moderator)
  );
}

export function canonBaseUnfollowModerator(params: FollowModeratorParams): Uint8Array {
  return concatBytes(
    prefix("MsgUnfollowModerator"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.moderator)
  );
}

// --- MsgFollowUser / MsgUnfollowUser ---

export interface FollowUserParams extends BaseParams {
  /** Your address */
  target: string;
  /** User address to follow/unfollow */
  user: string;
}

export function canonBaseFollowUser(params: FollowUserParams): Uint8Array {
  return concatBytes(
    prefix("MsgFollowUser"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.user)
  );
}

export function canonBaseUnfollowUser(params: FollowUserParams): Uint8Array {
  return concatBytes(
    prefix("MsgUnfollowUser"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.user)
  );
}

// --- MsgFollowTopic / MsgUnfollowTopic ---

export interface FollowTopicParams extends BaseParams {
  /** Your address */
  target: string;
  /** Topic name (lowercase) */
  topic: string;
}

export function canonBaseFollowTopic(params: FollowTopicParams): Uint8Array {
  return concatBytes(
    prefix("MsgFollowTopic"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.topic)
  );
}

export function canonBaseUnfollowTopic(params: FollowTopicParams): Uint8Array {
  return concatBytes(
    prefix("MsgUnfollowTopic"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.topic)
  );
}

// --- MsgBlockPost / MsgUnblockPost ---

export interface BlockPostParams extends BaseParams {
  /** txhash to block/unblock */
  target: string;
}

export function canonBaseBlockPost(params: BlockPostParams): Uint8Array {
  return concatBytes(
    prefix("MsgBlockPost"),
    encodeHeader(params),
    encString(100, params.target)
  );
}

export function canonBaseUnblockPost(params: BlockPostParams): Uint8Array {
  return concatBytes(
    prefix("MsgUnblockPost"),
    encodeHeader(params),
    encString(100, params.target)
  );
}

// --- MsgBlockUser / MsgUnblockUser ---

export interface BlockUserParams extends BaseParams {
  /** User address to block/unblock */
  target: string;
}

export function canonBaseBlockUser(params: BlockUserParams): Uint8Array {
  return concatBytes(
    prefix("MsgBlockUser"),
    encodeHeader(params),
    encString(100, params.target)
  );
}

export function canonBaseUnblockUser(params: BlockUserParams): Uint8Array {
  return concatBytes(
    prefix("MsgUnblockUser"),
    encodeHeader(params),
    encString(100, params.target)
  );
}

// --- MsgSendTokens ---

export interface SendTokensParams extends BaseParams {
  /** Your address */
  sender: string;
  /** Recipient address */
  target: string;
  /** Amount in umirage (integer) */
  amount: number;
}

export function canonBaseSendTokens(params: SendTokensParams): Uint8Array {
  return concatBytes(
    prefix("MsgSendTokens"),
    encodeHeader(params),
    encString(100, params.sender),
    encString(101, params.target),
    encU64(102, params.amount)
  );
}

// --- MsgUpgradeLevel (No PoW) ---

export interface UpgradeLevelParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  timestampMs: number;
  /** Target level: 1, 2, or 3 */
  level: number;
}

/**
 * Build canonical base bytes for MsgUpgradeLevel
 * NOTE: difficulty is always 0 for upgrade
 */
export function canonBaseUpgradeLevel(params: UpgradeLevelParams): Uint8Array {
  const baseParams: BaseParams = {
    pubkey33: params.pubkey33,
    lastBlockHashBytes: params.lastBlockHashBytes,
    difficulty: 0, // Always 0 for paid operations
    timestampMs: params.timestampMs,
  };

  return concatBytes(
    prefix("MsgUpgradeLevel"),
    encodeHeader(baseParams),
    encU64(100, params.level)
  );
}

// --- MsgSetAutoRenewal (No PoW) ---

export interface SetAutoRenewalParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  timestampMs: number;
  /** Auto renew flag */
  autoRenew: boolean;
}

/**
 * Build canonical base bytes for MsgSetAutoRenewal
 * NOTE: difficulty is always 0 for auto renewal
 */
export function canonBaseSetAutoRenewal(params: SetAutoRenewalParams): Uint8Array {
  const baseParams: BaseParams = {
    pubkey33: params.pubkey33,
    lastBlockHashBytes: params.lastBlockHashBytes,
    difficulty: 0, // Always 0 for paid operations
    timestampMs: params.timestampMs,
  };

  return concatBytes(
    prefix("MsgSetAutoRenewal"),
    encodeHeader(baseParams),
    encU64(100, params.autoRenew ? 1 : 0)
  );
}

// --- Report (DB-backed, still needs PoW) ---

export interface ReportParams extends BaseParams {
  /** txhash to report */
  target: string;
  /** Reason for report (max 200 chars) */
  reason: string;
}

export function canonBaseReport(params: ReportParams): Uint8Array {
  return concatBytes(
    prefix("MsgReport"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.reason)
  );
}
