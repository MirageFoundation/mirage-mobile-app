#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const MAX_APP_LINES = 120;
const MAX_PAGE_CONTAINER_LINES = 600;
const WARN_IMPLEMENTATION_LINES = 1000;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || ["node_modules", "dist", "build"].includes(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if ([...SOURCE_EXTENSIONS].some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineCount(file) {
  return readFileSync(file, "utf8").split("\n").length;
}

function exists(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const failures = [];
const warnings = [];

const appDir = join(ROOT, "app");
if (exists(appDir)) {
  for (const file of walk(appDir)) {
    const rel = relative(ROOT, file);
    const lines = lineCount(file);
    if (lines > MAX_APP_LINES) {
      failures.push(`${rel}: ${lines} lines exceeds app route limit ${MAX_APP_LINES}`);
    }
  }
}

const pagesDir = join(ROOT, "src", "pages");
if (exists(pagesDir)) {
  for (const file of walk(pagesDir)) {
    const rel = relative(ROOT, file);
    const base = rel.split("/").pop() ?? rel;
    const lines = lineCount(file);
    const isContainer = /(?:-page|-screen)\.tsx?$/.test(base) && !base.includes("-content");
    if (isContainer && lines > MAX_PAGE_CONTAINER_LINES) {
      failures.push(`${rel}: ${lines} lines exceeds page container limit ${MAX_PAGE_CONTAINER_LINES}`);
    }
    if (!isContainer && lines > WARN_IMPLEMENTATION_LINES) {
      warnings.push(`${rel}: ${lines} lines is a large implementation file`);
    }
  }
}

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}

if (failures.length > 0) {
  console.error("File-size guardrail failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("File-size guardrail passed.");
if (warnings.length > 0) {
  console.log(`${warnings.length} large implementation file(s) reported as warnings.`);
}
