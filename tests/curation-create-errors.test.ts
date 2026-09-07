// @ts-nocheck -- Bun's test types are runtime-provided.
import { expect, test } from "bun:test";

test("create-team eligibility errors preserve structured UX and reporting", () => {
  const result = Bun.spawnSync(
    [process.execPath, "--no-env-file", "tests/fixtures/curation-create-errors-runtime.ts"],
    { stdout: "pipe", stderr: "pipe" },
  );
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});

test("create-team sheet preserves drafts and distinguishes confirmation from syncing", () => {
  const result = Bun.spawnSync(
    [process.execPath, "--no-env-file", "tests/fixtures/curation-create-sheet-runtime.ts"],
    { stdout: "pipe", stderr: "pipe" },
  );
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});

test("create-team presentation survives Gorhom ref, RAF, portal and dismissal lifecycle", () => {
  const result = Bun.spawnSync(
    [process.execPath, "--no-env-file", "tests/fixtures/team-create-presentation-runtime.ts"],
    { stdout: "pipe", stderr: "pipe" },
  );
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});
