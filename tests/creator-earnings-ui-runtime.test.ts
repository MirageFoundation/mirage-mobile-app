// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

describe("creator earnings UI runtime", () => {
  test("registers authenticated route and settings entry", () => {
    expect(source("app/(app)/creator-earnings.tsx")).toContain("CreatorEarningsScreen");
    expect(source("src/navigation/route-map.ts")).toContain("/creator-earnings");
    expect(source("src/navigation/route-map.ts")).toContain("creatorEarnings");
    expect(source("src/navigation/app-stack-layout.tsx")).toContain("creator-earnings");
    expect(source("src/pages/settings/settings-content.tsx")).toContain("/creator-earnings");
    expect(source("src/pages/settings/settings-content.tsx")).toContain("Creator Earnings");
  });

  test("claimable and history tabs use exact sorts and claim phases", () => {
    const controller = source("src/pages/creator-earnings/use-creator-earnings-controller.ts");
    expect(controller).toContain('sort: "claim_deadline_asc"');
    expect(controller).toContain('sort: "epoch_desc"');
    expect(controller).toContain("claimable_only: true");
    expect(controller).toContain("claimable_only: false");
    expect(controller).toContain("resumeTxHash");
    expect(controller).toContain("retainedSelection");
    const content = source("src/pages/creator-earnings/creator-earnings-content.tsx");
    expect(content).toContain("Claimable");
    expect(content).toContain("History");
    expect(content).toContain("Check again");
    expect(content).toContain("Loading earnings");
    expect(content).toContain("Failed to load earnings");
    expect(content).toContain("No claimable earnings");
    expect(content).toContain("Load more");
    expect(content).toContain("submitting");
    expect(content).toContain("confirming");
    expect(content).toContain("delivered_syncing");
    expect(source("src/pages/creator-earnings/creator-earnings-row.tsx")).toContain(
      "formatMirageAmount(remaining)",
    );
    expect(source("src/pages/creator-earnings/creator-earnings-row.tsx")).toContain("claimed_height");
    expect(source("src/pages/creator-earnings/creator-earnings-targets.tsx")).toContain(
      "Load more targets",
    );
  });

  test("creator-earnings runtime never uses oldest/newest sort aliases", () => {
    const files = [
      "src/pages/creator-earnings/use-creator-earnings-controller.ts",
      "src/pages/creator-earnings/creator-earnings-content.tsx",
      "src/api/read/endpoints/creator-earnings.ts",
      "src/api/read/hooks/use-creator-earnings.ts",
      "src/api/write/endpoints/creator-earnings.ts",
    ];
    const hits = [];
    for (const rel of files) {
      const text = source(rel);
      if (text.includes('"oldest"') || text.includes("'oldest'") || text.includes('"newest"') || text.includes("'newest'")) {
        hits.push(rel);
      }
    }
    expect(hits).toEqual([]);
  });
});
