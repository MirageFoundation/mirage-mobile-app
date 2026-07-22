#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const LAYER_DIRS = ["components", "providers", "hooks", "services"];
const importPattern = /import(?:[\s\S]*?)from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
const FEATURE_OWNED_EXPORTS = ["ProfileAboutTab", "UserProfileMenuSheet"];
const FEATURE_IMPLEMENTATION_SPECIFIERS = [
  "@/src/pages/profile/profile-about-tab",
  "@/src/pages/user/user-profile-menu-sheet",
];

function exists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

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

function importsPageModule(specifier) {
  return (
    specifier.startsWith("@/src/pages") ||
    specifier.startsWith("@/pages") ||
    specifier.startsWith("../pages") ||
    specifier.startsWith("./pages") ||
    specifier.includes("/pages/")
  );
}

const failures = [];
const moleculesBarrel = readFileSync(
  join(ROOT, "src", "components", "molecules", "index.ts"),
  "utf8",
);

for (const exportName of FEATURE_OWNED_EXPORTS) {
  if (moleculesBarrel.includes(exportName)) {
    failures.push(
      `src/components/molecules/index.ts: broad barrel exports feature-owned ${exportName}`,
    );
  }
}

const routeRootFiles = walk(join(ROOT, "app"));
const rootLayout = join(ROOT, "src", "navigation", "root-layout.tsx");
if (statSync(rootLayout).isFile()) routeRootFiles.push(rootLayout);

for (const file of routeRootFiles) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, "utf8");
  for (const specifier of FEATURE_IMPLEMENTATION_SPECIFIERS) {
    if (text.includes(specifier)) {
      failures.push(`${rel}: route/root imports feature implementation ${specifier}`);
    }
  }
}

for (const layer of LAYER_DIRS) {
  const dir = join(ROOT, "src", layer);
  if (!exists(dir)) continue;

  for (const file of walk(dir)) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      if (importsPageModule(specifier)) {
        failures.push(`${rel}: non-page layer imports page module ${specifier}`);
      }
      if (layer === "components" && specifier === "expo-router") {
        failures.push(`${rel}: reusable component imports expo-router`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Layer boundary guardrail failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Layer boundary guardrail passed.");
