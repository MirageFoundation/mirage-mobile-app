// @ts-nocheck -- Bun runtime test types.
import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { getCachedRelayDecision, hydrateAccountStatus, parseAccountStatusSnapshot } from "../src/api/cache/account-status-cache";
import { queryKeys } from "../src/api/read/query-keys";

test("entitled accounts retain absent/null quota relay policy without manufacturing cache freshness", () => {
  for (const status of [{ user_level: 1, effective_paid: true }, { user_level: 100, effective_paid: false }]) {
    const client = new QueryClient();
    const key = queryKeys.accountStatus("viewer");
    client.setQueryData(queryKeys.userStatus("viewer"), status);
    expect(getCachedRelayDecision(client, "viewer").relay_allowed).toBe(true);
    hydrateAccountStatus(client, "viewer", parseAccountStatusSnapshot({}));
    expect(getCachedRelayDecision(client, "viewer").relay_allowed).toBe(true);
    expect(client.getQueryData(key)).toEqual({ incomplete: true });
    expect(client.getQueryState(key).dataUpdatedAt).toBe(0);
    hydrateAccountStatus(client, "viewer", parseAccountStatusSnapshot({ daily_quota: null, renewal_warning: null }));
    expect(getCachedRelayDecision(client, "viewer").relay_allowed).toBe(true);
    expect(client.getQueryData(key).incomplete).toBeUndefined();
    client.clear();
  }
});

test("incomplete refresh retains known exhausted quota without promoting its timestamp", () => {
  const client = new QueryClient();
  const key = queryKeys.accountStatus("viewer");
  client.setQueryData(queryKeys.userStatus("viewer"), { user_level: 1, effective_paid: true });
  const quota = { epoch: 1, used: 10, limit: 10, remaining: 0, reset_at: Math.floor(Date.now() / 1000) + 3600 };
  client.setQueryData(key, { daily_quota: quota, renewal_warning: null }, { updatedAt: 123 });
  hydrateAccountStatus(client, "viewer", parseAccountStatusSnapshot({}));
  expect(client.getQueryData(key)).toEqual({ daily_quota: quota, renewal_warning: null, incomplete: true });
  expect(client.getQueryState(key).dataUpdatedAt).toBe(123);
  expect(getCachedRelayDecision(client, "viewer")).toEqual({ pow_required: false, relay_allowed: false, quota_exhausted: true });
  client.clear();
});

test("missing quota cannot create entitlement for a free account; explicit fallback entitlement remains supported", () => {
  const client = new QueryClient();
  expect(getCachedRelayDecision(client, "viewer").pow_required).toBe(true);
  expect(getCachedRelayDecision(client, "viewer", { effectivePaid: true }).relay_allowed).toBe(true);
  expect(getCachedRelayDecision(client, "viewer", { userLevel: 100 }).relay_allowed).toBe(true);
  client.clear();
});
