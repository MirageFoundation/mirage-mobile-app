// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { expect, test } from "bun:test";

test("navigation modules compose correctly with native/store boundaries", () => {
  const result = Bun.spawnSync([
    process.execPath, "test", "./tests/fixtures/navigation-linking-runtime.ts",
  ], { cwd: `${import.meta.dir}/..`, stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
});
