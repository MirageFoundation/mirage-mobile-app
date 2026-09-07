import {
  CREATOR_EARNINGS_LIMIT_DEFAULT,
  CREATOR_EARNINGS_LIMIT_MAX,
  CREATOR_EARNINGS_LIMIT_MIN,
  CREATOR_EARNINGS_MAX_PAGES,
  type CreatorEarningItem,
  type CreatorEarningTarget,
  type CreatorEarningTargetsRequestInput,
  type CreatorEarningTargetsResponse,
  type CreatorEarningsRequestInput,
  type CreatorEarningsResponse,
  type CreatorEarningsSchedule,
  type CreatorEarningsSort,
  type NormalizedCreatorEarningTargetsRequest,
  type NormalizedCreatorEarningsRequest,
} from "./types";

export class CreatorEarningsContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreatorEarningsContractError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseBooleanString(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (value == null) return fallback;
  throw new CreatorEarningsContractError("invalid_input");
}

function parseLimit(value: unknown): number {
  if (value == null || value === "") return CREATOR_EARNINGS_LIMIT_DEFAULT;
  const limit = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(limit) || limit < CREATOR_EARNINGS_LIMIT_MIN || limit > CREATOR_EARNINGS_LIMIT_MAX) {
    throw new CreatorEarningsContractError("invalid_creator_limit");
  }
  return limit;
}

function parseOptionalUnix(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new CreatorEarningsContractError("invalid creator earnings unix timestamp");
  }
  return parsed;
}

function parseOptionalHeight(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new CreatorEarningsContractError("invalid claimed_height");
  }
  return parsed;
}

function parseDecimalString(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) {
    throw new CreatorEarningsContractError(`${field} must be a decimal string`);
  }
  return value;
}

function parseNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new CreatorEarningsContractError("expected nullable string");
  }
  return value;
}

function parseOptionalCursor(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value).trim().toLowerCase() || null;
}

export function creatorEarningsQueryIdentity(params: {
  claimable_only?: boolean | string | null;
  sort?: string | null;
  limit?: number | null;
  cursor?: string | null;
}): {
  claimable_only: boolean;
  sort: CreatorEarningsSort;
  limit: number;
  cursor: string | null;
} {
  const claimableOnly = params.claimable_only === true || params.claimable_only === "true";
  const sortRaw = typeof params.sort === "string" ? params.sort.trim().toLowerCase() : "";
  const sort: CreatorEarningsSort =
    sortRaw === "claim_deadline_asc" || sortRaw === "epoch_desc"
      ? sortRaw
      : claimableOnly
        ? "claim_deadline_asc"
        : "epoch_desc";
  return {
    claimable_only: claimableOnly,
    sort,
    limit: Number.isSafeInteger(params.limit) ? (params.limit as number) : CREATOR_EARNINGS_LIMIT_DEFAULT,
    cursor: params.cursor ? String(params.cursor).trim().toLowerCase() : null,
  };
}

export function defaultCreatorEarningsSort(claimableOnly: boolean): CreatorEarningsSort {
  return claimableOnly ? "claim_deadline_asc" : "epoch_desc";
}

export function normalizeCreatorEarningsRequest(
  input: CreatorEarningsRequestInput,
): NormalizedCreatorEarningsRequest {
  const creator = String(input.creator ?? "").trim().toLowerCase();
  if (!creator) throw new CreatorEarningsContractError("Creator address is required");

  const claimableOnly = parseBooleanString(input.claimable_only, false);
  const defaultSort = defaultCreatorEarningsSort(claimableOnly);
  const sortRaw = input.sort == null || input.sort === ""
    ? defaultSort
    : String(input.sort).trim().toLowerCase();

  if (sortRaw === "oldest" || sortRaw === "newest") {
    throw new CreatorEarningsContractError("invalid_input");
  }
  if (sortRaw !== "claim_deadline_asc" && sortRaw !== "epoch_desc") {
    throw new CreatorEarningsContractError("invalid_input");
  }
  if (claimableOnly && sortRaw !== "claim_deadline_asc") {
    throw new CreatorEarningsContractError("invalid_input");
  }
  if (!claimableOnly && sortRaw !== "epoch_desc") {
    throw new CreatorEarningsContractError("invalid_input");
  }

  return {
    creator,
    claimable_only: claimableOnly,
    sort: sortRaw,
    limit: parseLimit(input.limit),
    cursor: parseOptionalCursor(input.cursor),
  };
}

