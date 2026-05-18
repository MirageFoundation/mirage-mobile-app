#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const checks = [
  "check:file-sizes",
  "check:stores",
  "check:boundaries",
  "check:query-keys",
  "check:navigation",
  "check:typecheck",
  "check:lint",
];

for (const check of checks) {
  const result = spawnSync("bun", ["run", check], {
    cwd: join(TOOLS_DIR, ".."),
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(`Failed to run ${check}:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("Architecture guardrail suite passed.");
