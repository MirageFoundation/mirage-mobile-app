// @ts-nocheck -- Bun test types are runtime-provided.
import { expect, test } from "bun:test";

for (const fixture of ["team-detail-actions", "team-detail-ui", "team-detail-settlement"]) {
  test(`curation detail ${fixture} regression`, () => {
    const result = Bun.spawnSync([process.execPath, "--no-env-file", `tests/fixtures/${fixture}-runtime.ts`], { stdout: "pipe", stderr: "pipe" });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
  });
}
