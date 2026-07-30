#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOTS = [join(ROOT, "app"), join(ROOT, "src")];
const SOURCE_EXTENSIONS = new Set([".tsx"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function lineForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

const failures = [];
for (const root of SOURCE_ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/<IconButton\b[\s\S]*?\/>/g)) {
      if (!/\baccessibilityLabel\s*=/.test(match[0])) {
        failures.push(
          `${relative(ROOT, file)}:${lineForIndex(text, match.index ?? 0)} IconButton missing accessibilityLabel`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("IconButton accessibility guardrail failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("IconButton accessibility guardrail passed.");
