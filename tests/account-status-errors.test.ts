// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const {
  classifyAccountStatusError,
  LEGACY_THREAD_READ_ONLY_CODE,
  SUBSCRIBER_DAILY_LIMIT_CODE,
} = await import("../src/domain/subscriptions");
const { getApiErrorMessage, parseApiError } = await import("../src/utils/parse-api-error");

describe("account status errors", () => {
  test("recognizes structured quota code and explicit accounting only", () => {
    const classified = classifyAccountStatusError({
      response: {
        data: {
          error_code: SUBSCRIBER_DAILY_LIMIT_CODE,
          epoch: 12,
          limit: 200,
          used: 200,
          remaining: 0,
          reset: 86_400,
        },
      },
    });
    expect(classified).toEqual({
      kind: "quota",
      code: SUBSCRIBER_DAILY_LIMIT_CODE,
      message: "Daily no-PoW allowance used. Try again after reset.",
      accounting: {
        epoch: 12,
        limit: 200,
        used: 200,
        remaining: 0,
        reset: 86_400,
      },
    });
  });

  test("recognizes quota literal in string-bearing fields without guessing missing accounting", () => {
    const classified = classifyAccountStatusError({
      response: {
        data: {
          error: "subscriber_daily_limit_reached epoch=9 limit=10 used=10 remaining=0 reset=123",
        },
      },
    });
    expect(classified?.kind).toBe("quota");
    expect(classified?.accounting).toEqual({
      epoch: 9,
      limit: 10,
      used: 10,
      remaining: 0,
      reset: 123,
    });
  });

  test("keeps generic transaction_rejected generic", () => {
    const error = {
      response: {
        status: 400,
        data: {
          error_code: "transaction_rejected",
          error: "transaction rejected",
        },
      },
    };
    expect(classifyAccountStatusError(error)).toBeNull();
    expect(parseApiError(error).errorCode).toBe("transaction_rejected");
    expect(getApiErrorMessage(error)).toBe("Transaction was rejected by the chain.");
  });

  test("recognizes legacy_thread_read_only by code then literal", () => {
    expect(classifyAccountStatusError({
      response: { data: { error_code: LEGACY_THREAD_READ_ONLY_CODE } },
    })?.kind).toBe("legacy_thread");
    expect(classifyAccountStatusError({
      response: { data: { error: "legacy_thread_read_only: this older thread is read-only" } },
    })?.message).toBe("This older thread is read-only.");
  });
});
