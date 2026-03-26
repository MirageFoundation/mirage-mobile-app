#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/pages";
const SOFT_WARNING = 400;
const STRONG_REFACTOR = 600;
const FOCUS_EXTENSIONS = new Set([".ts", ".tsx"]);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (![...FOCUS_EXTENSIONS].some((ext) => entry.name.endsWith(ext))) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function countLines(path) {
  return readFileSync(path, "utf8").split("\n").length;
}

const files = walk(ROOT)
  .map((path) => ({ path, lines: countLines(path), mtime: statSync(path).mtimeMs }))
  .sort((a, b) => b.lines - a.lines);

const warnings = files.filter((file) => file.lines > SOFT_WARNING);
const strong = files.filter((file) => file.lines > STRONG_REFACTOR);

console.log("Page file size report");
console.log(`- soft warning threshold: > ${SOFT_WARNING}`);
console.log(`- strong refactor threshold: > ${STRONG_REFACTOR}`);
console.log("");

for (const file of files.slice(0, 25)) {
  const label = file.lines > STRONG_REFACTOR ? "STRONG" : file.lines > SOFT_WARNING ? "WARN" : "ok";
  console.log(`${String(file.lines).padStart(4)}  [${label}]  ${file.path}`);
}

console.log("");
console.log(`Warnings: ${warnings.length}`);
console.log(`Strong refactor candidates: ${strong.length}`);
