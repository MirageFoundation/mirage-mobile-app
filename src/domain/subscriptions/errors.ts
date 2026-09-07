export const SUBSCRIBER_DAILY_LIMIT_CODE = "subscriber_daily_limit_reached";
export const LEGACY_THREAD_READ_ONLY_CODE = "legacy_thread_read_only";

export const SUBSCRIBER_DAILY_LIMIT_MESSAGE =
  "Daily no-PoW allowance used. Try again after reset.";
export const LEGACY_THREAD_READ_ONLY_MESSAGE = "This older thread is read-only.";

const STRING_BEARING_KEYS = [
  "error",
  "message",
  "error_details",
  "raw_log",
  "error_code",
  "reason",
] as const;

const ACCOUNTING_KEYS = ["epoch", "limit", "used", "remaining", "reset", "reset_at"] as const;

export type QuotaAccounting = {
  epoch?: number;
  limit?: number;
  used?: number;
  remaining?: number;
  reset?: number;
};

export type ClassifiedAccountStatusError =
  | {
      kind: "quota";
      code: typeof SUBSCRIBER_DAILY_LIMIT_CODE;
      message: string;
      accounting: QuotaAccounting;
    }
  | {
      kind: "legacy_thread";
      code: typeof LEGACY_THREAD_READ_ONLY_CODE;
      message: string;
    };

export class QuotaExhaustedError extends Error {
  readonly code = SUBSCRIBER_DAILY_LIMIT_CODE;
  readonly accounting: QuotaAccounting;

  constructor(accounting: QuotaAccounting = {}) {
    super(SUBSCRIBER_DAILY_LIMIT_MESSAGE);
    this.name = "QuotaExhaustedError";
    this.accounting = accounting;
  }
}

export class LegacyThreadReadOnlyError extends Error {
  readonly code = LEGACY_THREAD_READ_ONLY_CODE;

  constructor(message = LEGACY_THREAD_READ_ONLY_MESSAGE) {
    super(message);
    this.name = "LegacyThreadReadOnlyError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function collectStringBearers(value: unknown, out: string[], depth = 0): void {
  if (depth > 4 || value == null) return;
  if (typeof value === "string") {
    if (value) out.push(value);
    return;
  }
  if (value instanceof Error && value.message) {
    out.push(value.message);
  }
  if (!isRecord(value)) return;
  for (const key of STRING_BEARING_KEYS) {
    const field = value[key];
    if (typeof field === "string" && field) out.push(field);
  }
  if (isRecord(value.response)) {
    collectStringBearers(value.response, out, depth + 1);
    collectStringBearers(value.response.data, out, depth + 1);
  }
  if ("data" in value) {
    collectStringBearers(value.data, out, depth + 1);
  }
}

function readErrorCode(value: unknown): string | null {
  if (value instanceof QuotaExhaustedError) return SUBSCRIBER_DAILY_LIMIT_CODE;
  if (value instanceof LegacyThreadReadOnlyError) return LEGACY_THREAD_READ_ONLY_CODE;
  if (!isRecord(value)) return null;
  if (typeof value.error_code === "string") return value.error_code;
  if (isRecord(value.response) && isRecord(value.response.data) && typeof value.response.data.error_code === "string") {
    return value.response.data.error_code;
  }
  if (isRecord(value.data) && typeof value.data.error_code === "string") {
    return value.data.error_code;
  }
  return null;
}

function readIntegerField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function accountingFromObject(value: unknown): QuotaAccounting {
  if (!isRecord(value)) return {};
  const accounting: QuotaAccounting = {};
  const epoch = readIntegerField(value, "epoch");
  const limit = readIntegerField(value, "limit");
  const used = readIntegerField(value, "used");
  const remaining = readIntegerField(value, "remaining");
  const reset = readIntegerField(value, "reset") ?? readIntegerField(value, "reset_at");
  if (epoch !== undefined) accounting.epoch = epoch;
  if (limit !== undefined) accounting.limit = limit;
  if (used !== undefined) accounting.used = used;
  if (remaining !== undefined) accounting.remaining = remaining;
  if (reset !== undefined) accounting.reset = reset;
  return accounting;
}

function accountingFromLiteral(text: string): QuotaAccounting {
  const accounting: QuotaAccounting = {};
  for (const key of ACCOUNTING_KEYS) {
    const match = text.match(new RegExp(`(?:^|\\s)${key}=(-?\\d+)(?:\\s|$)`));
    if (!match) continue;
    const parsed = Number(match[1]);
    if (!Number.isInteger(parsed)) continue;
    if (key === "reset_at") accounting.reset = parsed;
    else accounting[key] = parsed;
  }
  return accounting;
}

function mergeAccounting(...parts: QuotaAccounting[]): QuotaAccounting {
  const merged: QuotaAccounting = {};
  for (const part of parts) {
    if (part.epoch !== undefined) merged.epoch = part.epoch;
    if (part.limit !== undefined) merged.limit = part.limit;
    if (part.used !== undefined) merged.used = part.used;
    if (part.remaining !== undefined) merged.remaining = part.remaining;
    if (part.reset !== undefined) merged.reset = part.reset;
  }
  return merged;
}

function responseData(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.response) && isRecord(value.response.data)) return value.response.data;
  if (isRecord(value.data)) return value.data;
  return value;
}

