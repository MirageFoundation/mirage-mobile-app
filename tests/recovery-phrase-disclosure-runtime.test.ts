// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { expect, test } from "bun:test";

test("production recovery disclosure handles biometric resume and stale results", () => {
  const result = Bun.spawnSync([process.execPath, "tests/fixtures/recovery-phrase-disclosure-runtime.ts"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.stdout.toString() + result.stderr.toString()).toContain("Recovery disclosure lifecycle mock checks passed");
  expect(result.exitCode).toBe(0);
});
