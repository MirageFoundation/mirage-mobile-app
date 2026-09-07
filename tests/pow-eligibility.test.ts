// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { decideRelay } from "../src/domain/subscriptions";

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

describe("pow eligibility", () => {
  test("does not use userLevel>0 or tier-string shortcuts", () => {
    expect(decideRelay({ userLevel: 1, effectivePaid: false }).pow_required).toBe(true);
    expect(decideRelay({ userLevel: 0, effectivePaid: true }).relay_allowed).toBe(true);
    expect(decideRelay({ userLevel: 100, effectivePaid: false }).relay_allowed).toBe(true);
  });

  test("envelope and queue use RelayDecision instead of parameters.user_level", () => {
    const envelope = source("src/api/write/signing/envelope.ts");
    const queue = source("src/services/pow-queue.ts");
    expect(envelope).toContain("getCachedRelayDecision");
    expect(envelope).toContain("QuotaExhaustedError");
    expect(envelope).not.toContain("params.user_level");
    expect(envelope).not.toContain("canSkipPoWForUser");
    expect(envelope).not.toContain("buildEnvelopeWithParams");
    expect(queue).toContain("getCachedRelayDecision");
    expect(queue).toContain("quota_exhausted");
    expect(queue).not.toContain("canSkipPoWForUser");
  });

  test("forcePoW cannot route entitled paid or Admin users onto PoW", () => {
    const envelope = source("src/api/write/signing/envelope.ts");
    expect(envelope).toContain("!skipPoW && !userCanSkipPoW && (forcePoW || relayDecision.pow_required)");
  });
});
