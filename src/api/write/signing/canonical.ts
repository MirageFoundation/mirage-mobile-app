/**
 * Canonical Byte Builders for Mirage Messages
 *
 * Builds canonical bytes for signing according to the Mirage protocol.
 *
 * Format:
 * [prefix][tag2:pubkey][tag3:block_hash][tag4:difficulty][tag6:timestamp][tag7:envelope_nonce][tag100+:payload...]
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
  // Build prefix as UTF-8 bytes + NUL terminator to avoid escape ambiguities
  const head = new TextEncoder().encode(`mirage.core.v1:${msgName}`);
  const nul = new Uint8Array([0]);
  return concatBytes(head, nul);
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
  /** Replay-protection nonce */
  envelopeNonce: bigint;
}

/**
 * Encode common header tags (2, 3, 4, 6, 7)
 * These are included in every message
 */
function encodeHeader(params: BaseParams): Uint8Array {
  return concatBytes(
    encBytes(2, params.pubkey33), // tag 2: pubkey
    encBytes(3, params.lastBlockHashBytes), // tag 3: block_hash
    encU64(4, params.difficulty), // tag 4: difficulty
    encU64(6, params.timestampMs), // tag 6: timestamp
    encU64(7, params.envelopeNonce) // tag 7: envelope_nonce
  );
}

/**
 * Insert PoW tag 5 between tag 4 and tag 6
 * This creates the final signed bytes from base bytes
 */
export function canonSignedWithPow(base: Uint8Array, pow: number | bigint): Uint8Array {
  // Robustly locate tag 6 by parsing TLV fields after the NUL-terminated prefix
  let i = 0;
  // Skip until NUL terminator of the prefix
  while (i < base.length && base[i] !== 0) i++;
  if (i < base.length && base[i] === 0) i++;

  // Helper to read uvarint and return new index
  function readUvarint(buf: Uint8Array, idx: number): [bigint, number] {
    let n = 0n;
    let shift = 0n;
    while (true) {
      if (idx >= buf.length) throw new Error("uvarint overflow");
      const b = BigInt(buf[idx++]);
      n |= (b & 0x7fn) << shift;
      if ((b & 0x80n) === 0n) break;
      shift += 7n;
    }
    return [n, idx];
  }

  // Expect tag 2 (pubkey bytes)
  if (base[i] !== 2) throw new Error("expected tag 2 after prefix");
  i++;
  let len2: bigint; [len2, i] = readUvarint(base, i);
  i += Number(len2);

  // Expect tag 3 (block hash bytes)
  if (base[i] !== 3) throw new Error("expected tag 3 after pubkey");
  i++;
  let len3: bigint; [len3, i] = readUvarint(base, i);
  i += Number(len3);

  // Expect tag 4 (difficulty uvarint)
  if (base[i] !== 4) throw new Error("expected tag 4 after block hash");
  i++;
  // Skip difficulty value
  [, i] = readUvarint(base, i);
  const tag4End = i;

  // The next field should be tag 6 (timestamp). If not, scan ahead defensively.
  let tag6Pos = -1;
  if (tag4End < base.length && base[tag4End] === 6) tag6Pos = tag4End;
  else {
    for (let j = tag4End; j < base.length; j++) {
      if (base[j] === 6) { tag6Pos = j; break; }
    }
  }

  if (tag6Pos < 0) {
    // If we somehow cannot locate tag 6, append pow at the end to avoid breaking
    return concatBytes(base, encU64(5, pow));
  }

  return concatBytes(base.slice(0, tag6Pos), encU64(5, pow), base.slice(tag6Pos));
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
  community: string;
  /** Post title */
  title: string;
  /** Post content */
  content: string;
  /** Content tag: "", "sensitive", "adult", "gore", "violence", "death" */
  tag: string;
  /** Media URLs */
  media?: string[];
}

