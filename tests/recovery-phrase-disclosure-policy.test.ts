// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { RecoveryPhraseDisclosurePolicy } from "../src/pages/recovery-phrase/recovery-phrase-disclosure-policy";

const PHRASE = "one two three four five six seven eight nine ten eleven twelve";

function authenticateAndExport(
  policy: RecoveryPhraseDisclosurePolicy,
  now = 1_000,
) {
  const authRequest = policy.beginAuthentication();
  const exportRequest = policy.authenticationSucceeded(authRequest);
  expect(exportRequest).not.toBeNull();
  expect(policy.completeExport(exportRequest!, PHRASE, now)).toBe(true);
}

describe("recovery phrase disclosure policy", () => {
  test("reveals only after authentication succeeds and export completes", () => {
    const policy = new RecoveryPhraseDisclosurePolicy(5_000);
    const request = policy.beginAuthentication();

    expect(policy.getSnapshot().phrase).toBeNull();
    const exportRequest = policy.authenticationSucceeded(request);
    expect(policy.completeExport(exportRequest!, PHRASE, 1_000)).toBe(true);
    expect(policy.getActivePhrase(5_999)).toBe(PHRASE);
  });

  test("authentication failure clears and requires a new request", () => {
    const policy = new RecoveryPhraseDisclosurePolicy();
    const request = policy.beginAuthentication();

    policy.authenticationFailed(request);

    expect(policy.getSnapshot()).toEqual({
      phase: "locked",
      phrase: null,
      expiresAt: null,
    });
    expect(policy.authenticationSucceeded(request)).toBeNull();
  });

  test("inactivity expires the phrase", () => {
    const policy = new RecoveryPhraseDisclosurePolicy(5_000);
    authenticateAndExport(policy, 1_000);

    expect(policy.expire(5_999)).toBe(false);
    expect(policy.expire(6_000)).toBe(true);
    expect(policy.getActivePhrase(6_000)).toBeNull();
  });

  for (const reason of ["background", "app-inactive", "blur"] as const) {
    test(`${reason} immediately clears the phrase`, () => {
      const policy = new RecoveryPhraseDisclosurePolicy();
      authenticateAndExport(policy);

      policy.clear(reason);

      expect(policy.getSnapshot().phrase).toBeNull();
      expect(policy.getSnapshot().phase).toBe("locked");
    });
  }

  test("ignores stale async export completion after backgrounding", () => {
    const policy = new RecoveryPhraseDisclosurePolicy();
    const authRequest = policy.beginAuthentication();
    const exportRequest = policy.authenticationSucceeded(authRequest)!;

    policy.clear("background");

    expect(policy.completeExport(exportRequest, PHRASE, 1_000)).toBe(false);
    expect(policy.getSnapshot().phrase).toBeNull();
  });

  test("cleanup clears disclosure and invalidates in-flight work", () => {
    const policy = new RecoveryPhraseDisclosurePolicy();
    const request = policy.beginAuthentication();

    policy.clear("cleanup");

    expect(policy.authenticationSucceeded(request)).toBeNull();
    expect(policy.getSnapshot().phrase).toBeNull();
  });
});
