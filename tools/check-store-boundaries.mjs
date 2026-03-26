#!/usr/bin/env bun
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/stores";
const FORBIDDEN = [
  '@/src/pages/',
  '@/src/components/',
];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
    files.push(fullPath);
  }
  return files;
}

const violations = [];
for (const path of walk(ROOT)) {
  const text = readFileSync(path, 'utf8');
  for (const forbidden of FORBIDDEN) {
    if (text.includes(forbidden)) {
      violations.push({ path, forbidden });
    }
  }
}

if (violations.length > 0) {
  console.error('Store boundary violations found:');
  for (const violation of violations) {
    console.error(`- ${violation.path} imports ${violation.forbidden}`);
  }
  process.exit(1);
}

console.log('Store boundary checks passed.');
