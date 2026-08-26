// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  canRequestOsPermissions,
  resolveAuthSignupScreenAccess,
} from "../src/navigation/auth-flow-policy";

const guest = {
  sessionStatus: "guest",
  hasRecoveryPhrase: false,
  isCompletingSignup: false,
};

describe("auth signup screen access", () => {
  test("lets guests use the username screen", () => {
    expect(
      resolveAuthSignupScreenAccess({ ...guest, screen: "username" }),
    ).toBe("show");
  });

  test("sends finished sessions home instead of back to username", () => {
    const finished = {
      sessionStatus: "authenticated",
      hasRecoveryPhrase: false,
      isCompletingSignup: false,
    };

    expect(
      resolveAuthSignupScreenAccess({ ...finished, screen: "username" }),
    ).toBe("redirect_home");
    expect(
      resolveAuthSignupScreenAccess({ ...finished, screen: "recovery-phrase" }),
    ).toBe("redirect_home");
  });

  test("does not bounce home while signup confirmation is in flight", () => {
    expect(
      resolveAuthSignupScreenAccess({
        screen: "recovery-phrase",
        sessionStatus: "authenticated",
        hasRecoveryPhrase: false,
        isCompletingSignup: true,
      }),
    ).toBe("show");
  });

  test("pending signup with a phrase resumes on recovery, not username", () => {
    expect(
      resolveAuthSignupScreenAccess({
        screen: "username",
        sessionStatus: "pending_signup",
        hasRecoveryPhrase: true,
        isCompletingSignup: false,
      }),
    ).toBe("redirect_recovery_phrase");

    expect(
      resolveAuthSignupScreenAccess({
        screen: "recovery-phrase",
        sessionStatus: "pending_signup",
        hasRecoveryPhrase: true,
        isCompletingSignup: false,
      }),
    ).toBe("show");
  });

  test("recovery phrase requires a live phrase unless confirmation started", () => {
    expect(
      resolveAuthSignupScreenAccess({
        ...guest,
        screen: "recovery-phrase",
      }),
    ).toBe("redirect_username");

    expect(
      resolveAuthSignupScreenAccess({
        ...guest,
        screen: "recovery-phrase",
        hasRecoveryPhrase: true,
      }),
    ).toBe("show");
  });
});

describe("OS permission timing", () => {
  test("blocks permission prompts until the session is confirmed and idle", () => {
    expect(
      canRequestOsPermissions({
        sessionStatus: "guest",
      }),
    ).toBe(false);
    expect(
      canRequestOsPermissions({
        sessionStatus: "pending_signup",
      }),
    ).toBe(false);
    expect(
      canRequestOsPermissions({
        sessionStatus: "authenticated",
        isPowBusy: true,
      }),
    ).toBe(false);
    expect(
      canRequestOsPermissions({
        sessionStatus: "authenticated",
        isInitializing: true,
      }),
    ).toBe(false);
  });

  test("allows permission prompts only after a finished idle session", () => {
    expect(
      canRequestOsPermissions({
        sessionStatus: "authenticated",
        isInitializing: false,
        isPowBusy: false,
      }),
    ).toBe(true);
  });
});
