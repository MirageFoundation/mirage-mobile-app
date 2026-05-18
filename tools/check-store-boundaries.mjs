#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const STORE_DIR = join(ROOT, "src", "stores");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
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

const failures = [];
const importPattern = /import(?:[\s\S]*?)from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

if (exists(STORE_DIR)) {
  for (const file of walk(STORE_DIR)) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      if (specifier.startsWith("@/src/pages") || specifier.startsWith("@/src/components")) {
        failures.push(`${rel}: store imports forbidden UI/page module ${specifier}`);
      }
      if (specifier.startsWith("../pages") || specifier.startsWith("./pages") || specifier.includes("/pages/")) {
        failures.push(`${rel}: store imports page module ${specifier}`);
      }
      if (specifier.startsWith("../components") || specifier.startsWith("./components") || specifier.includes("/components/")) {
        failures.push(`${rel}: store imports component module ${specifier}`);
      }
    }

    if (/\buse(Query|InfiniteQuery|Mutation)\s*\(/.test(text)) {
      failures.push(`${rel}: store contains TanStack hook usage`);
    }
    if (/\bqueryClient\b/.test(text)) {
      failures.push(`${rel}: store contains queryClient orchestration`);
    }
  }
}

if (failures.length > 0) {
  console.error("Store boundary guardrail failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Store boundary guardrail passed.");
