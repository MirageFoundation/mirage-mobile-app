// @ts-nocheck -- Bun provides test types at runtime.
import { expect, test } from "bun:test";

test("real preference actions atomically persist both choices and repair legacy logout reset", () => {
  const result = Bun.spawnSync([process.execPath, "tests/fixtures/adult-preferences-runtime.ts"], {
    cwd: process.cwd(), stdout: "pipe", stderr: "pipe",
  });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain("adult preference persistence and migration passed");
});