export function toCreatorEarningsQueryParams(
  request: NormalizedCreatorEarningsRequest,
): {
  creator: string;
  limit: number;
  claimable_only: "true" | "false";
  sort: CreatorEarningsSort;
  cursor?: string;
} {
  return {
    creator: request.creator,
    limit: request.limit,
    claimable_only: request.claimable_only ? "true" : "false",
    sort: request.sort,
    ...(request.cursor ? { cursor: request.cursor } : {}),
  };
}

export function normalizeCreatorEarningTargetsRequest(
  input: CreatorEarningTargetsRequestInput,
): NormalizedCreatorEarningTargetsRequest | null {
  const creator = String(input.creator ?? "").trim().toLowerCase();
  if (!creator) throw new CreatorEarningsContractError("Creator address is required");
  if (input.epoch_id == null || input.epoch_id === "") return null;
  const epochId = typeof input.epoch_id === "number" ? input.epoch_id : Number(input.epoch_id);
  if (!Number.isSafeInteger(epochId) || epochId < 0) return null;
  return {
    creator,
    epoch_id: epochId,
    limit: parseLimit(input.limit),
    cursor: parseOptionalCursor(input.cursor),
  };
}

export function parseCreatorEarningTarget(value: unknown): CreatorEarningTarget {
  if (!isRecord(value) || typeof value.txhash !== "string" || !value.txhash) {
    throw new CreatorEarningsContractError("Creator earnings post breakdown must carry a txhash and amount");
  }
  return {
    txhash: value.txhash,
    amount: parseDecimalString(value.amount, "amount"),
    upvote_units: isNonNegativeSafeInteger(Number(value.upvote_units)) ? Number(value.upvote_units) : 0,
    direct_reply_units: isNonNegativeSafeInteger(Number(value.direct_reply_units))
      ? Number(value.direct_reply_units)
      : 0,
    title: parseNullableString(value.title ?? null),
    excerpt: parseNullableString(value.excerpt ?? null),
    community: parseNullableString(value.community ?? null),
    is_comment: value.is_comment === true,
    deleted: value.deleted === true,
  };
}

export function parseCreatorEarningItem(value: unknown): CreatorEarningItem {
  if (!isRecord(value)) throw new CreatorEarningsContractError("Invalid creator earnings epoch");
  const epochId = Number(value.epoch_id);
  if (!Number.isSafeInteger(epochId)) {
    throw new CreatorEarningsContractError("Invalid creator earnings epoch");
  }
  if (!Array.isArray(value.posts)) {
    throw new CreatorEarningsContractError("Creator earnings posts breakdown is required");
  }
  return {
    epoch_id: epochId,
    earned: parseDecimalString(value.earned, "earned"),
    claimed: parseDecimalString(value.claimed, "claimed"),
    epoch_start_unix: parseOptionalUnix(value.epoch_start_unix ?? null),
    epoch_end_unix: parseOptionalUnix(value.epoch_end_unix ?? null),
    claim_deadline_unix: parseOptionalUnix(value.claim_deadline_unix ?? null),
    claimed_height: parseOptionalHeight(value.claimed_height ?? null),
    posts: value.posts.map(parseCreatorEarningTarget),
    posts_next_cursor: parseOptionalCursor(value.posts_next_cursor ?? null),
    posts_has_more: value.posts_has_more === true,
  };
}

function parseOptionalScheduleInteger(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new CreatorEarningsContractError("invalid creator earnings schedule");
  }
  return parsed;
}