/**
 * Current node generic classifier maps chain quota exhaustion to
 * `transaction_rejected` and hides accounting. This parser supports a future
 * structured `subscriber_daily_limit_reached` code and a literal token in
 * real string-bearing fields, but never guesses quota from a generic
 * rejection.
 */
export function classifyAccountStatusError(error: unknown): ClassifiedAccountStatusError | null {
  if (error instanceof QuotaExhaustedError) {
    return {
      kind: "quota",
      code: SUBSCRIBER_DAILY_LIMIT_CODE,
      message: SUBSCRIBER_DAILY_LIMIT_MESSAGE,
      accounting: error.accounting,
    };
  }
  if (error instanceof LegacyThreadReadOnlyError) {
    return {
      kind: "legacy_thread",
      code: LEGACY_THREAD_READ_ONLY_CODE,
      message: LEGACY_THREAD_READ_ONLY_MESSAGE,
    };
  }

  const errorCode = readErrorCode(error);
  const strings: string[] = [];
  collectStringBearers(error, strings);
  const joined = strings.join("\n");
  const hasQuotaLiteral = strings.some((text) => text.includes(SUBSCRIBER_DAILY_LIMIT_CODE));
  const hasLegacyLiteral = strings.some((text) => text.includes(LEGACY_THREAD_READ_ONLY_CODE));

  if (errorCode === SUBSCRIBER_DAILY_LIMIT_CODE || hasQuotaLiteral) {
    const data = responseData(error);
    return {
      kind: "quota",
      code: SUBSCRIBER_DAILY_LIMIT_CODE,
      message: SUBSCRIBER_DAILY_LIMIT_MESSAGE,
      accounting: mergeAccounting(
        error instanceof QuotaExhaustedError ? error.accounting : {},
        accountingFromObject(data),
        accountingFromObject(error),
        accountingFromLiteral(joined),
      ),
    };
  }

  if (errorCode === LEGACY_THREAD_READ_ONLY_CODE || hasLegacyLiteral) {
    return {
      kind: "legacy_thread",
      code: LEGACY_THREAD_READ_ONLY_CODE,
      message: LEGACY_THREAD_READ_ONLY_MESSAGE,
    };
  }

  return null;
}

export function isQuotaExhaustedError(error: unknown): boolean {
  return classifyAccountStatusError(error)?.kind === "quota";
}

export function isLegacyThreadReadOnlyError(error: unknown): boolean {
  return classifyAccountStatusError(error)?.kind === "legacy_thread";
}

export function isExpectedWriteConditionError(error: unknown): boolean {
  return classifyAccountStatusError(error) !== null;
}
