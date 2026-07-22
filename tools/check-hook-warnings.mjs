#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync("bunx", ["eslint", ".", "-f", "json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});

if (result.error || !result.stdout) {
  console.error(result.error?.message ?? result.stderr ?? "ESLint produced no report");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("Could not parse ESLint JSON output.");
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

const warnings = report.flatMap((file) =>
  file.messages
    .filter((message) => message.ruleId === "react-hooks/exhaustive-deps")
    .map((message) => ({
      file: file.filePath.replace(`${process.cwd()}/`, ""),
      line: message.line,
      message: message.message,
    })),
);

console.log(`react-hooks/exhaustive-deps warnings: ${warnings.length}`);
for (const warning of warnings) {
  console.log(`- ${warning.file}:${warning.line} ${warning.message}`);
}

process.exit(warnings.length > 0 ? 1 : 0);