/**
 * Build canonical base bytes for MsgPost
 * Tags: 100 (target), 101 (community), 102 (title), 103 (content), 104 (tag), 105 (media[]), 106 (protocol_version=1)
 */
export function canonBasePost(params: PostParams): Uint8Array {
  const mediaFields = (params.media ?? []).map((url) => encString(105, url));
  return concatBytes(
    prefix("MsgPost"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.community),
    encString(102, params.title),
    encString(103, params.content),
    encString(104, params.tag),
    ...mediaFields,
    encU64(106, 1)
  );
}

// --- MsgEdit ---

export interface EditParams extends BaseParams {
  /** "" for post edit, parent txhash for comment edit */
  target: string;
  /** Required for posts, "" for comments */
  community: string;
  /** New title */
  title: string;
  /** New content */
  content: string;
  /** Content tag */
  tag: string;
  /** txhash being edited */
  override: string;
  /** Media URLs */
  media?: string[];
}

/**
 * Build canonical base bytes for MsgEdit
 * Tags: 100 (target), 101 (community), 102 (title), 103 (content), 104 (tag), 105 (override), 106 (media[])
 */
export function canonBaseEdit(params: EditParams): Uint8Array {
  const base = concatBytes(
    prefix("MsgEdit"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.community),
    encString(102, params.title),
    encString(103, params.content),
    encString(104, params.tag),
    encString(105, params.override)
  );
  if (!params.media || params.media.length === 0) return base;
  const mediaFields = params.media.map((url) => encString(106, url));
  return concatBytes(base, ...mediaFields);
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

// --- MsgJoinCommunity / MsgLeaveCommunity ---

export interface JoinCommunityParams extends BaseParams {
  community: string;
  mode?: number;
  pinnedTeamId?: number;
}

export function canonBaseJoinCommunity(params: JoinCommunityParams): Uint8Array {
  return concatBytes(
    prefix("MsgJoinCommunity"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.mode ?? 0),
    encU64(102, params.pinnedTeamId ?? 0)
  );
}

export interface LeaveCommunityParams extends BaseParams {
  community: string;
}

export function canonBaseLeaveCommunity(params: LeaveCommunityParams): Uint8Array {
  return concatBytes(
    prefix("MsgLeaveCommunity"),
    encodeHeader(params),
    encString(100, params.community)
  );
}

// --- MsgBlockCommunity / MsgUnblockCommunity ---

export interface BlockCommunityParams extends BaseParams {
  /** Signing user's lowercased Mirage address */
  target: string;
  community: string;
}

export function canonBaseBlockCommunity(params: BlockCommunityParams): Uint8Array {
  return concatBytes(
    prefix("MsgBlockCommunity"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.community)
  );
}

export function canonBaseUnblockCommunity(params: BlockCommunityParams): Uint8Array {
  return concatBytes(
    prefix("MsgUnblockCommunity"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.community)
  );
}

// --- MsgSetCurationPreference ---

export type SetCurationPreferenceParams = JoinCommunityParams;

export function canonBaseSetCommunityPreference(
  params: SetCurationPreferenceParams,
): Uint8Array {
  return concatBytes(
    prefix("MsgSetCurationPreference"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.mode ?? 0),
    encU64(102, params.pinnedTeamId ?? 0)
  );
}

export interface CreateCurationTeamParams extends BaseParams {
  community: string;
  name: string;
  description: string;
}

export function canonBaseCreateCurationTeam(params: CreateCurationTeamParams): Uint8Array {
  return concatBytes(
    prefix("MsgCreateCurationTeam"),
    encodeHeader(params),
    encString(100, params.community),
    encString(101, params.name),
    encString(102, params.description)
  );
}

export interface SetCurationTeamProfileParams extends BaseParams {
  community: string;
  team_id: number;
  name: string;
  description: string;
}

export function canonBaseSetCurationTeamProfile(
  params: SetCurationTeamProfileParams,
): Uint8Array {
  return concatBytes(
    prefix("MsgSetCurationTeamProfile"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.name),
    encString(103, params.description)
  );
}

export interface InviteCuratorParams extends BaseParams {
  community: string;
  team_id: number;
  target: string;
}

export function canonBaseInviteCurator(params: InviteCuratorParams): Uint8Array {
  return concatBytes(
    prefix("MsgInviteCurator"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.target)
  );
}

export function canonBaseRevokeCuratorInvite(params: InviteCuratorParams): Uint8Array {
  return concatBytes(
    prefix("MsgRevokeCuratorInvite"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.target)
  );
}

export interface CurationTeamIdParams extends BaseParams {
  community: string;
  team_id: number;
}

export function canonBaseAcceptCuratorInvite(params: CurationTeamIdParams): Uint8Array {
  return concatBytes(
    prefix("MsgAcceptCuratorInvite"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id)
  );
}

export function canonBaseDeclineCuratorInvite(params: CurationTeamIdParams): Uint8Array {
  return concatBytes(
    prefix("MsgDeclineCuratorInvite"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id)
  );
}

export function canonBaseLeaveCurationTeam(params: CurationTeamIdParams): Uint8Array {
  return concatBytes(
    prefix("MsgLeaveCurationTeam"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id)
  );
}

export function canonBaseRemoveCurator(params: InviteCuratorParams): Uint8Array {
  return concatBytes(
    prefix("MsgRemoveCurator"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.target)
  );
}

export interface TransferCurationTeamParams extends BaseParams {
  community: string;
  team_id: number;
  new_owner: string;
}

export function canonBaseTransferCurationTeam(
  params: TransferCurationTeamParams,
): Uint8Array {
  return concatBytes(
    prefix("MsgTransferCurationTeam"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.new_owner)
  );
}

export function canonBaseDeleteCurationTeam(params: CurationTeamIdParams): Uint8Array {
  return concatBytes(
    prefix("MsgDeleteCurationTeam"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id)
  );
}

export interface SetCurationPostHiddenParams extends BaseParams {
  community: string;
  team_id: number;
  target: string;
  hidden: boolean;
}

export function canonBaseSetCurationPostHidden(
  params: SetCurationPostHiddenParams,
): Uint8Array {
  return concatBytes(
    prefix("MsgSetCurationPostHidden"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.target),
    encU64(103, params.hidden ? 1 : 0)
  );
}

export function canonBaseSetCurationUserHidden(
  params: SetCurationPostHiddenParams,
): Uint8Array {
  return concatBytes(
    prefix("MsgSetCurationUserHidden"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.target),
    encU64(103, params.hidden ? 1 : 0)
  );
}

export interface SetCurationThreadLockedParams extends BaseParams {
  community: string;
  team_id: number;
  root_hash: string;
  locked: boolean;
}

export function canonBaseSetCurationThreadLocked(
  params: SetCurationThreadLockedParams,
): Uint8Array {
  return concatBytes(
    prefix("MsgSetCurationThreadLocked"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.root_hash),
    encU64(103, params.locked ? 1 : 0)
  );
}

export interface SetCurationSubscriberOnlyParams extends BaseParams {
  community: string;
  team_id: number;
  enabled: boolean;
}

export function canonBaseSetCurationSubscriberOnly(
  params: SetCurationSubscriberOnlyParams,
): Uint8Array {
  return concatBytes(
    prefix("MsgSetCurationSubscriberOnly"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encU64(102, params.enabled ? 1 : 0)
  );
}

export interface SetCurationTagParams extends BaseParams {
  community: string;
  team_id: number;
  tag: string;
}

export function canonBaseSetCurationTag(params: SetCurationTagParams): Uint8Array {
  return concatBytes(
    prefix("MsgSetCurationTag"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.tag)
  );
}

export interface SetCurationPostTagParams extends BaseParams {
  community: string;
  team_id: number;
  target: string;
  tag: string;
  clear: boolean;
}

export function canonBaseSetCurationPostTag(params: SetCurationPostTagParams): Uint8Array {
  return concatBytes(
    prefix("MsgSetCurationPostTag"),
    encodeHeader(params),
    encString(100, params.community),
    encU64(101, params.team_id),
    encString(102, params.target),
    encString(103, params.tag),
    encU64(104, params.clear ? 1 : 0)
  );
}

// --- MsgClaimCreatorRewards ---

export interface ClaimCreatorRewardsParams extends BaseParams {
  /** Deduped ascending positive epoch ids. Repeated tag 100; no target. */
  epoch_ids: number[];
}

/**
 * Build canonical base bytes for MsgClaimCreatorRewards.
 * Payload: repeated epoch_ids at tag 100 after the base envelope. No target.
 */
export function canonBaseClaimCreatorRewards(params: ClaimCreatorRewardsParams): Uint8Array {
  const epochFields = params.epoch_ids.map((epochId) => encU64(100, epochId));
  return concatBytes(
    prefix("MsgClaimCreatorRewards"),
    encodeHeader(params),
    ...epochFields,
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

// --- MsgSubscribe (self-subscribe or gift, no PoW) ---

export interface SubscribeParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  timestampMs: number;
  envelopeNonce: bigint;
  /** Purchasable level is 1 (Subscriber) */
  level: number;
  /** Gift recipient; omit or empty for self-subscribe */
  target?: string;
  /** Explicit period count at tag 102 */
  periodCount?: number;
}

/**
 * Build canonical base bytes for MsgSubscribe.
 * Tags: 100 (level), optional 101 (target), 102 (periodCount when nonzero).
 * NOTE: difficulty is always 0 for paid subscription operations.
 */
export function canonBaseSubscribe(params: SubscribeParams): Uint8Array {
  const baseParams: BaseParams = {
    pubkey33: params.pubkey33,
    lastBlockHashBytes: params.lastBlockHashBytes,
    difficulty: 0, // Always 0 for paid operations
    timestampMs: params.timestampMs,
    envelopeNonce: params.envelopeNonce,
  };

  const fields: Uint8Array[] = [
    prefix("MsgSubscribe"),
    encodeHeader(baseParams),
    encU64(100, params.level),
  ];
  if (params.target) {
    fields.push(encString(101, params.target));
  }
  if (params.periodCount) {
    fields.push(encU64(102, params.periodCount));
  }
  return concatBytes(...fields);
}

export type UpgradeLevelParams = SubscribeParams;
export const canonBaseUpgradeLevel = canonBaseSubscribe;

// --- MsgSetAutoRenewal (No PoW) ---

export interface SetAutoRenewalParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  timestampMs: number;
  envelopeNonce: bigint;
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
    envelopeNonce: params.envelopeNonce,
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

// --- MsgDeleteUser (Account Deletion) ---

export interface DeleteUserParams extends BaseParams {
  target: string;
}

export function canonBaseDeleteUser(params: DeleteUserParams): Uint8Array {
  return concatBytes(
    prefix("MsgDeleteUser"),
    encodeHeader(params),
    encString(100, params.target)
  );
}

// --- MsgAward ---

export interface AwardParams extends BaseParams {
  target: string;
  award_type: string;
}

export function canonBaseAward(params: AwardParams): Uint8Array {
  return concatBytes(
    prefix("MsgAward"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.award_type)
  );
}

// --- MsgSetBiography ---

export interface SetBiographyParams extends BaseParams {
  target: string;
  biography: string;
}

export function canonBaseSetBiography(params: SetBiographyParams): Uint8Array {
  return concatBytes(
    prefix("MsgSetBiography"),
    encodeHeader(params),
    encString(100, params.target),
    encString(101, params.biography)
  );
}

export interface GiftSubscriptionParams extends SubscribeParams {
  target: string;
  periodCount: number;
}

export function canonBaseGiftSubscription(params: GiftSubscriptionParams): Uint8Array {
  return canonBaseSubscribe(params);
}
