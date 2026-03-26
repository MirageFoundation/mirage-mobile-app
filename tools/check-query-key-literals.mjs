#!/usr/bin/env bun
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const FILE_EXTENSIONS = ['.ts', '.tsx'];
const PATTERN = /(queryKey:\s*\[|getQueriesData\(\s*\{\s*queryKey:\s*\[|setQueriesData\(\s*\{\s*queryKey:\s*\[|invalidateQueries\(\{\s*queryKey:\s*\[|removeQueries\(\{\s*queryKey:\s*\[|cancelQueries\(\{\s*queryKey:\s*\[)/;
const IGNORE = new Set([
  'src/providers/query-clear-provider.tsx',
  'src/components/ui/dev-toolbar.tsx',
]);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (!FILE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    files.push(fullPath);
  }
  return files;
}

const violations = [];
for (const path of walk(ROOT)) {
  if (IGNORE.has(path)) continue;
  const text = readFileSync(path, 'utf8');
  if (PATTERN.test(text)) {
    violations.push(path);
  }
}

if (violations.length > 0) {
  console.error('Raw query-key literal hotspots found:');
  for (const path of violations) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

console.log('Query-key literal checks passed.');
