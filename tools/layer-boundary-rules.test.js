import { describe, expect, test } from "bun:test";

import { hasRuntimeModuleReference } from "./layer-boundary-rules.mjs";

const PAGES_BARREL = "@/src/pages";

describe("runtime barrel boundary detection", () => {
  test("detects static, dynamic, re-export, and require references", () => {
    const references = [
      'import { HomeScreen } from "@/src/pages";',
      'const pages = import("@/src/pages");',
      'export { HomeScreen } from "@/src/pages";',
      'const pages = require("@/src/pages");',
    ];

    for (const source of references) {
      expect(hasRuntimeModuleReference(source, PAGES_BARREL)).toBe(true);
    }
  });

  test("allows type-only references and direct module imports", () => {
    const allowed = [
      'import type { Post } from "@/src/pages";',
      'export type { Post } from "@/src/pages";',
      'import { HomeScreen } from "@/src/pages/home-screen";',
    ];

    for (const source of allowed) {
      expect(hasRuntimeModuleReference(source, PAGES_BARREL)).toBe(false);
    }
  });
});
