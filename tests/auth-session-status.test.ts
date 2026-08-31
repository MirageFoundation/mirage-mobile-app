// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  canRunAuthenticatedSideEffects,
  resolveAuthSessionStatus,
  resolvePendingWalletStartup,
} from "../src/domain/auth/session";

describe("auth session status", () => {
  test("treats a pending wallet as signup, even if a persisted login flag leaked", () => {
    expect(
      resolveAuthSessionStatus({
        hasConfirmedSession: true,
        hasPendingWallet: true,
        walletAddress: "mirage1abc",
      }),
    ).toBe("pending_signup");
  });

  test("requires both a confirmed flag and an address for a session", () => {
    expect(
      resolveAuthSessionStatus({
        hasConfirmedSession: true,
        hasPendingWallet: false,
        walletAddress: null,
      }),
    ).toBe("guest");
    expect(
      resolveAuthSessionStatus({
        hasConfirmedSession: false,
        hasPendingWallet: false,
        walletAddress: "mirage1abc",
      }),
    ).toBe("guest");
  });

  test("confirms only a finished wallet", () => {
    expect(
      resolveAuthSessionStatus({
        hasConfirmedSession: true,
        hasPendingWallet: false,
        walletAddress: "mirage1abc",
      }),
    ).toBe("authenticated");
  });

  test("blocks side effects until the session is idle", () => {
    expect(
      canRunAuthenticatedSideEffects({
        status: "authenticated",
        isInitializing: false,
        isPowBusy: false,
      }),
    ).toBe(true);
    expect(
      canRunAuthenticatedSideEffects({
        status: "pending_signup",
        isInitializing: false,
        isPowBusy: false,
      }),
    ).toBe(false);
    expect(
      canRunAuthenticatedSideEffects({
        status: "authenticated",
        isInitializing: true,
        isPowBusy: false,
      }),
    ).toBe(false);
    expect(
      canRunAuthenticatedSideEffects({
        status: "authenticated",
        isInitializing: false,
        isPowBusy: true,
      }),
    ).toBe(false);
  });
});

describe("pending wallet startup", () => {
  test("resumes only when the username tx already landed", () => {
    expect(
      resolvePendingWalletStartup({ pending: true, hasUsername: true }),
    ).toBe("resume");
    expect(
      resolvePendingWalletStartup({ pending: true, hasUsername: false }),
    ).toBe("wipe");
    expect(
      resolvePendingWalletStartup({ pending: false, hasUsername: true }),
    ).toBe("none");
  });
});
