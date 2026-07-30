// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  createReferralListModel,
  getReferralRowKey,
  shouldRequestReferralNextPage,
} from "../src/pages/referrals/referral-list-model";

describe("referral list model", () => {
  test("uses the stable referral address as the row key", () => {
    expect(getReferralRowKey({ address: "referral-address" })).toBe("referral-address");
  });

  test("builds total header and bounded-page footer states", () => {
    const model = createReferralListModel({
      isLoading: false,
      isError: false,
      itemCount: 20,
      total: 34,
      hasMore: true,
      supportsPagination: false,
      isFetchingNextPage: false,
    });

    expect(model.header).toEqual({ totalLabel: "34 total" });
    expect(model.emptyState).toBeNull();
    expect(model.footer).toEqual({ kind: "summary", visibleCount: 20, total: 34 });
    expect(model.canRequestNextPage).toBe(false);
  });

  test.each([
    [true, false, false, "loading"],
    [false, true, false, "error"],
    [false, false, false, "empty"],
    [true, true, true, null],
  ])("selects loading, error, empty, and populated states", (isLoading, isError, populated, expected) => {
    const model = createReferralListModel({
      isLoading,
      isError,
      itemCount: populated ? 1 : 0,
      hasMore: false,
      supportsPagination: false,
      isFetchingNextPage: false,
    });

    expect(model.emptyState).toBe(expected);
    expect(model.footer).toEqual({ kind: "none" });
  });

  test("shows a loading footer only for an active paginated request", () => {
    const model = createReferralListModel({
      isLoading: false,
      isError: false,
      itemCount: 20,
      total: 34,
      hasMore: true,
      supportsPagination: true,
      isFetchingNextPage: true,
    });

    expect(model.footer).toEqual({ kind: "loading" });
  });

  test("guards next-page requests by support, remaining rows, and in-flight state", () => {
    expect(shouldRequestReferralNextPage({ supportsPagination: true, hasMore: true, isFetchingNextPage: false })).toBe(true);
    expect(shouldRequestReferralNextPage({ supportsPagination: false, hasMore: true, isFetchingNextPage: false })).toBe(false);
    expect(shouldRequestReferralNextPage({ supportsPagination: true, hasMore: false, isFetchingNextPage: false })).toBe(false);
    expect(shouldRequestReferralNextPage({ supportsPagination: true, hasMore: true, isFetchingNextPage: true })).toBe(false);
  });
});
