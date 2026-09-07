// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

describe("subscription write contract", () => {
  test("self and gift subscribe use POST /core/subscribe, level 1, and period_count 1-12", () => {
    const endpoint = source("src/api/write/endpoints/tokens.ts");
    expect(endpoint).toContain('"/core/subscribe"');
    expect(endpoint).toContain("PURCHASABLE_SUBSCRIPTION_LEVEL");
    expect(endpoint).toContain("assertPeriodCount");
    expect(endpoint).toContain("period_count: validatedPeriodCount");
    expect(endpoint).toContain("skipPoW: true");
    expect(endpoint).toContain("target: recipient");
    expect(endpoint).not.toContain("level: 10");
    expect(endpoint).not.toContain("setUserLevel");
  });

  test("canonical tag 102 is explicit period_count", () => {
    const canonical = source("src/api/write/signing/canonical.ts");
    expect(canonical).toContain("encU64(102, params.periodCount)");
  });

  test("success invalidates account snapshot instead of optimistic level or parameters entitlement", () => {
    const upgrade = source("src/api/write/hooks/use-send-tokens.ts");
    const gift = source("src/api/write/hooks/use-gift-subscription.ts");
    expect(upgrade).toContain("invalidateAccountSnapshot");
    expect(upgrade).not.toContain("setUserLevel(1");
    expect(gift).toContain("invalidateAccountSnapshot");
    expect(gift).not.toContain("queryKeys.parameters");
  });
});
