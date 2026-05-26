#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");
const NAV_DIR = join(ROOT, "src", "navigation");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

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

if (!exists(NAV_DIR)) {
  failures.push("src/navigation directory is missing");
} else {
  for (const required of ["route-map.ts", "linking.ts", "guarded-router.ts", "auth-navigation.ts"]) {
    try {
      statSync(join(NAV_DIR, required));
    } catch {
      failures.push(`src/navigation/${required} is missing`);
    }
  }
}

if (exists(SRC_DIR)) {
  for (const file of walk(SRC_DIR)) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    const isNavigation = rel.startsWith("src/navigation/");
    const isCompatibilityWrapper = rel === "src/hooks/use-router.ts" || rel === "src/utils/guarded-router.ts";

    for (const match of text.matchAll(/import\s+\{[^}]*\brouter\b[^}]*\}\s+from\s+["']expo-router["']/g)) {
      if (!isNavigation) {
        failures.push(`${rel}:${lineForIndex(text, match.index ?? 0)} imports router directly from expo-router`);
      }
    }

    if (!isCompatibilityWrapper && text.includes("@/src/hooks/use-router")) {
      failures.push(`${rel}: imports legacy use-router wrapper; use @/src/navigation/guarded-router`);
    }
    if (!isCompatibilityWrapper && text.includes("@/src/utils/guarded-router")) {
      failures.push(`${rel}: imports legacy guarded-router wrapper; use @/src/navigation/guarded-router`);
    }

    for (const match of text.matchAll(/Linking\.addEventListener\s*\(\s*["']url["']/g)) {
      if (!isNavigation) {
        failures.push(`${rel}:${lineForIndex(text, match.index ?? 0)} registers URL listener outside src/navigation`);
      }
    }
  }
}

const routeMapPath = join(NAV_DIR, "route-map.ts");
try {
  const routeMap = readFileSync(routeMapPath, "utf8");
  for (const expected of [
    "export function resolveMirageUrl",
    "export function mapMiragePathToRoute",
    "export function isAppRoute",
    "prefix === \"p\"",
    "prefix === \"signup\"",
    "route: `/(auth)/username",
  ]) {
    if (!routeMap.includes(expected)) {
      failures.push(`src/navigation/route-map.ts missing expected route-map marker: ${expected}`);
    }
  }
} catch {
  // Already reported above.
}

if (failures.length > 0) {
  console.error("Navigation guardrail failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Navigation guardrail passed.");
