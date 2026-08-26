#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const EXCLUDED = new Set([
  "src/api/read/query-keys.ts",
  "src/api/write/mutation-keys.ts",
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if ([...SOURCE_EXTENSIONS].some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

function exists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function lineForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

const failures = [];
const rawQueryKeyPatterns = [
  /queryKey\s*:\s*\[/g,
  /(?:invalidateQueries|removeQueries|resetQueries|refetchQueries|cancelQueries)\s*\(\s*\{\s*queryKey\s*:\s*\[/g,
  /(?:getQueryData|getQueriesData|setQueryData|setQueriesData|removeQueries)\s*\(\s*\[/g,
];

if (exists(SRC_DIR)) {
  for (const file of walk(SRC_DIR)) {
    const rel = relative(ROOT, file);
    if (EXCLUDED.has(rel)) continue;
    const text = readFileSync(file, "utf8");

    for (const pattern of rawQueryKeyPatterns) {
      for (const match of text.matchAll(pattern)) {
        failures.push(`${rel}:${lineForIndex(text, match.index ?? 0)} raw query-key literal; use queryKeys.*`);
      }
    }

    const mutationMatches = [...text.matchAll(/useMutation\s*\(\s*\{/g)];
    for (const match of mutationMatches) {
      const start = match.index ?? 0;
      const nextMutation = text.indexOf("useMutation", start + 1);
      const chunk = text.slice(start, nextMutation === -1 ? text.length : nextMutation);
      if (!/mutationKey\s*:/.test(chunk)) {
        failures.push(`${rel}:${lineForIndex(text, start)} useMutation object missing mutationKey`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Query/cache guardrail failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Query/cache guardrail passed.");
