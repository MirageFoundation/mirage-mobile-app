// @ts-nocheck -- Bun runtime test types.
import { expect, test } from "bun:test";

test("real GET budget, fresh proofs, cancellation and sanitized terminal reports", () => {
  const result = Bun.spawnSync([process.execPath, "--no-env-file", "tests/fixtures/read-resilience-runtime.ts"], { stdout: "pipe", stderr: "pipe" });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain("read resilience runtime checks passed");
});

test("bootstrap whole/partial fallback, auth dedup and stale account/feed isolation", () => {
  const result = Bun.spawnSync([process.execPath, "--no-env-file", "tests/fixtures/bootstrap-resilience-runtime.ts"], { stdout: "pipe", stderr: "pipe" });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain("bootstrap resilience runtime checks passed");
});