export function parseCreatorEarningsResponse(value: unknown): CreatorEarningsResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new CreatorEarningsContractError("Invalid creator earnings response");
  }
  if (typeof value.has_more !== "boolean") {
    throw new CreatorEarningsContractError("Creator earnings pagination state is required");
  }
  const nextCursor = parseOptionalCursor(value.next_cursor ?? null);
  if (value.has_more && !nextCursor) {
    throw new CreatorEarningsContractError("Creator earnings next cursor is required");
  }
  return {
    items: value.items.map(parseCreatorEarningItem),
    creator_epoch_seconds: parseOptionalScheduleInteger(value.creator_epoch_seconds ?? null),
    origin_epoch: parseOptionalScheduleInteger(value.origin_epoch ?? null),
    origin_unix: parseOptionalScheduleInteger(value.origin_unix ?? null),
    max_creator_claim_epochs: parseOptionalScheduleInteger(value.max_creator_claim_epochs ?? null),
    next_cursor: nextCursor,
    has_more: value.has_more,
  };
}

export function parseCreatorEarningTargetsResponse(value: unknown): CreatorEarningTargetsResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new CreatorEarningsContractError("Invalid creator earnings targets response");
  }
  return {
    items: value.items.map(parseCreatorEarningTarget),
    next_cursor: parseOptionalCursor(value.next_cursor ?? null),
    has_more: value.has_more === true,
  };
}

export function emptyCreatorEarningTargetsResponse(): CreatorEarningTargetsResponse {
  return { items: [], next_cursor: null, has_more: false };
}

export function extractCreatorEarningsSchedule(
  value: CreatorEarningsSchedule,
): Required<CreatorEarningsSchedule> {
  return {
    creator_epoch_seconds: value.creator_epoch_seconds,
    origin_epoch: value.origin_epoch,
    origin_unix: value.origin_unix,
    max_creator_claim_epochs: value.max_creator_claim_epochs,
  };
}

export function assertSameEarningsConfig(
  expected: CreatorEarningsSchedule,
  actual: CreatorEarningsSchedule,
): void {
  const keys: (keyof CreatorEarningsSchedule)[] = [
    "creator_epoch_seconds",
    "origin_epoch",
    "origin_unix",
    "max_creator_claim_epochs",
  ];
  for (const key of keys) {
    if (expected[key] !== actual[key]) {
      throw new CreatorEarningsContractError(`Creator earnings ${key} changed during pagination`);
    }
  }
}

export function createEarningsPageGuard(): {
  accept: (page: CreatorEarningsResponse) => CreatorEarningsResponse;
  schedule: () => CreatorEarningsSchedule | null;
} {
  const seenCursors = new Set<string>();
  let schedule: CreatorEarningsSchedule | null = null;
  return {
    accept(page) {
      if (schedule) assertSameEarningsConfig(schedule, page);
      else schedule = extractCreatorEarningsSchedule(page);
      if (page.has_more) {
        const cursor = page.next_cursor;
        if (!cursor) throw new CreatorEarningsContractError("Creator earnings next cursor is required");
        if (seenCursors.has(cursor)) {
          throw new CreatorEarningsContractError("Creator earnings cursor repeated");
        }
        seenCursors.add(cursor);
      }
      return page;
    },
    schedule: () => schedule,
  };
}

export function remainingAmount(item: Pick<CreatorEarningItem, "earned" | "claimed">): bigint {
  return BigInt(item.earned) - BigInt(item.claimed);
}

export function sumRemainingAmounts(items: readonly Pick<CreatorEarningItem, "earned" | "claimed">[]): bigint {
  return items.reduce((sum, item) => sum + remainingAmount(item), 0n);
}

