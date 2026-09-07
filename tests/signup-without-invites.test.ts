// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("signup without invites", () => {
  const usernameEndpoint = readFileSync(
    join(import.meta.dir, "../src/api/write/endpoints/username.ts"),
    "utf8",
  );
  const usernameScreen = readFileSync(
    join(import.meta.dir, "../src/pages/auth/username-content.tsx"),
    "utf8",
  );

  test("username write contract is username-only", () => {
    expect(usernameEndpoint).toContain("username: string");
    expect(usernameEndpoint).not.toContain("invite_code");
    expect(usernameEndpoint).not.toContain("referrer_username");
    expect(usernameEndpoint).toContain("/core/set_username");
  });

  test("signup readiness depends on registration_enabled only", () => {
    expect(usernameScreen).toContain("registration_enabled");
    expect(usernameScreen).not.toContain("registration_invite_code_required");
    expect(usernameScreen).toContain("typeof nodeConfig?.registration_enabled === \"boolean\"");
  });

  test("username screen keeps wallet onboarding and drops invite/referral UI", () => {
    const controller = readFileSync(join(import.meta.dir, "../src/pages/auth/use-signup-registration.ts"), "utf8");
    expect(controller).toContain("createNewWallet");
    expect(controller).toContain("setHasUsername");
    expect(controller).toContain("registerPendingUsername");
    expect(controller).toContain("/recovery-phrase");
    expect(usernameScreen).toContain("trackEvent(\"onboarding_started\")");
    expect(controller).toContain("trackEvent(\"username_set\")");
    expect(usernameScreen).not.toContain("invite_code");
    expect(usernameScreen).not.toContain("referrer_username");
    expect(usernameScreen).not.toContain("validateInviteCode");
    expect(usernameScreen).not.toContain("getReferralPrecheck");
    expect(usernameScreen).not.toContain("useAuthInviteLinkListener");
  });
});
