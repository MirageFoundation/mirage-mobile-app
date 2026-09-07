// @ts-nocheck -- Bun test types are runtime-provided.
import { expect, test } from "bun:test";
import { writeFailureDiagnostics } from "../src/api/write-failure-diagnostics";

test("invite endpoint signs the same bytes reconstructed from its actual Axios JSON", () => {
  const result = Bun.spawnSync([process.execPath, "tests/fixtures/invite-curator-parity-runtime.ts"], {
    cwd: new URL("..", import.meta.url).pathname,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(result.stdout.toString()).toContain("independent canonical verification passed");
});

test("write diagnostics retain status and nested safe reason without envelope or arbitrary text", () => {
  const diagnostics = writeFailureDiagnostics("/core/invite_curator", {
    config: { data: { pubkey: "private", signature: "private", target: "private" } },
    response: { status: 400, data: {
      error: "private raw body", error_code: "transaction_rejected", tx_hash: "a".repeat(64),
      details: { reason: "only the team owner may invite", address: "private", signature: "private" },
    } },
  });
  expect(diagnostics).toEqual({ path: "/core/invite_curator", http_status: 400,
    error_code: "transaction_rejected", tx_hash: "a".repeat(64), reason: "only the team owner may invite" });
  expect(JSON.stringify(diagnostics)).not.toContain("private");
  expect(writeFailureDiagnostics("/core/invite_curator?signature=private", {
    response: { status: 500, data: { error_code: "private arbitrary text", tx_hash: "private", details: { reason: "private" } } },
  })).toEqual({ path: "/core/unknown", http_status: 500 });
});