export function isCreatorEarningClaimable(
  item: Pick<CreatorEarningItem, "earned" | "claimed" | "claim_deadline_unix" | "claimed_height">,
  nowMs: number = Date.now(),
): boolean {
  if (item.claimed_height != null) return false;
  const deadline = item.claim_deadline_unix;
  if (deadline == null || !Number.isSafeInteger(deadline)) return false;
  return remainingAmount(item) > 0n && Math.floor(nowMs / 1000) < deadline;
}

export function currentCreatorEpoch(
  epochSeconds: number,
  nowMs: number = Date.now(),
  originEpoch = 0,
  originUnix = 0,
): number {
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds <= 0) {
    throw new CreatorEarningsContractError("Invalid creator reward interval");
  }
  if (!Number.isSafeInteger(originEpoch) || originEpoch < 0) {
    throw new CreatorEarningsContractError("Invalid creator schedule origin epoch");
  }
  if (!Number.isSafeInteger(originUnix) || originUnix < 0) {
    throw new CreatorEarningsContractError("Invalid creator schedule origin unix");
  }
  return originEpoch + Math.floor((Math.floor(nowMs / 1000) - originUnix) / epochSeconds);
}

export function formatMirageAmount(umirage: string | bigint): string {
  const amount = typeof umirage === "bigint" ? umirage : BigInt(umirage);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / 1_000_000n;
  const fraction = String(abs % 1_000_000n).padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""} MIRAGE`;
}

export function formatCreatorRewardTime(
  unixSeconds: number | null,
  epochSeconds: number | null,
): string {
  const timestamp = Number(unixSeconds);
  const interval = Number(epochSeconds);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return "";
  }
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  };
  if (Number.isSafeInteger(interval) && interval > 0 && interval < 86_400) {
    options.hour = "numeric";
    options.minute = "2-digit";
    options.timeZoneName = "short";
  }
  return new Intl.DateTimeFormat("en-US", options).format(new Date(timestamp * 1000));
}

export function normalizeClaimEpochs(values: readonly unknown[], maxClaimEpochs: unknown): number[] {
  const cap = Number(maxClaimEpochs);
  if (!isPositiveSafeInteger(cap)) {
    throw new CreatorEarningsContractError("Creator claim batch limit is required");
  }
  const ids = [...new Set((values ?? []).map(Number))].sort((a, b) => a - b);
  if (!ids.length) throw new CreatorEarningsContractError("Select at least one claimable epoch");
  if (ids.length > cap) {
    throw new CreatorEarningsContractError(`You can claim at most ${cap} epochs at once`);
  }
  if (ids.some((id) => !isPositiveSafeInteger(id))) {
    throw new CreatorEarningsContractError("Invalid epoch selection");
  }
  return ids;
}

export function nextClaimSelection(
  current: readonly unknown[],
  epochId: unknown,
  maxClaimEpochs: unknown,
): { selected: number[]; atCap: boolean } {
  const id = Number(epochId);
  const cap = Number(maxClaimEpochs);
  if (!isPositiveSafeInteger(id)) throw new CreatorEarningsContractError("Invalid epoch selection");
  if (!isPositiveSafeInteger(cap)) {
    throw new CreatorEarningsContractError("Creator claim batch limit is required");
  }
  const selected = [...new Set((current ?? []).map(Number))].filter((value) => isPositiveSafeInteger(value));
  if (selected.includes(id)) {
    return { selected: selected.filter((value) => value !== id), atCap: false };
  }
  if (selected.length >= cap) return { selected, atCap: true };
  return { selected: [...selected, id], atCap: false };
}

export function allSubmittedEpochsClaimed(
  items: readonly CreatorEarningItem[],
  epochIds: readonly number[],
): boolean {
  const wanted = new Set(epochIds);
  const found = new Map<number, CreatorEarningItem>();
  for (const item of items) {
    if (wanted.has(item.epoch_id)) found.set(item.epoch_id, item);
  }
  if (found.size !== wanted.size) return false;
  for (const id of wanted) {
    if (found.get(id)?.claimed_height == null) return false;
  }
  return true;
}

export { CREATOR_EARNINGS_MAX_PAGES };
