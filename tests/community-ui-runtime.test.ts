// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
  }
  return files;
}

const LEGACY_MIGRATION_READERS = new Set([
  "src/stores/draft-migration.ts",
  "src/stores/pending-posts-lifecycle.ts",
  "src/stores/persisted-community-post.ts",
  "src/api/cache/persisted-post-cache.ts",
]);

describe("community UI runtime cutover", () => {
  test("rejects leftover topic routes and runtime names outside migration readers", () => {
    const root = join(import.meta.dir, "../src");
    const files = walk(root);
    const banned = ["handleFollowTopic", "requestBlockTopic", "/topic/", `"/topics"`, `'/topics'`, "/t/"];
    const hits = [];
    for (const file of files) {
      const rel = file.slice(join(import.meta.dir, "..").length + 1);
      if (rel === "src/navigation/route-map.ts") continue;
      const text = readFileSync(file, "utf8");
      for (const token of banned) {
        if (text.includes(token)) hits.push(`${rel}:${token}`);
      }
      if (text.includes("Post.topic") && !LEGACY_MIGRATION_READERS.has(rel)) {
        hits.push(`${rel}:Post.topic`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("community list uses infinite communities and Join/Joined labels", () => {
    const list = source("src/pages/community/community-list-content.tsx");
    const row = source("src/pages/community/community-list-row.tsx");
    expect(list).toContain("useInfiniteCommunities");
    expect(list).toContain("communityPath");
    expect(list).toContain("handleToggleCommunityMembership");
    expect(row).toContain("Joined");
    expect(row).toContain("Join");
    expect(row).toContain("communityLabel");
    expect(list).not.toContain("handleFollowTopic");
  });

  test("community detail treats a valid zero-post community as empty, not 404", () => {
    const content = source("src/pages/community/community-feed-content.tsx");
    const controller = source("src/pages/community/use-community-feed-controller.ts");
    expect(controller).toContain("useCommunity");
    expect(controller).toContain("useInfinitePosts");
    expect(controller).toContain("isRoutableCommunitySlug");
    expect(content).toContain("Failed to load community");
    expect(content).toContain("Failed to load posts");
    expect(content).toContain("No posts yet");
    expect(content).toContain("Community not found");
    expect(content).toContain("feedScreen=\"community\"");
  });

  test("lens picker is default/raw plus team list options", () => {
    const picker = source("src/pages/community/community-lens-picker.tsx");
    expect(picker).toContain('lens: "default"');
    expect(picker).toContain('lens: "raw"');
    expect(picker).toContain("collectDetailTeamLensOptions");
    expect(picker).toContain("collectTeamListLensOptions");
  });
});
